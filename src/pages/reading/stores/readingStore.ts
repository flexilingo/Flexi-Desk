import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  ReadingDocument,
  ReadingDocumentSummary,
  ReadingHighlight,
  RawReadingDocument,
  RawReadingDocumentSummary,
  RawReadingHighlight,
} from '../types';
import { mapDocument, mapDocumentSummary, mapHighlight } from '../types';

interface ReadingState {
  // Document library
  documents: ReadingDocumentSummary[];
  isLoadingDocuments: boolean;

  // Active document
  activeDocument: ReadingDocument | null;
  isLoadingDocument: boolean;
  highlights: ReadingHighlight[];

  // Selected word for popover
  selectedTokenIndex: number | null;

  // Error
  error: string | null;

  // Actions
  fetchDocuments: (language?: string) => Promise<void>;
  importText: (title: string, content: string, language: string) => Promise<ReadingDocument>;
  openDocument: (id: string) => Promise<void>;
  closeDocument: () => void;
  deleteDocument: (id: string) => Promise<void>;
  updateProgress: (progress: number, lastPosition: number) => Promise<void>;
  addHighlight: (
    word: string,
    sentence?: string,
    wordIndex?: number,
    vocabularyId?: number,
  ) => Promise<void>;
  fetchHighlights: (documentId: string) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  selectToken: (index: number | null) => void;
  clearError: () => void;
}

export const useReadingStore = create<ReadingState>()(
  immer((set, get) => ({
    documents: [],
    isLoadingDocuments: false,
    activeDocument: null,
    isLoadingDocument: false,
    highlights: [],
    selectedTokenIndex: null,
    error: null,

    fetchDocuments: async (language) => {
      set((s) => {
        s.isLoadingDocuments = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawReadingDocumentSummary[]>('reading_list_documents', {
          language: language ?? null,
        });
        set((s) => {
          s.documents = raw.map(mapDocumentSummary);
          s.isLoadingDocuments = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingDocuments = false;
        });
      }
    },

    importText: async (title, content, language) => {
      try {
        const raw = await invoke<RawReadingDocument>('reading_import_text', {
          title,
          content,
          language,
          sourceType: 'paste',
          sourceUrl: null,
        });
        const doc = mapDocument(raw);
        await get().fetchDocuments();
        return doc;
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
        throw e;
      }
    },

    openDocument: async (id) => {
      set((s) => {
        s.isLoadingDocument = true;
        s.error = null;
        s.selectedTokenIndex = null;
      });
      try {
        const raw = await invoke<RawReadingDocument>('reading_get_document', { id });
        const doc = mapDocument(raw);

        const rawHighlights = await invoke<RawReadingHighlight[]>('reading_get_highlights', {
          documentId: id,
        });

        set((s) => {
          s.activeDocument = doc;
          s.highlights = rawHighlights.map(mapHighlight);
          s.isLoadingDocument = false;
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
          s.isLoadingDocument = false;
        });
      }
    },

    closeDocument: () => {
      set((s) => {
        s.activeDocument = null;
        s.highlights = [];
        s.selectedTokenIndex = null;
      });
    },

    deleteDocument: async (id) => {
      try {
        await invoke('reading_delete_document', { id });
        set((s) => {
          if (s.activeDocument?.id === id) {
            s.activeDocument = null;
            s.highlights = [];
          }
        });
        await get().fetchDocuments();
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    updateProgress: async (progress, lastPosition) => {
      const doc = get().activeDocument;
      if (!doc) return;
      try {
        await invoke('reading_update_progress', {
          id: doc.id,
          progress,
          lastPosition,
        });
        set((s) => {
          if (s.activeDocument) {
            s.activeDocument.progress = progress;
            s.activeDocument.lastPosition = lastPosition;
          }
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    addHighlight: async (word, sentence, wordIndex, vocabularyId) => {
      const doc = get().activeDocument;
      if (!doc) return;
      try {
        const raw = await invoke<RawReadingHighlight>('reading_add_highlight', {
          documentId: doc.id,
          word,
          sentence: sentence ?? null,
          wordIndex: wordIndex ?? null,
          vocabularyId: vocabularyId ?? null,
        });
        set((s) => {
          s.highlights.push(mapHighlight(raw));
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    fetchHighlights: async (documentId) => {
      try {
        const raw = await invoke<RawReadingHighlight[]>('reading_get_highlights', {
          documentId,
        });
        set((s) => {
          s.highlights = raw.map(mapHighlight);
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    deleteHighlight: async (id) => {
      try {
        await invoke('reading_delete_highlight', { id });
        set((s) => {
          s.highlights = s.highlights.filter((h) => h.id !== id);
        });
      } catch (e) {
        set((s) => {
          s.error = String(e);
        });
      }
    },

    selectToken: (index) => {
      set((s) => {
        s.selectedTokenIndex = index;
      });
    },

    clearError: () => {
      set((s) => {
        s.error = null;
      });
    },
  })),
);
