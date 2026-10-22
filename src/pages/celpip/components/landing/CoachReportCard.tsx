/**
 * The coach report entry point on the CELPIP page.
 *
 * This card has one job that matters more than looking good: making it
 * unambiguous WHAT the report is and what it was written from. A learner who
 * cannot tell whether this is a generic tip or a document about their own
 * answers will not click it, and the whole feature — the emails, the Opus
 * calls, the two-week plans — dies at this card.
 *
 * So every non-empty state names the evidence: how many sessions, how many of
 * them are new, and over what period. The verdict shown is the model's own
 * first sentence, in the learner's language, which reads as a person rather
 * than a product.
 *
 * Colour: the hero above already owns the page's terra CTA. This card takes an
 * olive stripe and icon tile — the review/depth tone — and spends terra only on
 * the unread "read it" button, which genuinely is the new action on the page.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Compass, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCoachReport } from '../../coach/useCoach';
import type { ExamSession } from '../../types';

const PANEL = `relative overflow-hidden rounded-[9px] border border-border bg-card shadow-sm`;

/** Literal class strings — Tailwind's scanner cannot follow a concatenation. */
const SKILL_TONE: Record<string, string> = {
  listening: 'text-primary',
  reading: 'text-primary',
  writing: 'text-primary',
  speaking: 'text-primary',
};

function shortDate(value?: string | null, locale = 'en'): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** The model writes 2-3 sentences; the card shows the first. */
function firstSentence(text?: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  const cut = trimmed.search(/[.!?۔؟]\s/);
  return cut > 40 ? trimmed.slice(0, cut + 1) : trimmed;
}

export function CoachReportCard({
  examType,
  sessions,
}: {
  examType: string;
  sessions: ExamSession[];
}) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;
  const completed = sessions.filter((s) => s.status === 'completed');

  // Nothing to report on and nothing to promise — skip is the honest render.
  const { data, isLoading, errorCode } = useCoachReport(
    examType,
    undefined,
    completed.length === 0,
  );
  const isError = errorCode !== null;

  if (completed.length === 0) return null;

  if (isLoading) {
    return <div className={`${PANEL} h-[132px] animate-pulse`} aria-hidden />;
  }

  // No report yet — say what it will be built from, so the first one is
  // expected rather than a surprise.
  if (isError || !data?.report) {
    return (
      <section className={PANEL}>
        <div className="h-[3px] bg-gradient-to-r from-primary to-primary/70" />
        <div className="flex items-start gap-3 p-4">
          <span className="w-9 h-9 rounded-[10px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-foreground">{t('coach.pendingTitle')}</h2>
            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              {t('coach.pendingBody', { count: completed.length })}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const row = data.report;
  const body = row.report ?? {};
  const unread = !row.read_at;
  const est = body.headline?.current_estimate ?? {};
  const dir = body.language?.dir === 'rtl' ? 'rtl' : 'ltr';
  const href = `/exam/${examType}/coach/${row.id}`;

  const covered = body.meta?.covered;
  const total = covered?.sessions_total ?? row.covered_session_ids?.length ?? completed.length;
  const fresh = row.new_session_count ?? covered?.sessions_new ?? 0;
  const period = [shortDate(row.covered_from, locale), shortDate(row.covered_to, locale)]
    .filter(Boolean)
    .join(' → ');

  return (
    <section className={PANEL}>
      <div className="h-[3px] bg-gradient-to-r from-primary to-primary/70" />
      <div className="p-4 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="w-9 h-9 rounded-[10px] bg-primary/[0.12] text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13px] font-bold text-foreground">
                {t('coach.cardTitle', { index: row.report_index })}
              </h2>
              {unread && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warning/[0.16] text-warning text-[10px] font-bold uppercase tracking-wide">
                  <Sparkles className="w-2.5 h-2.5" />
                  {t('coach.new')}
                </span>
              )}
            </div>

            {/* The line that makes it obvious this is about THEM. */}
            <p className="text-[11.5px] text-caption mt-1 tabular-nums">
              {fresh > 0 && fresh < total
                ? t('coach.coverageWithNew', { total, fresh })
                : t('coach.coverage', { total })}
              {period ? ` · ${period}` : ''}
            </p>

            {body.headline?.verdict && (
              <p
                dir={dir}
                className="text-[12.5px] text-foreground mt-2 leading-relaxed line-clamp-2 sm:line-clamp-3"
              >
                {firstSentence(body.headline.verdict)}
              </p>
            )}

            {row.summary_line && (
              <p
                dir={dir}
                className="hidden sm:block text-[12px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2"
              >
                <span className="font-semibold text-foreground">{t('coach.biggestBlocker')}: </span>
                {row.summary_line}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2.5 text-[11px] tabular-nums flex-wrap">
              {(['listening', 'reading', 'writing', 'speaking'] as const).map((skill) => {
                const value = est[skill];
                if (value == null) return null;
                return (
                  <span key={skill} className={`font-semibold ${SKILL_TONE[skill]}`}>
                    {t(skill)} {value}
                  </span>
                );
              })}
              {!row.read_at && row.covered_to && (
                <span className="text-caption">
                  {t('coach.generated', { date: shortDate(row.generated_at, locale) })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 self-start sm:self-center">
          <Button asChild variant={unread ? 'terra' : 'cream'} size="md">
            <Link to={href}>
              {unread ? t('coach.readCta') : t('coach.openCta')}
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
