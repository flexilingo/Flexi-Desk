import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  AIProvider,
  CEFRLevel,
  ConversationSummary,
  Message,
  RawConversationSummary,
  RawMessage,
  RawSendMessageResult,
} from '../types';
import { mapConversation, mapMessage } from '../types';

interface TutorState {
  // Conversation list
  conversations: ConversationSummary[];
  isLoadingConversations: boolean;

  // Active conversation
  activeConversation: ConversationSummary | null;
  messages: Message[];
  isLoadingMessages: boolean;
  isSending: boolean;

  // Error
  error: string | null;

  // Actions
  fetchConversations: () => Promise<void>;
  startConversation: (params: {
    title: string;
    language: string;
    cefrLevel: CEFRLevel;
    provider: AIProvider;
    model: string;
  }) => Promise<ConversationSummary>;
  openConversation: (id: string) => Promise<void>;
  closeConversation: () => void;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useTutorStore = create<TutorState>()(
  immer((set, get) => ({
    conversations: [],
    isLoadingConversations: false,
    activeConversation: null,
    messages: [],
    isLoadingMessages: false,
    isSending: false,
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
      try {
        const raw = await invoke<RawConversationSummary>('tutor_start_conversation', {
          title: params.title,
          language: params.language,
          cefrLevel: params.cefrLevel,
          provider: params.provider,
          model: params.model,
          scenarioId: null,
        });
        const conv = mapConversation(raw);
        await get().fetchConversations();

        // Auto-open the new conversation
        await get().openConversation(conv.id);

        return conv;
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
        throw e;
      }
    },

    openConversation: async (id) => {
      set((s) => {
        s.isLoadingMessages = true;
        s.error = null;
      });
      try {
        const rawMessages = await invoke<RawMessage[]>('tutor_get_messages', {
          conversationId: id,
        });

        // Find the conversation summary
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
      });
    },

    sendMessage: async (content) => {
      const conv = get().activeConversation;
      if (!conv) return;

      set((s) => {
        s.isSending = true;
        s.error = null;
      });

      // Optimistic: add user message immediately
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: conv.id,
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

      try {
        const raw = await invoke<RawSendMessageResult>('tutor_send_message', {
          conversationId: conv.id,
          content,
        });

        const userMsg = mapMessage(raw.user_message);
        const assistantMsg = mapMessage(raw.assistant_message);

        set((s) => {
          // Replace temp message with real one
          const tempIdx = s.messages.findIndex((m) => m.id === tempUserMsg.id);
          if (tempIdx >= 0) {
            s.messages[tempIdx] = userMsg;
          }
          s.messages.push(assistantMsg);
          s.isSending = false;

          // Update conversation stats
          if (s.activeConversation) {
            s.activeConversation.messageCount += 2;
            s.activeConversation.correctionsCount += assistantMsg.corrections.length;
          }
        });
      } catch (e) {
        set((s) => {
          // Remove temp message on error
          s.messages = s.messages.filter((m) => m.id !== tempUserMsg.id);
          s.error = String(e);
          s.isSending = false;
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

    archiveConversation: async (id) => {
      try {
        await invoke('tutor_archive_conversation', { id });
        await get().fetchConversations();
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
