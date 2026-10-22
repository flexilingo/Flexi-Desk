import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Sparkles, Tag, Trash2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';
import type { CardFull } from '../types';
import {
  cardExamples,
  hasRtlText,
  isAIGeneratedCard,
  parseCardNotes,
  withoutMeaningLanguage,
} from '../lib/deckLogic';

interface RichCardProps {
  card: Pick<CardFull, 'id' | 'front' | 'back' | 'notes' | 'tags'>;
  number: number;
  /** Language the front text is written in (the voice and the examples). */
  sourceLang: string;
  isOwner: boolean;
  /** A public deck's meaning is in its author's language; a viewer who does not read it sees where theirs goes. */
  hideBack?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

function SpeakButton({
  text,
  lang,
  label,
  small,
}: {
  text: string;
  lang: string;
  label?: string;
  small?: boolean;
}) {
  const { t } = useTranslation('decks');
  return (
    <button
      type="button"
      onClick={() => void speak(text, lang)}
      title={t('card.pronounce')}
      aria-label={t('card.pronounce')}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent',
        small
          ? 'h-5 w-5 justify-center border-transparent'
          : 'px-2 py-0.5 text-[10px] font-bold uppercase',
      )}
    >
      <Volume2 className={small ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      {label}
    </button>
  );
}

/** A card as the website shows it: both sides, tags, IPA, level, examples and the AI badge. */
export function RichCard({
  card,
  number,
  sourceLang,
  isOwner,
  hideBack = false,
  onEdit,
  onDelete,
}: RichCardProps) {
  const { t } = useTranslation('decks');
  const [open, setOpen] = useState(false);

  const parsed = parseCardNotes(card.notes);
  const notes = hideBack && parsed ? withoutMeaningLanguage(parsed, card.front) : parsed;
  const lang = notes?.learning_lang || sourceLang;
  const cefr = notes?.cefr_level || notes?.difficulty;
  const examples = cardExamples(notes);
  const definition = notes?.definition;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-accent">
            #{number}
          </span>
          {isAIGeneratedCard(notes) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              <Sparkles className="h-3 w-3" />
              {t('card.aiBadge')}
            </span>
          )}
          {cefr && (
            <span className="rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
              {cefr}
            </span>
          )}
          {notes?.part_of_speech && (
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
              {notes.part_of_speech}
            </span>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              title={t('edit')}
              aria-label={t('edit')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              title={t('card.delete')}
              aria-label={t('card.delete')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 p-4">
        <div className="space-y-2 border-e border-border pe-4">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('card.front')}
          </span>
          <div className="break-words text-base font-bold leading-snug text-foreground" dir="auto">
            {card.front}
          </div>
          {card.front.trim() && <SpeakButton text={card.front} lang={lang} label={lang} />}
          {notes?.ipa && (
            <div className="font-mono text-xs italic text-muted-foreground">{notes.ipa}</div>
          )}
        </div>
        <div className="space-y-2 ps-4">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('card.back')}
          </span>
          {hideBack ? (
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-primary-light">
                {t('explore.meaningHidden')}
              </div>
              <div className="text-xs text-muted-foreground">{t('explore.meaningHiddenHint')}</div>
            </div>
          ) : (
            <div
              className={cn(
                'break-words text-sm font-semibold leading-relaxed text-foreground',
                hasRtlText(card.back) && 'text-base',
              )}
              dir="auto"
            >
              {card.back || (
                <span className="font-normal italic text-muted-foreground">
                  {t('card.noMeaning')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {(examples.length > 0 || definition) && (
        <div className="border-t border-dashed border-border px-4 pb-3">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1.5 py-2.5 text-xs font-semibold text-primary-light hover:text-foreground"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {t('card.examples', { count: examples.length })}
          </button>
          {open && (
            <div className="space-y-3">
              {definition && (
                <div
                  className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                  dir="auto"
                >
                  {definition}
                </div>
              )}
              {examples.map((ex, i) => (
                <div key={i} className="border-s-2 border-primary-light/50 ps-3">
                  {ex.source && (
                    <div className="flex items-start gap-1.5">
                      <SpeakButton text={ex.source} lang={lang} small />
                      <p className="text-xs leading-relaxed text-foreground" dir="auto">
                        {ex.source}
                      </p>
                    </div>
                  )}
                  {ex.target && !hideBack && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground" dir="auto">
                      {ex.target}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
