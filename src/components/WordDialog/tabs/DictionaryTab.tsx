import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Lock, Volume2 } from 'lucide-react';
import { fetchDictionary } from '../api';
import { errorCodeOf } from '../logic';
import { pronounce } from '../pronounce';
import type { DeckCardData, DictionaryEntry, DictionaryResponse } from '../types';
import { ActionButton, ErrorBox, LoadingBlock } from '../ui';
import { cn } from '@/lib/utils';

type Kind = 'freedict' | 'merriam-webster';

interface Props {
  kind: Kind;
  word: string;
  isActive: boolean;
  signedIn: boolean;
  onDeckDataChange?: (data: DeckCardData | null) => void;
  /** Answers this dialog already holds. */
  cache: Map<string, DictionaryResponse | null>;
}

function notesFor(kind: Kind, e: DictionaryEntry): string {
  const limit = kind === 'merriam-webster' ? 4 : 3;
  const parts = [
    kind === 'merriam-webster' ? 'Source: Merriam-Webster Dictionary' : 'Source: Free Dictionary',
    '',
  ];
  const phonetic = e.phonetics?.find((p) => p.text)?.text;
  if (phonetic) parts.push(`Pronunciation: ${phonetic}`, '');
  e.meanings.forEach((m) => {
    parts.push(`${m.partOfSpeech.charAt(0).toUpperCase()}${m.partOfSpeech.slice(1)}:`);
    m.definitions.slice(0, limit).forEach((d, i) => {
      parts.push(`   ${i + 1}. ${d.definition}`);
      if (d.example) parts.push(`      Example: "${d.example}"`);
      if (kind === 'freedict' && d.synonyms?.length)
        parts.push(`      Synonyms: ${d.synonyms.slice(0, 3).join(', ')}`);
      if (kind === 'freedict' && d.antonyms?.length)
        parts.push(`      Antonyms: ${d.antonyms.slice(0, 3).join(', ')}`);
    });
    parts.push('');
  });
  if (e.origin) parts.push(`Origin: ${e.origin}`);
  return parts.join('\n');
}

/** Free Dictionary and Merriam-Webster: English dictionaries, one view with two brandings. */
export function DictionaryTab({ kind, word, isActive, signedIn, onDeckDataChange, cache }: Props) {
  const { t } = useTranslation('wordDialog');
  const mw = kind === 'merriam-webster';
  const key = `${kind}\u0000${signedIn ? 1 : 0}\u0000${word}`;
  const needsAccount = mw && !signedIn;

  const [answer, setAnswer] = useState<{
    key: string;
    data: DictionaryResponse | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handled = useRef('');
  const cached = cache.get(key);
  const current = answer?.key === key ? answer : null;
  const data = current ? current.data : (cached ?? null);
  const error = current?.error ?? null;
  const loading = isActive && !needsAccount && !current && cached === undefined;

  useEffect(() => {
    if (!isActive || needsAccount || !word.trim() || cache.has(key)) return;
    const token = `${key}\u0000${attempt}`;
    if (handled.current === token) return;
    handled.current = token;
    let live = true;
    fetchDictionary(kind, word, signedIn)
      .then((res) => {
        cache.set(key, res);
        if (live) setAnswer({ key, data: res, error: null });
      })
      .catch((err) => {
        if (live) setAnswer({ key, data: null, error: errorCodeOf(err) });
      });
    return () => {
      live = false;
      if (handled.current === token) handled.current = '';
    };
  }, [isActive, needsAccount, key, attempt, kind, word, signedIn, cache]);

  const entry = data?.found ? data.entry : undefined;
  const deck = useMemo<DeckCardData | null>(
    () =>
      entry
        ? {
            word,
            back: entry.meanings[0]?.definitions[0]?.definition ?? '',
            notes: notesFor(kind, entry),
            examples: entry.meanings
              .flatMap((m) =>
                m.definitions
                  .filter((d) => d.example)
                  .map((d) => ({ source: d.example ?? '', target: '' })),
              )
              .slice(0, 3),
            source: mw ? 'merriam-webster' : 'dictionary',
          }
        : null,
    [entry, kind, mw, word],
  );
  useEffect(() => {
    onDeckDataChange?.(deck);
  }, [deck, onDeckDataChange]);

  if (needsAccount) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Lock className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <div className="mb-2 text-base font-semibold text-foreground">
          {t('signInForDictionariesTitle')}
        </div>
        <div className="max-w-sm text-[13px] text-muted-foreground">
          {t('signInForDictionaries')}
        </div>
      </div>
    );
  }

  if (loading)
    return (
      <LoadingBlock
        label={mw ? t('loadingMerriamWebster') : t('loadingDictionary')}
        tone={mw ? 'accent' : 'primary'}
      />
    );

  if (error) {
    return (
      <ErrorBox message={t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN_ERROR') })}>
        <ActionButton variant="quiet" onClick={() => setAttempt((n) => n + 1)}>
          {t('retry')}
        </ActionButton>
      </ErrorBox>
    );
  }

  if (!entry) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <BookOpen className="mx-auto mb-4 h-12 w-12" strokeWidth={1.5} />
        <p className="m-0 text-sm">{mw ? t('notFoundMW') : t('notFound')}</p>
      </div>
    );
  }

  const audioUrl = entry.phonetics?.find((p) => p.audio)?.audio ?? undefined;
  const phonetic = entry.phonetics?.find((p) => p.text)?.text ?? undefined;
  const limit = mw ? 5 : 4;

  const play = () => {
    if (!audioUrl) return;
    const audio = new Audio(audioUrl);
    audio.play().catch(() => void pronounce(word, 'en'));
  };

  return (
    <div>
      {mw && (
        <div className="mb-4 flex items-center gap-2 border-b-2 border-error pb-3">
          <span className="text-xs font-bold text-error">MERRIAM-WEBSTER</span>
          <span className="text-[11px] text-muted-foreground">{t('collegiateDict')}</span>
        </div>
      )}

      {(phonetic || audioUrl) && (
        <div
          className={cn(
            'mb-6 flex items-center gap-3 rounded-xl border p-4',
            mw ? 'border-error/[0.12] bg-error/[0.05]' : 'border-border bg-muted',
          )}
        >
          {phonetic && (
            <span className={cn('font-serif text-lg', mw ? 'text-error' : 'text-primary')}>
              {phonetic}
            </span>
          )}
          {audioUrl && (
            <button
              type="button"
              onClick={play}
              title={t('playPronunciation')}
              aria-label={t('playPronunciation')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90',
                mw ? 'bg-error' : 'bg-accent',
              )}
            >
              <Volume2 className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}

      {entry.meanings.map((meaning, mIndex) => (
        <div key={mIndex} className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={cn(
                'rounded px-2 py-1 text-xs font-bold uppercase',
                mw ? 'bg-error/[0.08] text-error' : 'bg-primary/[0.08] text-primary',
              )}
            >
              {meaning.partOfSpeech}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {meaning.definitions.slice(0, limit).map((def, dIndex) => (
              <div
                key={dIndex}
                className={cn(
                  'rounded-lg border-s-[3px] bg-card p-3.5',
                  mw ? 'border-error' : 'border-accent',
                )}
              >
                <p className="m-0 text-[15px] leading-relaxed text-foreground">
                  <span className="me-2 text-muted-foreground">{dIndex + 1}.</span>
                  {def.definition}
                </p>
                {def.example && (
                  <p className="mb-0 mt-2 flex items-center border-s-2 border-border ps-4 text-sm italic text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => void pronounce(def.example!, 'en')}
                      aria-label={def.example}
                      className="me-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary hover:bg-accent/10 hover:text-accent"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    &quot;{def.example}&quot;
                  </p>
                )}
                {!mw && def.synonyms?.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-success">{t('synonyms')}: </span>
                    <span className="text-xs text-muted-foreground">
                      {def.synonyms.slice(0, 5).join(', ')}
                    </span>
                  </div>
                )}
                {!mw && def.antonyms?.length > 0 && (
                  <div className="mt-1">
                    <span className="text-xs font-medium text-error">{t('antonyms')}: </span>
                    <span className="text-xs text-muted-foreground">
                      {def.antonyms.slice(0, 5).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!mw && entry.origin && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3.5">
          <span className="text-xs font-semibold text-warning">{t('origin')}: </span>
          <span className="text-[13px] text-foreground">{entry.origin}</span>
        </div>
      )}
    </div>
  );
}
