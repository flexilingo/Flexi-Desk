import { useTranslation } from 'react-i18next';
import { deckRows } from '../../../lib/studyReport';
import { ReportPanel } from './ReportPanel';

/** Which decks tonight's cards came from — "was that all one deck again?", and what a mixed session needs to be legible. */
export function DeckPanel({
  decks,
}: {
  decks: { deck_id: string; deck_title: string; count: number }[];
}) {
  const { t } = useTranslation('study');
  const rows = deckRows(decks);
  if (rows.length === 0) return null;
  return (
    <ReportPanel title={t('report.decksTitle')} testId="report-decks">
      <div className="flex flex-col divide-y divide-border">
        {rows.map((d) => (
          <div key={d.deck_id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span
              dir="auto"
              className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground"
            >
              {d.deck_title}
            </span>
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${d.share}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-end text-[13px] font-bold tabular-nums text-foreground">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </ReportPanel>
  );
}
