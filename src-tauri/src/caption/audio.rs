use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tokio::sync::mpsc;

use super::types::AudioDevice;

// ── Device Enumeration ───────────────────────────────────

/// List all available audio input devices.
pub fn list_input_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();

    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate audio input devices: {e}"))?;

    let mut result = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown".into());
        let is_default = default_name.as_deref() == Some(&name);

        let (sample_rate, channels) = device
            .default_input_config()
            .map(|c| (c.sample_rate().0, c.channels()))
            .unwrap_or((44100, 1));

        result.push(AudioDevice {
            id: name.clone(),
            name,
            is_default,
            sample_rate,
            channels,
        });
    }
    Ok(result)
}

// ── Recording ────────────────────────────────────────────

/// Handle returned by `start_recording`.  Call `.stop()` to
/// finish recording and flush the WAV file.
pub struct RecordingHandle {
    stop_signal: Arc<AtomicBool>,
    join_handle: Option<std::thread::JoinHandle<Result<RecordingResult, String>>>,
}

impl RecordingHandle {
    /// Signal the capture thread to stop, join it, and return
    /// the recorded WAV path + duration.
    pub fn stop(mut self) -> Result<RecordingResult, String> {
        self.stop_signal.store(true, Ordering::Relaxed);
        self.join_handle
            .take()
            .ok_or_else(|| "Recording already stopped".to_string())?
            .join()
            .map_err(|_| "Recording thread panicked".to_string())?
    }
}

pub struct RecordingResult {
    pub path: PathBuf,
    pub duration_seconds: i64,
    pub sample_rate: u32,
    pub total_samples: usize,
}

/// Start recording from the given input device (or the default
/// device if `device_name` is `None`).  Audio is saved as a
/// mono 16-bit WAV file at the device's native sample rate.
///
/// Returns a `RecordingHandle` — call `.stop()` to finish.
pub fn start_recording(
    device_name: Option<&str>,
    output_path: PathBuf,
) -> Result<RecordingHandle, String> {
    let host = cpal::default_host();

    let device = match device_name {
        Some(name) => host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {e}"))?
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .ok_or_else(|| format!("Audio device not found: {name}"))?,
        None => host
            .default_input_device()
            .ok_or("No default audio input device available")?,
    };

    let supported = device
        .default_input_config()
        .map_err(|e| format!("No supported input config: {e}"))?;

    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.into();

    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();

    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let buf_writer = buffer.clone();

    // Spawn the capture thread ─ cpal streams are !Send on
    // some backends, so we keep the stream on a dedicated thread.
    let handle = std::thread::Builder::new()
        .name("audio-capture".into())
        .spawn(move || -> Result<RecordingResult, String> {
            let stream = build_input_stream(
                &device,
                &stream_config,
                sample_format,
                buf_writer,
            )?;

            stream
                .play()
                .map_err(|e| format!("Failed to start audio stream: {e}"))?;

            // Block until stop signal
            while !stop_clone.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            drop(stream);

            // ── Flush buffer to WAV ──────────────────────
            let raw = buffer
                .lock()
                .map_err(|e| format!("Buffer lock failed: {e}"))?
                .clone();

            let mono = to_mono(&raw, channels);
            let duration_seconds =
                mono.len() as f64 / sample_rate as f64;

            write_wav(&output_path, &mono, sample_rate)?;

            Ok(RecordingResult {
                path: output_path,
                duration_seconds: duration_seconds as i64,
                sample_rate,
                total_samples: mono.len(),
            })
        })
        .map_err(|e| format!("Failed to spawn capture thread: {e}"))?;

    Ok(RecordingHandle {
        stop_signal: stop,
        join_handle: Some(handle),
    })
}

// ── Internals ────────────────────────────────────────────

fn build_input_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    format: cpal::SampleFormat,
    buffer: Arc<Mutex<Vec<f32>>>,
) -> Result<cpal::Stream, String> {
    let err_fn = |e: cpal::StreamError| {
        eprintln!("[caption] audio stream error: {e}");
    };

    match format {
        cpal::SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut buf) = buffer.lock() {
                        buf.extend_from_slice(data);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build f32 stream: {e}")),

        cpal::SampleFormat::I16 => {
            let buf = buffer;
            device
                .build_input_stream(
                    config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut b) = buf.lock() {
                            b.extend(data.iter().map(|&s| s as f32 / 32768.0));
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build i16 stream: {e}"))
        }

        cpal::SampleFormat::U16 => {
            let buf = buffer;
            device
                .build_input_stream(
                    config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut b) = buf.lock() {
                            b.extend(
                                data.iter()
                                    .map(|&s| (s as f32 - 32768.0) / 32768.0),
                            );
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build u16 stream: {e}"))
        }

        other => Err(format!("Unsupported sample format: {other:?}")),
    }
}

/// Mix multi-channel audio down to mono.
fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let ch = channels as usize;
    samples
        .chunks(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

// ── Streaming Capture ────────────────────────────────────

/// Handle returned by `start_streaming_capture`. Call `.stop()`
/// to end capture.
pub struct StreamingHandle {
    stop_signal: Arc<AtomicBool>,
    join_handle: Option<std::thread::JoinHandle<Result<StreamingResult, String>>>,
}

impl StreamingHandle {
    pub fn stop(mut self) -> Result<StreamingResult, String> {
        self.stop_signal.store(true, Ordering::Relaxed);
        self.join_handle
            .take()
            .ok_or_else(|| "Streaming already stopped".to_string())?
            .join()
            .map_err(|_| "Streaming thread panicked".to_string())?
    }
}

pub struct StreamingResult {
    pub duration_seconds: i64,
    pub total_samples: usize,
    pub wav_path: Option<PathBuf>,
}

/// Resample from `source_rate` to 16kHz using linear interpolation.
fn resample_to_16k(samples: &[f32], source_rate: u32) -> Vec<f32> {
    if source_rate == 16000 {
        return samples.to_vec();
    }
    let ratio = source_rate as f64 / 16000.0;
    let output_len = (samples.len() as f64 / ratio) as usize;
    (0..output_len)
        .map(|i| {
            let src_idx = i as f64 * ratio;
            let idx = src_idx as usize;
            let frac = (src_idx - idx as f64) as f32;
            let a = samples.get(idx).copied().unwrap_or(0.0);
            let b = samples.get(idx + 1).copied().unwrap_or(a);
            a + (b - a) * frac
        })
        .collect()
}

/// Convert f32 mono samples to i16 LE bytes (the format whisper.cpp
/// expects on stdin in --stream mode).
fn f32_to_i16_le_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let i = (s * 32767.0).clamp(-32768.0, 32767.0) as i16;
        bytes.extend_from_slice(&i.to_le_bytes());
    }
    bytes
}

/// Start streaming audio capture. Audio is resampled to 16kHz mono,
/// converted to i16 LE PCM, and sent through `pcm_tx` in ~100ms chunks.
/// Simultaneously writes a WAV file for archival.
///
/// Returns a `StreamingHandle` — call `.stop()` to finish.
pub fn start_streaming_capture(
    device_name: Option<&str>,
    pcm_tx: mpsc::Sender<Vec<u8>>,
    wav_path: Option<PathBuf>,
) -> Result<StreamingHandle, String> {
    let host = cpal::default_host();

    let device = match device_name {
        Some(name) => host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {e}"))?
            .find(|d| d.name().map(|n| n == name).unwrap_or(false))
            .ok_or_else(|| format!("Audio device not found: {name}"))?,
        None => host
            .default_input_device()
            .ok_or("No default audio input device available")?,
    };

    let supported = device
        .default_input_config()
        .map_err(|e| format!("No supported input config: {e}"))?;

    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.into();

    let stop = Arc::new(AtomicBool::new(false));
    let stop_clone = stop.clone();

    // Buffer for accumulating samples before resampling + sending
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let buf_writer = buffer.clone();

    // Also accumulate all samples for WAV archival
    let archive_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let archive_writer = archive_buf.clone();

    let handle = std::thread::Builder::new()
        .name("audio-stream-capture".into())
        .spawn(move || -> Result<StreamingResult, String> {
            let stream = build_input_stream(
                &device,
                &stream_config,
                sample_format,
                buf_writer,
            )?;

            stream
                .play()
                .map_err(|e| format!("Failed to start audio stream: {e}"))?;

            let mut total_16k_samples: usize = 0;
            // Target chunk size: 100ms at 16kHz = 1600 samples
            let chunk_threshold = (sample_rate as usize * channels as usize) / 10; // 100ms of raw samples

            while !stop_clone.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(50));

                // Drain accumulated samples
                let raw = {
                    let mut buf = buffer
                        .lock()
                        .map_err(|e| format!("Buffer lock failed: {e}"))?;
                    if buf.len() < chunk_threshold {
                        continue;
                    }
                    let data = buf.clone();
                    buf.clear();
                    data
                };

                if raw.is_empty() {
                    continue;
                }

                // Save to archive buffer
                if let Ok(mut archive) = archive_buf.lock() {
                    archive.extend_from_slice(&raw);
                }

                // Convert to mono, resample to 16kHz, convert to i16 bytes
                let mono = to_mono(&raw, channels);
                let resampled = resample_to_16k(&mono, sample_rate);
                let pcm_bytes = f32_to_i16_le_bytes(&resampled);

                total_16k_samples += resampled.len();

                // Send through channel (blocking: waits for space)
                if pcm_tx.blocking_send(pcm_bytes).is_err() {
                    eprintln!("[audio-stream] PCM channel closed, stopping");
                    break;
                }
            }

            drop(stream);

            // Drain any remaining samples
            if let Ok(mut buf) = buffer.lock() {
                if !buf.is_empty() {
                    let remaining = buf.clone();
                    buf.clear();

                    if let Ok(mut archive) = archive_buf.lock() {
                        archive.extend_from_slice(&remaining);
                    }

                    let mono = to_mono(&remaining, channels);
                    let resampled = resample_to_16k(&mono, sample_rate);
                    let pcm_bytes = f32_to_i16_le_bytes(&resampled);
                    total_16k_samples += resampled.len();
                    let _ = pcm_tx.blocking_send(pcm_bytes);
                }
            }

            // Write archival WAV
            let saved_path = if let Some(ref path) = wav_path {
                if let Ok(archive) = archive_writer.lock() {
                    let mono = to_mono(&archive, channels);
                    if write_wav(path, &mono, sample_rate).is_ok() {
                        Some(path.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            let duration = total_16k_samples as f64 / 16000.0;

            Ok(StreamingResult {
                duration_seconds: duration as i64,
                total_samples: total_16k_samples,
                wav_path: saved_path,
            })
        })
        .map_err(|e| format!("Failed to spawn streaming capture thread: {e}"))?;

    Ok(StreamingHandle {
        stop_signal: stop,
        join_handle: Some(handle),
    })
}

/// Write a mono f32 buffer to a 16-bit PCM WAV file.
fn write_wav(path: &PathBuf, mono: &[f32], sample_rate: u32) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer =
        hound::WavWriter::create(path, spec).map_err(|e| format!("WAV create error: {e}"))?;

    for &sample in mono {
        let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
        writer
            .write_sample(s16)
            .map_err(|e| format!("WAV write error: {e}"))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {e}"))?;

    Ok(())
}
