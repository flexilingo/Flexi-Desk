import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getScoringInfo } from '../services/celpipCloud';
import type { ExamUiProfile } from '../examProfiles';
import type { ExamScoringInfo, ExamScoringTable } from '../types';

// "How is this scored?" behind the (i) on the results ring. The words come from
// the exam profile's spec; each table comes from the backend, built from the
// constants its scorers read, so what a learner reads here is exactly how their
// score was made. Tables are static per exam: fetched once per visit.

const cache = new Map<string, ExamScoringInfo>();

interface Props {
  profile: Pick<ExamUiProfile, 'examType' | 'scoringInfo'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScoringInfoDialog({ profile, open, onOpenChange }: Props) {
  const { t } = useTranslation('exam');
  const needsTable = profile.scoringInfo.sections.some((s) => s.table);
  const [info, setInfo] = useState<ExamScoringInfo | null>(
    () => cache.get(profile.examType) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getScoringInfo(profile.examType)
      .then((res) => {
        cache.set(profile.examType, res);
        setInfo(res);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [profile.examType]);

  useEffect(() => {
    if (open && needsTable && !info && !loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsTable]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-[17px] font-bold text-foreground">
            {t('scoringInfo.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {profile.scoringInfo.sections.map((section) => (
            <section key={section.titleKey}>
              <h3 className="text-[14px] font-bold text-foreground">{t(section.titleKey)}</h3>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {section.bodyKeys.map((key) => (
                  <p key={key} className="text-[13px] leading-relaxed text-muted-foreground">
                    {t(key)}
                  </p>
                ))}
              </div>
              {section.table && (
                <TableSlot
                  table={info?.tables.find((tb) => tb.key === section.table)}
                  loading={loading}
                  failed={failed}
                  onRetry={load}
                />
              )}
            </section>
          ))}

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {t('scoringInfo.estimate')} {t(profile.scoringInfo.sourceKey)}
          </p>
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('scoringInfo.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TableSlot({
  table,
  loading,
  failed,
  onRetry,
}: {
  table: ExamScoringTable | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation('exam');

  if (loading && !table) {
    return (
      <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('scoringInfo.tableLoading')}
      </div>
    );
  }
  if (!table) {
    return failed ? (
      <p className="mt-3 text-[12.5px] text-error">
        {t('scoringInfo.tableError')}{' '}
        <button type="button" onClick={onRetry} className="font-semibold text-primary underline">
          {t('scoringInfo.retry')}
        </button>
      </p>
    ) : null;
  }

  const header = (id: string) =>
    i18n.exists(`scoringInfo.columns.${id}`, { ns: 'exam' }) ? t(`scoringInfo.columns.${id}`) : id;

  return (
    <div className="mt-3 overflow-hidden rounded-[9px] border border-border bg-muted/40">
      <p className="border-b border-border px-3 py-2 text-[12px] font-semibold text-muted-foreground">
        {t(`scoringInfo.tableCaption.${table.key}`)}
      </p>
      <table className="w-full text-[12.5px] tabular-nums">
        <thead>
          <tr className="border-b border-border">
            {table.columns.map((id) => (
              <th
                key={id}
                scope="col"
                className="px-3 py-1.5 text-start text-[11.5px] font-semibold text-muted-foreground"
              >
                {header(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {table.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={`px-3 py-1.5 ${i === 0 ? 'whitespace-nowrap font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  <bdi dir="ltr">{cell}</bdi>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
