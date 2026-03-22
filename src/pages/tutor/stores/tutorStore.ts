import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ConversationMode,
  ConversationSummary,
  MessageData,
  ModeInfo,
  RawConversationSummary,
  RawMessageData,
  RawModeInfo,
  RawScenario,
  RawSendMessageResult,
  Scenario,
} from '../types';
import {
  mapConversation,
  mapMessage,
  mapModeInfo,
  mapScenario,
  mapSendMessageResult,
} from '../types';

// ── Params ──────────────────────────────────────────────

interface StartConversationParams {
  title?: string;
  language: string;
  cefrLevel: string;
  provider?: string;
  model?: string;
  mode?: ConversationMode;
  topic?: string;
  scenarioId?: string;
  deckId?: string;
}

// ── State ───────────────────────────────────────────────

interface TutorState {
  // Navigation
  conversations: ConversationSummary[];
  activeConversation: ConversationSummary | null;
  messages: MessageData[];

  // Loading
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  // Streaming
  streamingContent: string;
  isStreaming: boolean;
  isSending: boolean;

  // Voice
  isRecording: boolean;
  isTranscribing: boolean;
  autoSpeak: boolean;

  // Modes
  modes: ModeInfo[];
  scenarios: Scenario[];

  // Error
  error: string | null;

  // Actions
  fetchConversations: () => Promise<void>;
  startConversation: (params: StartConversationParams) => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  closeConversation: () => void;
  sendMessage: (content: string) => Promise<void>;
  endConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  speakText: (text: string) => Promise<void>;
  toggleAutoSpeak: () => void;
  fetchModes: () => Promise<void>;
  fetchScenarios: () => Promise<void>;
  clearError: () => void;
}

// ── Store ───────────────────────────────────────────────

export const useTutorStore = create<TutorState>()(
  immer((set, get) => ({
    conversations: [],
    activeConversation: null,
    messages: [],
    isLoadingConversations: false,
    isLoadingMessages: false,
    streamingContent: '',
    isStreaming: false,
    isSending: false,
    isRecording: false,
    isTranscribing: false,
    autoSpeak: false,
    modes: [],
    scenarios: [],
    error: null,

    fetchConversations: async () => {
      set((s) => {
        s.isLoadingConversations = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawConversationSummary[]>('tutor_list_conversations', {
          status: null,
        });
        set((s) => {
          s.conversations = raw.map(mapConversation);
          s.isLoadingConversations = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingConversations = false;
        });
      }
    },

    startConversation: async (params) => {
      set((s) => {
        s.error = null;
      });
      try {
        const raw = await invoke<RawConversationSummary>('tutor_start_conversation', {
          title: params.title ?? null,
          language: params.language,
          cefrLevel: params.cefrLevel,
          provider: params.provider ?? null,
          model: params.model ?? null,
          mode: params.mode ?? null,
          topic: params.topic ?? null,
          scenarioId: params.scenarioId ?? null,
          deckId: params.deckId ?? null,
        });
        const conv = mapConversation(raw);

        // Refresh list and auto-open the new conversation
        await get().fetchConversations();
        await get().openConversation(conv.id);
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    openConversation: async (id) => {
      set((s) => {
        s.isLoadingMessages = true;
        s.error = null;
      });
      try {
        const rawMessages = await invoke<RawMessageData[]>('tutor_get_messages', {
          conversationId: id,
        });

        const conv = get().conversations.find((c) => c.id === id);

        set((s) => {
          s.activeConversation = conv ?? null;
          s.messages = rawMessages.map(mapMessage);
          s.isLoadingMessages = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingMessages = false;
        });
      }
    },

    closeConversation: () => {
      set((s) => {
        s.activeConversation = null;
        s.messages = [];
        s.streamingContent = '';
        s.isStreaming = false;
      });
    },

    sendMessage: async (content) => {
      const conv = get().activeConversation;
      if (!conv) return;

      const conversationId = conv.id;

      set((s) => {
        s.isSending = true;
        s.streamingContent = '';
        s.isStreaming = false;
        s.error = null;
      });

      // Optimistic: add user message immediately
      const tempUserMsg: MessageData = {
        id: `temp-${Date.now()}`,
        conversationId,
        role: 'user',
        content,
        corrections: [],
        vocabSuggestions: [],
        tokenCount: 0,
        createdAt: new Date().toISOString(),
      };

      set((s) => {
        s.messages.push(tempUserMsg);
      });

      let unlistenToken: (() => void) | null = null;

      try {
        // Listen for streaming tokens BEFORE invoking the command
        unlistenToken = await listen<{ conversation_id: string; token: string }>(
          'tutor:token',
          (event) => {
            if (event.payload.conversation_id === conversationId) {
              set((s) => {
                s.streamingContent += event.payload.token;
                s.isStreaming = true;
              });
            }
          },
        );

        // Invoke streaming send (blocks until streaming completes)
        const raw = await invoke<RawSendMessageResult>('tutor_send_message_stream', {
          conversationId,
          content,
        });

        const result = mapSendMessageResult(raw);

        set((s) => {
          // Replace temp user message with real one
          const tempIdx = s.messages.findIndex((m) => m.id === tempUserMsg.id);
          if (tempIdx >= 0) {
            s.messages[tempIdx] = result.userMessage;
          }
          // Add assistant message
          s.messages.push(result.assistantMessage);

          // Clear streaming state
          s.streamingContent = '';
          s.isStreaming = false;
          s.isSending = false;

          // Update conversation stats
          if (s.activeConversation) {
            s.activeConversation.messageCount += 2;
            s.activeConversation.correctionsCount += result.assistantMessage.corrections.length;
          }
        });

        // Auto-speak assistant response if enabled
        if (get().autoSpeak) {
          get().speakText(result.assistantMessage.content);
        }
      } catch (e) {
        set((s) => {
          // Remove temp message on error
          s.messages = s.messages.filter((m) => m.id !== tempUserMsg.id);
          s.streamingContent = '';
          s.isStreaming = false;
          s.isSending = false;
          s.error = String(e);
        });
      } finally {
        // Always clean up listener
        unlistenToken?.();
      }
    },

    startRecording: async () => {
      set((s) => {
        s.isRecording = true;
      });
      try {
        await invoke('tutor_start_recording', { deviceId: null });
      } catch (e) {
        set((s) => {
          s.isRecording = false;
          s.error = String(e);
        });
      }
    },

    stopAndTranscribe: async () => {
      set((s) => {
        s.isRecording = false;
        s.isTranscribing = true;
      });
      try {
        const language = get().activeConversation?.language ?? null;
        const text = await invoke<string>('tutor_stop_and_transcribe', { language });
        set((s) => {
          s.isTranscribing = false;
        });
        return text;
      } catch (e) {
        set((s) => {
          s.isTranscribing = false;
          s.error = String(e);
        });
        return null;
      }
    },

    speakText: async (text) => {
      const language = get().activeConversation?.language ?? null;
      invoke('tutor_speak_text', { text, language }).catch(() => {
        // Fire and forget — ignore TTS errors silently
      });
    },

    toggleAutoSpeak: () => {
      set((s) => {
        s.autoSpeak = !s.autoSpeak;
      });
    },

    endConversation: async () => {
      const conv = get().activeConversation;
      if (!conv) return;

      try {
        const raw = await invoke<RawConversationSummary>('tutor_end_conversation', {
          conversationId: conv.id,
        });
        const updated = mapConversation(raw);

        set((s) => {
          s.activeConversation = updated;
        });

        await get().fetchConversations();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    deleteConversation: async (id) => {
      try {
        await invoke('tutor_delete_conversation', { id });
        set((s) => {
          if (s.activeConversation?.id === id) {
            s.activeConversation = null;
            s.messages = [];
          }
        });
        await get().fetchConversations();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    fetchModes: async () => {
      try {
        const raw = await invoke<RawModeInfo[]>('tutor_list_modes');
        set((s) => {
          s.modes = raw.map(mapModeInfo);
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    fetchScenarios: async () => {
      try {
        const raw = await invoke<RawScenario[]>('tutor_list_scenarios');
        set((s) => {
          s.scenarios = raw.map(mapScenario);
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    clearError: () => {
      set((s) => {
        s.error = null;
      });
    },
  })),
);
