import { useTranslation } from 'react-i18next';
import { Monitor, Pencil, Plus, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SpeakButton } from '@/components/lookup/SpeakButton';
import { cn } from '@/lib/utils';
import { CefrChip } from './CefrChip';
import type { VocabItem, VocabStatus } from './vocabLogic';

interface Props {
  word: VocabItem;
  selected: boolean;
  /** The language to read the word in when the word does not carry one. */
  fallbackLanguage: string;
  onToggleSelect: () => void;
  onAddToDeck: () => void;
  onEdit: () => void;
}

const statusTone: Record<VocabStatus, string> = {
  new: 'bg-muted text-caption',
  learning: 'bg-success/10 text-success',
  mastered: 'bg-accent/10 text-accent',
};

const hoverEdge: Record<string, string> = {
  A1: 'hover:border-s-success',
  A2: 'hover:border-s-success',
  B1: 'hover:border-s-primary-light',
  B2: 'hover:border-s-primary-light',
  C1: 'hover:border-s-accent',
  C2: 'hover:border-s-accent',
};

export function VocabWordCard({
  word,
  selected,
  fallbackLanguage,
  onToggleSelect,
  onAddToDeck,
  onEdit,
}: Props) {
  const { t } = useTranslation('vocabulary');
  const context = word.contexts[0] ?? null;
  const lang = word.language ?? fallbackLanguage;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${t('selectWord')}: ${word.word}`}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-lg border border-s-[3px] border-s-transparent bg-card shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40',
        hoverEdge[word.cefr] ?? 'hover:border-s-border',
        selected ? 'border-success/50 shadow-md' : 'border-border hover:shadow-sm',
      )}
    >
      <div
        className={cn(
          'absolute end-2.5 top-2.5 z-10 transition-opacity',
          selected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={t('selectWord')}
        />
      </div>

      <div className="flex-1 p-4 pb-3 pe-9">
        <p
          className="line-clamp-1 text-[13px] font-semibold leading-snug text-foreground"
          dir="auto"
        >
          {word.word}
        </p>
        {word.translation && (
          <p className="mt-0.5 truncate text-[11.5px] italic text-caption" dir="auto">
            {word.translation}
          </p>
        )}
        {context && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-caption" dir="auto">
            {context}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-muted px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.05em]',
              statusTone[word.status],
            )}
          >
            {t(`status.${word.status}`)}
          </span>
          <CefrChip level={word.cefr} />
          <div className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-[5px] w-[5px] rounded-full',
                  i <= word.level ? 'bg-success' : 'bg-border',
                )}
              />
            ))}
          </div>
          {word.lookups > 1 && (
            <span className="text-[10px] font-medium text-caption">
              {t('lookups', { count: word.lookups })}
            </span>
          )}
          <span
            className="inline-flex items-center gap-0.5 text-caption"
            title={`${word.local ? t('where.device') : ''}${word.local && word.inAccount ? ' + ' : ''}${word.inAccount ? t('where.account') : ''}`}
          >
            {word.local && <Monitor className="h-3 w-3" aria-label={t('where.device')} />}
            {word.inAccount && <Cloud className="h-3 w-3" aria-label={t('where.account')} />}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <SpeakButton
            text={word.word}
            lang={lang}
            title={t('playAudio')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-foreground/85 hover:border-accent/45 hover:bg-muted/50"
          />
          {word.local && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title={t('edit')}
              aria-label={t('edit')}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title={t('addToDeck')}
            aria-label={t('addToDeck')}
            onClick={onAddToDeck}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}
