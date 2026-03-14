export type CaptionSourceType = 'mic' | 'system' | 'file';
export type CaptionSessionStatus =
  | 'idle'
  | 'capturing'
  | 'live-capturing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface CaptionSegment {
  id: string;
  sessionId: string;
  text: string;
  language: string;
  confidence: number;
  startTimeMs: number;
  endTimeMs: number;
  wordTimestamps: WordTimestamp[];
  createdAt: string;
}

export interface CaptionSession {
  id: string;
  language: string;
  sourceType: CaptionSourceType;
  sourceFile?: string;
  deviceName?: string;
  whisperModel: string;
  durationSeconds: number;
  segmentCount: number;
  wordCount: number;
  status: CaptionSessionStatus;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  sampleRate: number;
  channels: number;
}

export interface WhisperInfo {
  isAvailable: boolean;
  binaryPath?: string;
  modelPath?: string;
  modelName?: string;
}

export interface CaptionStatus {
  isCapturing: boolean;
  isLiveCapturing: boolean;
  isTranscribing: boolean;
  activeSessionId?: string;
  deviceName?: string;
}

// ── Live Caption Types ────────────────────────────────────

export interface LiveSegmentEvent {
  sessionId: string;
  text: string;
  startMs: number;
  endMs: number;
  isPartial: boolean;
  segmentIndex: number;
}

export interface RawLiveSegmentEvent {
  session_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  is_partial: boolean;
  segment_index: number;
}

export function mapLiveSegment(raw: RawLiveSegmentEvent): LiveSegmentEvent {
  return {
    sessionId: raw.session_id,
    text: raw.text,
    startMs: raw.start_ms,
    endMs: raw.end_ms,
    isPartial: raw.is_partial,
    segmentIndex: raw.segment_index,
  };
}

export interface TranscriptionResult {
  session: CaptionSession;
  segments: CaptionSegment[];
}

// ── Model Download Types ──────────────────────────────────

export interface AvailableModel {
  id: string;
  name: string;
  sizeMb: number;
  description: string;
  isEnglishOnly: boolean;
  isDownloaded: boolean;
  localPath?: string;
  speed: string;
  accuracy: string;
}

export interface DownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface RawAvailableModel {
  id: string;
  name: string;
  size_mb: number;
  description: string;
  is_english_only: boolean;
  is_downloaded: boolean;
  local_path: string | null;
  speed: string;
  accuracy: string;
}

// ── Model Compatibility ───────────────────────────────────

export interface ModelCompatibility {
  isCompatible: boolean;
  currentModel: string | null;
  suggestedModels: AvailableModel[];
}

export interface RawModelCompatibility {
  is_compatible: boolean;
  current_model: string | null;
  suggested_models: RawAvailableModel[];
}

export function mapModelCompatibility(raw: RawModelCompatibility): ModelCompatibility {
  return {
    isCompatible: raw.is_compatible,
    currentModel: raw.current_model,
    suggestedModels: (raw.suggested_models ?? []).map(mapAvailableModel),
  };
}

// ── Download Progress ─────────────────────────────────────

export interface RawDownloadProgress {
  model_id: string;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export function mapAvailableModel(raw: RawAvailableModel): AvailableModel {
  return {
    id: raw.id,
    name: raw.name,
    sizeMb: raw.size_mb,
    description: raw.description,
    isEnglishOnly: raw.is_english_only,
    isDownloaded: raw.is_downloaded,
    localPath: raw.local_path ?? undefined,
    speed: raw.speed,
    accuracy: raw.accuracy,
  };
}

export function mapDownloadProgress(raw: RawDownloadProgress): DownloadProgress {
  return {
    modelId: raw.model_id,
    downloadedBytes: raw.downloaded_bytes,
    totalBytes: raw.total_bytes,
    percent: raw.percent,
  };
}

// ── Raw types from Rust IPC (snake_case) ──────────────────

export interface RawWordTimestamp {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface RawCaptionSegment {
  id: string;
  session_id: string;
  text: string;
  language: string;
  confidence: number;
  start_time_ms: number;
  end_time_ms: number;
  word_timestamps: RawWordTimestamp[];
  created_at: string;
}

export interface RawCaptionSession {
  id: string;
  language: string;
  source_type: string;
  source_file: string | null;
  device_name: string | null;
  whisper_model: string;
  duration_seconds: number;
  segment_count: number;
  word_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RawAudioDevice {
  id: string;
  name: string;
  is_default: boolean;
  sample_rate: number;
  channels: number;
}

export interface RawWhisperInfo {
  is_available: boolean;
  binary_path: string | null;
  model_path: string | null;
  model_name: string | null;
}

export interface RawCaptionStatus {
  is_capturing: boolean;
  is_live_capturing: boolean;
  is_transcribing: boolean;
  active_session_id: string | null;
  device_name: string | null;
}

export interface RawTranscriptionResult {
  session: RawCaptionSession;
  segments: RawCaptionSegment[];
}

// ── Mappers ───────────────────────────────────────────────

function mapWordTimestamp(raw: RawWordTimestamp): WordTimestamp {
  return {
    word: raw.word,
    startMs: raw.start_ms,
    endMs: raw.end_ms,
    confidence: raw.confidence,
  };
}

export function mapSegment(raw: RawCaptionSegment): CaptionSegment {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    text: raw.text,
    language: raw.language,
    confidence: raw.confidence,
    startTimeMs: raw.start_time_ms,
    endTimeMs: raw.end_time_ms,
    wordTimestamps: (raw.word_timestamps ?? []).map(mapWordTimestamp),
    createdAt: raw.created_at,
  };
}

export function mapSession(raw: RawCaptionSession): CaptionSession {
  return {
    id: raw.id,
    language: raw.language,
    sourceType: raw.source_type as CaptionSourceType,
    sourceFile: raw.source_file ?? undefined,
    deviceName: raw.device_name ?? undefined,
    whisperModel: raw.whisper_model,
    durationSeconds: raw.duration_seconds,
    segmentCount: raw.segment_count,
    wordCount: raw.word_count,
    status: raw.status as CaptionSessionStatus,
    errorMessage: raw.error_message ?? undefined,
    createdAt: raw.created_at,
    completedAt: raw.completed_at ?? undefined,
  };
}

export function mapDevice(raw: RawAudioDevice): AudioDevice {
  return {
    id: raw.id,
    name: raw.name,
    isDefault: raw.is_default,
    sampleRate: raw.sample_rate,
    channels: raw.channels,
  };
}

export function mapWhisperInfo(raw: RawWhisperInfo): WhisperInfo {
  return {
    isAvailable: raw.is_available,
    binaryPath: raw.binary_path ?? undefined,
    modelPath: raw.model_path ?? undefined,
    modelName: raw.model_name ?? undefined,
  };
}

export function mapCaptionStatus(raw: RawCaptionStatus): CaptionStatus {
  return {
    isCapturing: raw.is_capturing,
    isLiveCapturing: raw.is_live_capturing,
    isTranscribing: raw.is_transcribing,
    activeSessionId: raw.active_session_id ?? undefined,
    deviceName: raw.device_name ?? undefined,
  };
}

export function mapTranscriptionResult(raw: RawTranscriptionResult): TranscriptionResult {
  return {
    session: mapSession(raw.session),
    segments: (raw.segments ?? []).map(mapSegment),
  };
}

// ── Utilities ─────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimestampMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
}
