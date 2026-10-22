import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { CefrChip } from './CefrChip';
import type { VocabItem } from './vocabLogic';

/** Words looked up again and again that are in no deck yet: the ones worth a card. */
export function VocabRecommendations({ items }: { items: VocabItem[] }) {
  const { t } = useTranslation('vocabulary');
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10">
          <Star className="h-[14px] w-[14px] text-accent" strokeWidth={1.9} aria-hidden="true" />
        </div>
        <span className="text-[13.5px] font-bold text-foreground">{t('recommendations')}</span>
      </div>
      <p className="mb-4 ms-[38px] text-[11.5px] text-caption">{t('recommendationsDesc')}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((w) => (
          <div
            key={w.key}
            className="group flex cursor-default items-center gap-1.5 rounded-lg border-[1.5px] border-border bg-muted py-1.5 pe-3 ps-2 transition-all hover:border-accent/30 hover:bg-accent/5"
          >
            <CefrChip level={w.cefr} />
            <span
              className="text-[12.5px] font-bold text-foreground transition-colors group-hover:text-accent"
              dir="auto"
            >
              {w.word}
            </span>
            <span className="text-[10px] font-medium text-caption">
              {t('lookups', { count: w.lookups })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
