import { useCallback, useEffect, useRef, useState } from 'react';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { setReaderLanguage } from '../services/readerService';
import {
  MIN_WORDS,
  detectLanguage,
  languageCheckedKey,
  languageCorrection,
} from './detect-language';

/** Pages whose text is pooled before giving up on a confident answer. */
const MAX_POOLED = 12;

export interface LanguageCorrectionNote {
  /** The language the document was switched to. */
  code: string;
}

/**
 * Corrects a document's stored language ONCE, from what its pages actually say.
 *
 * Fed the text of whatever page is on screen; pools the pages seen until the detector is
 * confident, then (rule in `languageCorrection`) switches a defaulted language to the
 * detected one through `reader_set_language`, remembers that this document was checked, and
 * returns a note for the inline "Language set to French — change" line. A document that was
 * already checked is never looked at again, so a reader who changes it back is not overruled.
 */
export function useLanguageCorrection({
  documentId,
  language,
  pageText,
  onCorrected,
}: {
  documentId: string;
  /** The language in force now (the stored one, or the reader's pick). */
  language: string;
  pageText: string;
  /** Called with the new language once it is saved, so the reader follows it at once. */
  onCorrected: (code: string) => void;
}) {
  const { targetLang } = useLanguageSettings();
  const [note, setNote] = useState<LanguageCorrectionNote | null>(null);
  const checked = useRef<boolean | null>(null);
  const pool = useRef(new Map<string, string>());
  const busy = useRef(false);
  const latest = useRef({ language, targetLang, onCorrected });
  latest.current = { language, targetLang, onCorrected };

  // A new document starts a new pool and asks again whether it was checked.
  useEffect(() => {
    checked.current = null;
    pool.current = new Map();
    busy.current = false;
    setNote(null);
    let cancelled = false;
    getSetting(languageCheckedKey(documentId))
      .then((v) => {
        if (!cancelled) checked.current = v === '1';
      })
      .catch(() => {
        if (!cancelled) checked.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    const text = pageText.trim();
    if (!text || busy.current) return;
    pool.current.set(text.slice(0, 80), text);
    if (pool.current.size > MAX_POOLED) {
      pool.current.delete(pool.current.keys().next().value as string);
    }
    const run = async () => {
      // The marker may still be loading; look again once it has.
      if (checked.current === null) {
        const v = await getSetting(languageCheckedKey(documentId)).catch(() => null);
        checked.current = v === '1';
      }
      if (checked.current) return;
      const all = [...pool.current.values()].join('\n');
      if (all.split(/\s+/).length < MIN_WORDS) return;
      const detected = detectLanguage(all);
      if (!detected.confident) return;
      const { language: stored, targetLang: fallback, onCorrected: apply } = latest.current;
      const next = languageCorrection({
        stored,
        defaultLanguage: fallback,
        detected,
        alreadyChecked: false,
      });
      busy.current = true;
      try {
        if (next) {
          await setReaderLanguage({ document_id: documentId, language: next });
          apply(next);
          setNote({ code: next });
        }
        // A confident answer settles the question either way.
        checked.current = true;
        await setSetting(languageCheckedKey(documentId), '1').catch(() => {});
      } catch {
        // Not saved: leave it unchecked, a later page tries again.
        busy.current = false;
      }
    };
    void run();
  }, [pageText, documentId]);

  const dismiss = useCallback(() => setNote(null), []);
  return { note, dismiss };
}
