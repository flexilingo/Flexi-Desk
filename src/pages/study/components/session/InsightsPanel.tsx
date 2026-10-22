import { useTranslation } from 'react-i18next';
import {
  Volume2,
  Lightbulb,
  BookOpen,
  Sparkles,
  TriangleAlert,
  Landmark,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeak } from '../../hooks/useSpeak';
import type { CardNotes } from '../../types';
import { ClickableText } from './ClickableText';
import { ConjugationPanel } from '../ConjugationPanel';
import { groupsFromNotes, isFrenchVerbCard } from '../../lib/conjugation';

interface Props {
  notes: CardNotes;
  /** Word lookup for any token in an example sentence. */
  onLookup?: (word: string, sentence: string) => void;
  /** False on the flashcard, whose own face carries the examples (with audio and masks). */
  showExamples?: boolean;
  /** With the meaning masked, what gives it away (the definition, the verb table's glosses) hides behind the same eye. */
  meaningRevealed?: boolean;
  onToggleMeaning?: () => void;
  /** The word itself, read when the IPA's speaker is pressed. */
  word?: string;
  /** A French verb card gets its conjugation table. */
  conjugation?: { front: string; language: string };
}

const CEFR_CLS: Record<string, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className={cn('rounded-full border px-2 py-0.5 text-[11px]', tone)}>
          {s}
        </span>
      ))}
    </div>
  );
}

/**
 * The meaning/usage panel shown once a card is revealed — the desk counterpart of
 * front's `study-shared/InsightsPanel`. Every field is optional; hand-made cards
 * with no AI notes render nothing.
 */
export function InsightsPanel({
  notes,
  onLookup,
  showExamples = true,
  meaningRevealed = true,
  onToggleMeaning,
  word,
  conjugation,
}: Props) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();

  const examples = showExamples && Array.isArray(notes.examples) ? notes.examples.slice(0, 3) : [];
  const synonyms = Array.isArray(notes.synonyms) ? notes.synonyms.slice(0, 8) : [];
  const antonyms = Array.isArray(notes.antonyms) ? notes.antonyms.slice(0, 6) : [];
  const collocations = Array.isArray(notes.collocations) ? notes.collocations.slice(0, 6) : [];
  const mistakes = Array.isArray(notes.common_mistakes) ? notes.common_mistakes.slice(0, 3) : [];

  const hasConjugation =
    !!conjugation &&
    (groupsFromNotes(notes).length > 0 ||
      isFrenchVerbCard(notes, conjugation.language, conjugation.front));
  const hasContent =
    hasConjugation ||
    notes.definition ||
    notes.memory_hook ||
    notes.ipa ||
    notes.part_of_speech ||
    notes.etymology ||
    notes.pronunciation_tips ||
    notes.cultural_note ||
    examples.length > 0 ||
    synonyms.length > 0 ||
    antonyms.length > 0 ||
    collocations.length > 0 ||
    mistakes.length > 0;

  if (!hasContent) return null;

  const cefr = typeof notes.cefr_level === 'string' ? notes.cefr_level.toUpperCase() : null;

  return (
    <div className="w-full space-y-3.5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
      {/* Meta row */}
      {(notes.ipa || notes.part_of_speech || cefr || notes.register) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {notes.ipa && (
            <span className="inline-flex items-center gap-1 font-mono">
              {notes.ipa}
              <button
                type="button"
                onClick={() => speak(word ?? String(notes.ipa))}
                className="rounded p-0.5 hover:bg-muted"
                title={t('runner.listen')}
              >
                <Volume2 className="h-3 w-3" />
              </button>
            </span>
          )}
          {notes.part_of_speech && <span className="italic">{notes.part_of_speech}</span>}
          {notes.register && <span className="italic opacity-80">{notes.register}</span>}
          {cefr && CEFR_CLS[cefr] && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold text-white',
                CEFR_CLS[cefr],
              )}
            >
              {cefr}
            </span>
          )}
        </div>
      )}

      {notes.definition &&
        (meaningRevealed ? (
          <p className="flex items-start gap-1.5 leading-snug text-foreground">
            <span className="flex-1">{notes.definition}</span>
            {onToggleMeaning && (
              <button
                type="button"
                onClick={onToggleMeaning}
                aria-label={t('runner.hideMeaning')}
                title={t('runner.hideMeaning')}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-caption transition-colors hover:text-accent"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            )}
          </p>
        ) : (
          <button
            type="button"
            onClick={onToggleMeaning}
            aria-label={t('runner.revealMeaning')}
            className="flex w-full items-center gap-1.5 text-start text-caption transition-colors hover:text-accent"
          >
            <span className="min-w-0 flex-1 select-none overflow-hidden whitespace-nowrap tracking-wide">
              {'•'.repeat(40)}
            </span>
            <Eye className="h-3.5 w-3.5 shrink-0" />
          </button>
        ))}

      {hasConjugation && conjugation && (
        <ConjugationPanel
          notes={notes}
          front={conjugation.front}
          language={conjugation.language}
          showGlosses={meaningRevealed}
        />
      )}

      {notes.memory_hook && (
        <Section icon={Lightbulb} title={t('insights.memoryHook')}>
          <p className="leading-snug text-muted-foreground">{notes.memory_hook}</p>
        </Section>
      )}

      {examples.length > 0 && (
        <Section icon={BookOpen} title={t('insights.examples')}>
          <ul className="space-y-1.5">
            {examples.map((ex, i) => {
              const sentence = ex.en ?? ex.source ?? ex.target ?? '';
              const translation = ex.tr ?? (ex.en ? ex.target : undefined);
              if (!sentence) return null;
              return (
                <li key={i} className="leading-snug">
                  <span className="flex items-start gap-1.5">
                    <button
                      type="button"
                      onClick={() => speak(sentence)}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={t('runner.listen')}
                    >
                      <Volume2 className="h-3 w-3" />
                    </button>
                    <span className="text-foreground">
                      {onLookup ? (
                        <ClickableText text={sentence} onWordClick={onLookup} />
                      ) : (
                        sentence
                      )}
                    </span>
                  </span>
                  {translation && (
                    <span className="ms-6 block text-xs text-muted-foreground">{translation}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {synonyms.length > 0 && (
        <Section icon={Sparkles} title={t('insights.synonyms')}>
          <Chips items={synonyms} tone="border-success/40 text-success" />
        </Section>
      )}

      {antonyms.length > 0 && (
        <Section icon={Sparkles} title={t('insights.antonyms')}>
          <Chips items={antonyms} tone="border-error/40 text-error" />
        </Section>
      )}

      {collocations.length > 0 && (
        <Section icon={Sparkles} title={t('insights.collocations')}>
          <Chips items={collocations} tone="border-primary/40 text-primary" />
        </Section>
      )}

      {mistakes.length > 0 && (
        <Section icon={TriangleAlert} title={t('insights.commonMistakes')}>
          <ul className="space-y-1">
            {mistakes.map((m, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="text-error line-through">{m.wrong}</span>
                {' → '}
                <span className="font-semibold text-success">{m.correct}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(notes.pronunciation_tips || notes.etymology || notes.cultural_note) && (
        <Section icon={Landmark} title={t('insights.notes')}>
          <div className="space-y-1 text-muted-foreground">
            {notes.pronunciation_tips && <p className="leading-snug">{notes.pronunciation_tips}</p>}
            {notes.etymology && <p className="leading-snug">{notes.etymology}</p>}
            {notes.cultural_note && <p className="leading-snug">{notes.cultural_note}</p>}
          </div>
        </Section>
      )}
    </div>
  );
}
