import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, X } from 'lucide-react';
import { targetLanguages } from '@/config/languages';
import { languageName } from '../library/format';

/**
 * The small inline line after a document's language was corrected from its own text:
 * "Language set to French — change". "Change" opens the same choice the settings have.
 */
export function LanguageNote({
  code,
  onPick,
  onDismiss,
}: {
  code: string;
  onPick: (code: string) => void;
  onDismiss: () => void;
}) {
  const { t, i18n } = useTranslation('readerDesk');
  const [choosing, setChoosing] = useState(false);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-1.5 text-xs text-muted-foreground"
    >
      <Languages className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{t('language.set', { language: languageName(code, i18n.language) })}</span>
      {choosing ? (
        <select
          aria-label={t('language.change')}
          value={code}
          onChange={(e) => {
            onPick(e.target.value);
            setChoosing(false);
          }}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          {targetLanguages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t('language.change')}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('language.dismiss')}
        title={t('language.dismiss')}
        className="ms-auto inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
