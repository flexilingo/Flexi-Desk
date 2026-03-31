import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type {
  AnalyzedItem,
  RawAnalyzedItem,
  DeckWithStats,
  RawDeckWithStats,
} from '../types';
import { mapAnalyzedItem, mapDeck } from '../types';

interface DeckHubState {
  inputText: string;
  sourceLanguage: string;
  targetLanguage: string;

  ocrText: string;
  ocrConfidence: number;
  isOcrProcessing: boolean;
  tesseractInstalled: boolean | null;

  analyzedItems: AnalyzedItem[];
  isAnalyzing: boolean;
  analysisError: string | null;

  selectedIndices: Set<number>;

  isExporting: boolean;
  exportError: string | null;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncResult: { cloudDeckId: string; cardsSynced: number; deckName: string } | null;

  setInputText: (text: string) => void;
  setSourceLanguage: (lang: string) => void;
  setTargetLanguage: (lang: string) => void;

  analyzeText: (text: string, sourceLang: string, targetLang: string) => Promise<void>;
  checkTesseract: () => Promise<void>;
  installTesseract: () => Promise<string>;
  ocrImage: (imagePath: string, lang?: string) => Promise<void>;

  toggleItem: (index: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateItem: (index: number, updates: Partial<AnalyzedItem>) => void;

  createDeckFromSelected: (
    name: string,
    language: string,
    algorithm: string,
    description?: string,
  ) => Promise<DeckWithStats>;

  exportAnki: (deckId: string) => Promise<void>;
  exportQuizlet: (deckId: string) => Promise<void>;
  exportCsv: (deckId: string) => Promise<void>;
  syncToCloud: (deckId: string) => Promise<void>;

  reset: () => void;
}

export const useDeckHubStore = create<DeckHubState>()(
  immer((set, get) => ({
    inputText: '',
    sourceLanguage: 'en',
    targetLanguage: 'fa',
    ocrText: '',
    ocrConfidence: 0,
    isOcrProcessing: false,
    tesseractInstalled: null,
    analyzedItems: [],
    isAnalyzing: false,
    analysisError: null,
    selectedIndices: new Set(),
    isExporting: false,
    exportError: null,
    isSyncing: false,
    syncError: null,
    lastSyncResult: null,

    setInputText: (text) => set((s) => { s.inputText = text; }),
    setSourceLanguage: (lang) => set((s) => { s.sourceLanguage = lang; }),
    setTargetLanguage: (lang) => set((s) => { s.targetLanguage = lang; }),

    analyzeText: async (text, sourceLang, targetLang) => {
      set((s) => { s.isAnalyzing = true; s.analysisError = null; s.analyzedItems = []; });
      try {
        const raw = await invoke<RawAnalyzedItem[]>('deck_hub_analyze_text', {
          text,
          sourceLang,
          targetLang,
        });
        const items = raw.map(mapAnalyzedItem);
        set((s) => {
          s.analyzedItems = items;
          s.selectedIndices = new Set(items.map((_, i) => i));
          s.isAnalyzing = false;
        });
      } catch (e) {
        set((s) => { s.analysisError = String(e); s.isAnalyzing = false; });
      }
    },

    checkTesseract: async () => {
      const installed = await invoke<boolean>('deck_hub_check_tesseract');
      set((s) => { s.tesseractInstalled = installed; });
    },

    installTesseract: async () => {
      const msg = await invoke<string>('deck_hub_install_tesseract');
      set((s) => { s.tesseractInstalled = true; });
      return msg;
    },

    ocrImage: async (imagePath, lang) => {
      set((s) => { s.isOcrProcessing = true; s.analysisError = null; });
      try {
        const result = await invoke<{ text: string; confidence: number }>('deck_hub_ocr_image', {
          imagePath,
          language: lang ?? null,
        });
        set((s) => {
          s.ocrText = result.text;
          s.ocrConfidence = result.confidence;
          s.inputText = result.text;
          s.isOcrProcessing = false;
        });
      } catch (e) {
        set((s) => { s.analysisError = String(e); s.isOcrProcessing = false; });
      }
    },

    toggleItem: (index) =>
      set((s) => {
        const next = new Set(s.selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        s.selectedIndices = next;
      }),

    selectAll: () =>
      set((s) => { s.selectedIndices = new Set(s.analyzedItems.map((_, i) => i)); }),

    deselectAll: () =>
      set((s) => { s.selectedIndices = new Set(); }),

    updateItem: (index, updates) =>
      set((s) => { Object.assign(s.analyzedItems[index], updates); }),

    createDeckFromSelected: async (name, language, algorithm, description) => {
      const { analyzedItems, selectedIndices } = get();
      // Build snake_case payload matching Rust DeckHubCardInput
      const cards = [...selectedIndices]
        .sort((a, b) => a - b)
        .map((i) => {
          const item = analyzedItems[i];
          return {
            word: item.word,
            translation: item.translation || null,
            definition: item.definition || null,
            pos: item.pos || null,
            cefr_level: item.cefrLevel || null,
            ipa: item.ipa || null,
            example_sentence: item.examples[0]?.source || null,
            memory_hook: item.memoryHook || null,
            collocations: item.collocations.length > 0 ? item.collocations : null,
            card_type: item.cardType || null,
          };
        });

      const raw = await invoke<RawDeckWithStats>('deck_hub_batch_create', {
        deckName: name,
        language,
        algorithm,
        description: description ?? null,
        cards,
      });
      return mapDeck(raw);
    },

    exportAnki: async (deckId) => {
      set((s) => { s.isExporting = true; s.exportError = null; });
      try {
        const filePath = await save({
          defaultPath: `deck.apkg`,
          filters: [{ name: 'Anki Package', extensions: ['apkg'] }],
        });
        if (!filePath) { set((s) => { s.isExporting = false; }); return; }
        await invoke('export_deck_anki', { deckId, filePath });
        set((s) => { s.isExporting = false; });
      } catch (e) {
        set((s) => { s.exportError = String(e); s.isExporting = false; });
      }
    },

    exportQuizlet: async (deckId) => {
      set((s) => { s.isExporting = true; s.exportError = null; });
      try {
        const filePath = await save({
          defaultPath: `deck-quizlet.txt`,
          filters: [{ name: 'Text File', extensions: ['txt'] }],
        });
        if (!filePath) { set((s) => { s.isExporting = false; }); return; }
        await invoke('deck_hub_export_quizlet', { deckId, filePath });
        set((s) => { s.isExporting = false; });
      } catch (e) {
        set((s) => { s.exportError = String(e); s.isExporting = false; });
      }
    },

    exportCsv: async (deckId) => {
      set((s) => { s.isExporting = true; s.exportError = null; });
      try {
        const filePath = await save({
          defaultPath: `deck.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (!filePath) { set((s) => { s.isExporting = false; }); return; }
        await invoke('export_vocabulary_csv', {
          filePath,
          options: {
            format: 'Csv',
            include_fields: [],
            filter_language: null,
            filter_cefr: null,
            filter_source: null,
            deck_id: deckId,
          },
        });
        set((s) => { s.isExporting = false; });
      } catch (e) {
        set((s) => { s.exportError = String(e); s.isExporting = false; });
      }
    },

    syncToCloud: async (deckId) => {
      set((s) => { s.isSyncing = true; s.syncError = null; s.lastSyncResult = null; });
      try {
        const result = await invoke<{ cloud_deck_id: string; cards_synced: number; deck_name: string }>(
          'deck_hub_cloud_push',
          { deckId },
        );
        set((s) => {
          s.lastSyncResult = {
            cloudDeckId: result.cloud_deck_id,
            cardsSynced: result.cards_synced,
            deckName: result.deck_name,
          };
          s.isSyncing = false;
        });
      } catch (e) {
        set((s) => { s.syncError = String(e); s.isSyncing = false; });
      }
    },

    reset: () =>
      set((s) => {
        s.inputText = '';
        s.ocrText = '';
        s.ocrConfidence = 0;
        s.analyzedItems = [];
        s.analysisError = null;
        s.selectedIndices = new Set();
        s.exportError = null;
        s.syncError = null;
        s.lastSyncResult = null;
      }),
  })),
);
