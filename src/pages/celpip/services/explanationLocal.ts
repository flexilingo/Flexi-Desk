import { invoke } from '@tauri-apps/api/core';

/**
 * Translates explanation paragraphs with the user's OWN AI (the model on this
 * computer, or their own key). `texts` maps a key to an English paragraph; the
 * answer maps the same keys to the translation. Throws the backend's setup codes
 * (OLLAMA_NOT_RUNNING, AI_KEY_MISSING, ...) when that AI is not ready.
 */
export const translateTextsLocal = (texts: Record<string, string>, targetLang: string) =>
  invoke<Record<string, string>>('ai_translate_texts', { texts, targetLang });
