import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface WhisperInstallStatusType {
  binaryDetected: boolean;
  binaryPath: string | null;
  homebrewAvailable: boolean;
  homebrewPath: string | null;
  canAutoInstall: boolean;
  platform: string;
  arch: string;
}
import type {
  AudioDevice,
  CaptionSession,
  CaptionSegment,
  CaptionStatus,
  WhisperInfo,
  TranscriptionResult,
  AvailableModel,
  DownloadProgress,
  LiveSegmentEvent,
  RawAudioDevice,
  RawCaptionSession,
  RawCaptionSegment,
  RawCaptionStatus,
  RawWhisperInfo,
  RawTranscriptionResult,
  RawAvailableModel,
  RawLiveSegmentEvent,
} from '../types';
import {
  mapDevice,
  mapSession,
  mapSegment,
  mapCaptionStatus,
  mapWhisperInfo,
  mapTranscriptionResult,
  mapAvailableModel,
  mapLiveSegment,
} from '../types';

// ── View Enum ─────────────────────────────────────────────

export type CaptionView = 'sessions' | 'capture' | 'live-capture' | 'session-detail';

// ── State ─────────────────────────────────────────────────

interface CaptionState {
  // Navigation
  view: CaptionView;

  // Devices
  devices: AudioDevice[];
  isLoadingDevices: boolean;
  selectedDeviceId: string | null;

  // Whisper
  whisperInfo: WhisperInfo | null;
  isCheckingWhisper: boolean;
  isConfiguringWhisper: boolean;

  // Whisper install
  whisperInstallStatus: WhisperInstallStatusType | null;
  isInstallingWhisper: boolean;
  whisperInstallMessage: string | null;
  isInstallingHomebrew: boolean;

  // Models
  availableModels: AvailableModel[];
  isLoadingModels: boolean;
  downloadProgress: DownloadProgress | null;
  isDownloading: boolean;

  // Capture status
  captionStatus: CaptionStatus | null;
  captureElapsed: number;
  captureLanguage: string;

  // Sessions
  sessions: CaptionSession[];
  isLoadingSessions: boolean;

  // Session detail
  activeSession: CaptionSession | null;
  activeSegments: CaptionSegment[];
  isLoadingSegments: boolean;

  // Transcription
  isTranscribing: boolean;

  // Live capture
  liveSegments: LiveSegmentEvent[];
  isLiveCapturing: boolean;
  activeModelId: string | null;

  // Error
  error: string | null;

  // ── Actions ─────────────────────────────────────────

  // Navigation
  setView: (view: CaptionView) => void;
  openSession: (session: CaptionSession) => void;
  goBack: () => void;

  // Devices
  fetchDevices: () => Promise<void>;
  setSelectedDevice: (id: string | null) => void;

  // Whisper
  checkWhisper: () => Promise<void>;
  configureWhisper: (binaryPath: string, modelPath: string, modelName?: string) => Promise<void>;
  checkWhisperInstallStatus: () => Promise<void>;
  autoDetectWhisper: () => Promise<boolean>;
  installWhisper: () => Promise<void>;
  installHomebrew: () => Promise<void>;
  setWhisperInstallMessage: (message: string | null) => void;

  // Models
  fetchAvailableModels: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<string | null>;
  deleteModel: (modelId: string) => Promise<void>;
  setDownloadProgress: (progress: DownloadProgress | null) => void;

  // Capture
  startCapture: (deviceId?: string, language?: string) => Promise<void>;
  stopCapture: () => Promise<CaptionSession | null>;
  refreshStatus: () => Promise<void>;
  setCaptureElapsed: (elapsed: number) => void;
  setCaptureLanguage: (lang: string) => void;

  // Sessions
  fetchSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Segments
  fetchSegments: (sessionId: string) => Promise<void>;

  // Transcription
  transcribeSession: (sessionId: string) => Promise<TranscriptionResult | null>;
  transcribeFile: (filePath: string, language?: string) => Promise<TranscriptionResult | null>;

  // Live capture
  startLiveCapture: (deviceId?: string, language?: string, modelId?: string) => Promise<void>;
  stopLiveCapture: () => Promise<CaptionSession | null>;
  addLiveSegment: (segment: LiveSegmentEvent) => void;
  clearLiveSegments: () => void;
  setActiveModel: (modelId: string) => Promise<void>;

  // Error
  clearError: () => void;
}

// ── Store ─────────────────────────────────────────────────

export const useCaptionStore = create<CaptionState>()(
  immer((set, get) => ({
    view: 'sessions',
    devices: [],
    isLoadingDevices: false,
    selectedDeviceId: null,
    whisperInfo: null,
    isCheckingWhisper: false,
    isConfiguringWhisper: false,
    whisperInstallStatus: null,
    isInstallingWhisper: false,
    whisperInstallMessage: null,
    isInstallingHomebrew: false,
    availableModels: [],
    isLoadingModels: false,
    downloadProgress: null,
    isDownloading: false,
    captionStatus: null,
    captureElapsed: 0,
    captureLanguage: 'auto',
    sessions: [],
    isLoadingSessions: false,
    activeSession: null,
    activeSegments: [],
    isLoadingSegments: false,
    isTranscribing: false,
    liveSegments: [],
    isLiveCapturing: false,
    activeModelId: null,
    error: null,

    // ── Navigation ──────────────────────────────────────

    setView: (view) => {
      set((s) => {
        s.view = view;
        s.error = null;
      });
    },

    openSession: (session) => {
      set((s) => {
        s.activeSession = session;
        s.activeSegments = [];
        s.view = 'session-detail';
        s.error = null;
      });
      get().fetchSegments(session.id);
    },

    goBack: () => {
      set((s) => {
        s.view = 'sessions';
        s.activeSession = null;
        s.activeSegments = [];
        s.error = null;
      });
    },

    // ── Devices ─────────────────────────────────────────

    fetchDevices: async () => {
      set((s) => {
        s.isLoadingDevices = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawAudioDevice[]>('caption_list_devices');
        const devices = raw.map(mapDevice);
        set((s) => {
          s.devices = devices;
          s.isLoadingDevices = false;
          if (!s.selectedDeviceId) {
            const defaultDevice = devices.find((d) => d.isDefault);
            s.selectedDeviceId = defaultDevice?.id ?? devices[0]?.id ?? null;
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingDevices = false;
        });
      }
    },

    setSelectedDevice: (id) => {
      set((s) => {
        s.selectedDeviceId = id;
      });
    },

    // ── Whisper ─────────────────────────────────────────

    checkWhisper: async () => {
      set((s) => {
        s.isCheckingWhisper = true;
      });
      try {
        const raw = await invoke<RawWhisperInfo>('caption_check_whisper');
        const info = mapWhisperInfo(raw);
        set((s) => {
          s.whisperInfo = info;
          s.isCheckingWhisper = false;
          // Initialize active model from settings
          if (info.modelName && !s.activeModelId) {
            s.activeModelId = info.modelName;
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isCheckingWhisper = false;
        });
      }
    },

    configureWhisper: async (binaryPath, modelPath, modelName) => {
      set((s) => {
        s.isConfiguringWhisper = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawWhisperInfo>('caption_configure_whisper', {
          binaryPath,
          modelPath,
          modelName: modelName ?? null,
        });
        set((s) => {
          s.whisperInfo = mapWhisperInfo(raw);
          s.isConfiguringWhisper = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isConfiguringWhisper = false;
        });
      }
    },

    // ── Whisper Install ──────────────────────────────────

    checkWhisperInstallStatus: async () => {
      try {
        const raw = await invoke<{
          binary_detected: boolean;
          binary_path: string | null;
          homebrew_available: boolean;
          homebrew_path: string | null;
          can_auto_install: boolean;
          platform: string;
          arch: string;
        }>('caption_whisper_install_status');
        set((s) => {
          s.whisperInstallStatus = {
            binaryDetected: raw.binary_detected,
            binaryPath: raw.binary_path,
            homebrewAvailable: raw.homebrew_available,
            homebrewPath: raw.homebrew_path,
            canAutoInstall: raw.can_auto_install,
            platform: raw.platform,
            arch: raw.arch,
          };
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    autoDetectWhisper: async () => {
      try {
        const path = await invoke<string | null>('caption_auto_detect_whisper');
        if (path) {
          // Re-check whisper to update whisperInfo
          await get().checkWhisper();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    installWhisper: async () => {
      set((s) => {
        s.isInstallingWhisper = true;
        s.whisperInstallMessage = null;
        s.error = null;
      });
      try {
        const binaryPath = await invoke<string>('caption_install_whisper');
        // Auto-configure with the installed binary
        set((s) => {
          s.isInstallingWhisper = false;
          s.whisperInstallMessage = null;
        });
        // Re-check whisper status
        await get().checkWhisperInstallStatus();
        await get().checkWhisper();
      } catch (err) {
        set((s) => {
          s.isInstallingWhisper = false;
          s.error = String(err);
        });
      }
    },

    installHomebrew: async () => {
      set((s) => {
        s.isInstallingHomebrew = true;
        s.whisperInstallMessage = null;
        s.error = null;
      });
      try {
        await invoke<string>('caption_install_homebrew');
        set((s) => {
          s.isInstallingHomebrew = false;
          s.whisperInstallMessage = null;
        });
        // Re-check install status (homebrew should now be available)
        await get().checkWhisperInstallStatus();
      } catch (err) {
        set((s) => {
          s.isInstallingHomebrew = false;
          s.error = String(err);
        });
      }
    },

    setWhisperInstallMessage: (message) => {
      set((s) => {
        s.whisperInstallMessage = message;
      });
    },

    // ── Models ────────────────────────────────────────────

    fetchAvailableModels: async () => {
      set((s) => {
        s.isLoadingModels = true;
      });
      try {
        const raw = await invoke<RawAvailableModel[]>('caption_list_available_models');
        set((s) => {
          s.availableModels = raw.map(mapAvailableModel);
          s.isLoadingModels = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingModels = false;
        });
      }
    },

    downloadModel: async (modelId) => {
      set((s) => {
        s.isDownloading = true;
        s.downloadProgress = null;
        s.error = null;
      });
      try {
        const path = await invoke<string>('caption_download_model', { modelId });
        set((s) => {
          s.isDownloading = false;
          s.downloadProgress = null;
          // Refresh model list
          const idx = s.availableModels.findIndex((m) => m.id === modelId);
          if (idx >= 0) {
            s.availableModels[idx].isDownloaded = true;
            s.availableModels[idx].localPath = path;
          }
        });
        return path;
      } catch (err) {
        set((s) => {
          s.isDownloading = false;
          s.downloadProgress = null;
          s.error = String(err);
        });
        return null;
      }
    },

    deleteModel: async (modelId) => {
      try {
        await invoke('caption_delete_model', { modelId });
        set((s) => {
          const idx = s.availableModels.findIndex((m) => m.id === modelId);
          if (idx >= 0) {
            s.availableModels[idx].isDownloaded = false;
            s.availableModels[idx].localPath = undefined;
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    setDownloadProgress: (progress) => {
      set((s) => {
        s.downloadProgress = progress;
      });
    },

    // ── Capture ─────────────────────────────────────────

    startCapture: async (deviceId, language) => {
      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawCaptionSession>('caption_start_capture', {
          deviceId: deviceId ?? null,
          language: language ?? get().captureLanguage,
        });
        const session = mapSession(raw);
        set((s) => {
          s.captionStatus = {
            isCapturing: true,
            isLiveCapturing: false,
            isTranscribing: false,
            activeSessionId: session.id,
            deviceName: session.deviceName,
          };
          s.captureElapsed = 0;
          s.view = 'capture';
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    stopCapture: async () => {
      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawCaptionSession>('caption_stop_capture');
        const session = mapSession(raw);
        set((s) => {
          s.captionStatus = {
            isCapturing: false,
            isLiveCapturing: false,
            isTranscribing: false,
            activeSessionId: undefined,
            deviceName: undefined,
          };
          s.captureElapsed = 0;
        });
        // Refresh the sessions list
        get().fetchSessions();
        return session;
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
        return null;
      }
    },

    refreshStatus: async () => {
      try {
        const raw = await invoke<RawCaptionStatus>('caption_get_status');
        set((s) => {
          s.captionStatus = mapCaptionStatus(raw);
        });
      } catch {
        // Silently fail — status polling is best effort
      }
    },

    setCaptureElapsed: (elapsed) => {
      set((s) => {
        s.captureElapsed = elapsed;
      });
    },

    setCaptureLanguage: (lang) => {
      set((s) => {
        s.captureLanguage = lang;
      });
    },

    // ── Sessions ────────────────────────────────────────

    fetchSessions: async () => {
      set((s) => {
        s.isLoadingSessions = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawCaptionSession[]>('caption_list_sessions', { limit: 100 });
        set((s) => {
          s.sessions = raw.map(mapSession);
          s.isLoadingSessions = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingSessions = false;
        });
      }
    },

    deleteSession: async (id) => {
      try {
        await invoke('caption_delete_session', { id });
        set((s) => {
          s.sessions = s.sessions.filter((sess) => sess.id !== id);
          if (s.activeSession?.id === id) {
            s.activeSession = null;
            s.activeSegments = [];
            s.view = 'sessions';
          }
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    // ── Segments ────────────────────────────────────────

    fetchSegments: async (sessionId) => {
      set((s) => {
        s.isLoadingSegments = true;
      });
      try {
        const raw = await invoke<RawCaptionSegment[]>('caption_get_segments', { sessionId });
        set((s) => {
          s.activeSegments = raw.map(mapSegment);
          s.isLoadingSegments = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingSegments = false;
        });
      }
    },

    // ── Transcription ───────────────────────────────────

    transcribeSession: async (sessionId) => {
      set((s) => {
        s.isTranscribing = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawTranscriptionResult>('caption_transcribe_session', {
          sessionId,
        });
        const result = mapTranscriptionResult(raw);
        set((s) => {
          s.isTranscribing = false;
          s.activeSession = result.session;
          s.activeSegments = result.segments;
          // Update the session in the list too
          const idx = s.sessions.findIndex((sess) => sess.id === sessionId);
          if (idx >= 0) s.sessions[idx] = result.session;
        });
        return result;
      } catch (err) {
        set((s) => {
          s.isTranscribing = false;
          s.error = String(err);
        });
        return null;
      }
    },

    transcribeFile: async (filePath, language) => {
      set((s) => {
        s.isTranscribing = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawTranscriptionResult>('caption_transcribe_file', {
          filePath,
          language: language ?? null,
        });
        const result = mapTranscriptionResult(raw);
        set((s) => {
          s.isTranscribing = false;
          s.activeSession = result.session;
          s.activeSegments = result.segments;
          s.sessions.unshift(result.session);
          s.view = 'session-detail';
        });
        return result;
      } catch (err) {
        set((s) => {
          s.isTranscribing = false;
          s.error = String(err);
        });
        return null;
      }
    },

    // ── Live Capture ──────────────────────────────────────

    startLiveCapture: async (deviceId, language, modelId) => {
      // Guard: clean up any existing listener before starting a new one
      if (_liveUnlisten) {
        _liveUnlisten();
        _liveUnlisten = null;
      }

      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawCaptionSession>('caption_start_live_capture', {
          deviceId: deviceId ?? null,
          language: language ?? get().captureLanguage,
          modelId: modelId ?? get().activeModelId ?? null,
        });
        const session = mapSession(raw);

        // Set up event listener for live segments
        const unlisten = await listen<RawLiveSegmentEvent>('caption:live-segment', (event) => {
          const segment = mapLiveSegment(event.payload);
          get().addLiveSegment(segment);
        });

        // Store unlisten fn for cleanup
        _liveUnlisten = unlisten;

        set((s) => {
          s.captionStatus = {
            isCapturing: false,
            isLiveCapturing: true,
            isTranscribing: false,
            activeSessionId: session.id,
            deviceName: session.deviceName,
          };
          s.isLiveCapturing = true;
          s.liveSegments = [];
          s.captureElapsed = 0;
          s.view = 'live-capture';
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    stopLiveCapture: async () => {
      set((s) => {
        s.error = null;
      });

      try {
        // Stop sidecar first — it may emit final segments during shutdown
        const raw = await invoke<RawCaptionSession>('caption_stop_live_capture');
        const session = mapSession(raw);

        // Clean up event listener AFTER stop resolves so final segments are captured
        if (_liveUnlisten) {
          _liveUnlisten();
          _liveUnlisten = null;
        }
        set((s) => {
          s.captionStatus = {
            isCapturing: false,
            isLiveCapturing: false,
            isTranscribing: false,
            activeSessionId: undefined,
            deviceName: undefined,
          };
          s.isLiveCapturing = false;
          s.captureElapsed = 0;
          // Navigate to session detail to see the result
          s.activeSession = session;
          s.view = 'session-detail';
        });
        get().fetchSessions();
        get().fetchSegments(session.id);
        return session;
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLiveCapturing = false;
        });
        return null;
      }
    },

    addLiveSegment: (segment) => {
      set((s) => {
        const existingIdx = s.liveSegments.findIndex(
          (seg) => seg.segmentIndex === segment.segmentIndex,
        );
        if (existingIdx >= 0) {
          s.liveSegments[existingIdx] = segment;
        } else {
          s.liveSegments.push(segment);
        }
      });
    },

    clearLiveSegments: () => {
      set((s) => {
        s.liveSegments = [];
      });
    },

    setActiveModel: async (modelId) => {
      try {
        const raw = await invoke<RawWhisperInfo>('caption_set_active_model', { modelId });
        set((s) => {
          s.whisperInfo = mapWhisperInfo(raw);
          s.activeModelId = modelId;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    // ── Error ───────────────────────────────────────────

    clearError: () => {
      set((s) => {
        s.error = null;
      });
    },
  })),
);

// Module-level variable to store the event unlisten function
let _liveUnlisten: UnlistenFn | null = null;
