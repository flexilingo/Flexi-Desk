import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Lightbulb, Target, Clock, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isRankedSession } from '../../stores/celpipStore';
import { round1, SECTION_META } from '../../results/shared';
import type { ExamSession, SectionType } from '../../types';

interface ExamHistoryListProps {
  /** Completed sessions only, newest first. */
  sessions: ExamSession[];
  onView: (sessionId: string) => void;
}

interface DayGroup {
  key: string;
  label: string;
  items: ExamSession[];
}

export function ExamHistoryList({ sessions, onView }: ExamHistoryListProps) {
  const { t, i18n } = useTranslation('celpip');

  // Ranked = counts toward score history. The newest ranked session is "Latest";
  // deltas compare against the next-older ranked session.
  const rankedList = useMemo(() => sessions.filter(isRankedSession), [sessions]);
  const latestRankedId = rankedList[0]?.id;

  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    for (const session of sessions) {
      const d = new Date(session.created_at);
      const dayKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      let label: string;
      if (dayKey === today) label = t('todayLabel');
      else if (dayKey === yesterday) label = t('yesterdayLabel');
      else
        label = d.toLocaleDateString(i18n.language, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      const key = String(dayKey);
      const existing = out.find((g) => g.key === key);
      if (existing) existing.items.push(session);
      else out.push({ key, label, items: [session] });
    }
    return out;
  }, [sessions, t, i18n.language]);

  const total = sessions.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="relative flex items-center gap-2.5 border-b border-border px-4 py-3.5 sm:px-5">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/15">
          <Trophy className="h-4 w-4 text-accent" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-bold leading-tight tracking-tight text-foreground">
            {t('history')}
          </h2>
          <p className="text-[11.5px] text-muted-foreground">{t('examsCount', { count: total })}</p>
        </div>
        <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-accent/10 px-2 text-[12px] font-bold tabular-nums text-accent">
          {total}
        </span>
      </div>

      <div>
        {groups.map((group) => (
          <div key={group.key}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/95 px-4 py-2 backdrop-blur sm:px-5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </span>
              <span className="text-[10.5px] tabular-nums text-muted-foreground">
                · {t('examsCount', { count: group.items.length })}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="divide-y divide-border">
              {group.items.map((s) => {
                const overallIndex = sessions.indexOf(s);
                const attemptNo = total - overallIndex;
                const isLearning = s.practice_config?.learning_mode === true;
                const isPractice = s.mode === 'practice' && !isLearning;
                const ranked = isRankedSession(s);
                const rankedIndex = ranked ? rankedList.findIndex((r) => r.id === s.id) : -1;
                const prevRanked = rankedIndex >= 0 ? rankedList[rankedIndex + 1] : undefined;
                const deltaVsPrev =
                  ranked && s.m_score != null && prevRanked?.m_score != null
                    ? round1(s.m_score - prevRanked.m_score)
                    : null;
                const durationSec =
                  s.started_at && s.completed_at
                    ? Math.floor(
                        (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) /
                          1000,
                      )
                    : null;
                return (
                  <HistoryRow
                    key={s.id}
                    session={s}
                    attemptNo={attemptNo}
                    isLatest={ranked && s.id === latestRankedId}
                    isPractice={isPractice}
                    isLearning={isLearning}
                    deltaVsPrev={deltaVsPrev}
                    durationSec={durationSec}
                    onView={() => onView(s.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface HistoryRowProps {
  session: ExamSession;
  attemptNo: number;
  isLatest: boolean;
  isPractice: boolean;
  isLearning: boolean;
  deltaVsPrev: number | null;
  durationSec: number | null;
  onView: () => void;
}

function HistoryRow({
  session,
  attemptNo,
  isLatest,
  isPractice,
  isLearning,
  deltaVsPrev,
  durationSec,
  onView,
}: HistoryRowProps) {
  const { t } = useTranslation('celpip');

  const modeBadge = isLearning
    ? { label: t('learningMode'), cls: 'border-success/25 bg-success/15 text-success' }
    : isPractice
      ? { label: t('practice'), cls: 'border-primary/25 bg-primary/15 text-primary' }
      : { label: t('fullExam'), cls: 'border-accent/25 bg-accent/15 text-accent' };

  const sectionScores: { key: SectionType; score: number | null }[] = [
    { key: 'listening', score: session.listening_score },
    { key: 'reading', score: session.reading_score },
    { key: 'writing', score: session.writing_score },
    { key: 'speaking', score: session.speaking_score },
  ];

  return (
    <button
      onClick={onView}
      className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted sm:px-5"
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <MScoreChip
          score={session.m_score}
          mode={isLearning ? 'learning' : isPractice ? 'practice' : 'full'}
        />
        <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
          {t('attemptShort', { n: attemptNo })}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-[6px] border px-2 py-[3px] text-[11px] font-semibold ${modeBadge.cls}`}
          >
            {modeBadge.label}
          </span>
          {isLatest && (
            <span className="inline-flex items-center rounded-[6px] border border-success/30 bg-success/15 px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider text-success">
              {t('latestBadge')}
            </span>
          )}
          {deltaVsPrev != null && deltaVsPrev !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[10px] font-bold tabular-nums ${
                deltaVsPrev > 0 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
              }`}
            >
              {deltaVsPrev > 0 ? (
                <ArrowUp className="h-2.5 w-2.5" />
              ) : (
                <ArrowDown className="h-2.5 w-2.5" />
              )}
              {Math.abs(deltaVsPrev)}
            </span>
          )}
        </div>

        {durationSec != null && durationSec >= 60 && (
          <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(durationSec)}
          </span>
        )}
      </div>

      <SectionPills items={sectionScores} />

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent rtl:rotate-180" />
    </button>
  );
}

// Rounded-square M-score coloured by CLB band; an unscored session shows its mode
// icon instead of a dash (an icon reads "by design", a dash reads "broken").
function MScoreChip({
  score,
  mode,
}: {
  score: number | null;
  mode: 'full' | 'practice' | 'learning';
}) {
  if (score == null) {
    const Icon: LucideIcon =
      mode === 'learning' ? Lightbulb : mode === 'practice' ? Target : Trophy;
    const cls =
      mode === 'learning'
        ? 'border-success/30 bg-success/10 text-success'
        : mode === 'practice'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground';
    return (
      <div className={`flex h-11 w-11 items-center justify-center rounded-[12px] border ${cls}`}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
    );
  }
  const tone = scoreTone(score);
  return (
    <div
      className={`flex h-11 w-11 flex-col items-center justify-center rounded-[12px] border ${tone}`}
    >
      <span className="text-[7.5px] font-bold uppercase leading-none tracking-[.1em] opacity-70">
        M
      </span>
      <span className="text-[17px] font-extrabold leading-tight tabular-nums">{score}</span>
    </div>
  );
}

function SectionPills({ items }: { items: { key: SectionType; score: number | null }[] }) {
  const taken = items.filter((i) => i.score != null);
  if (taken.length === 0) return null;
  return (
    <div className="flex max-w-[180px] shrink-0 flex-wrap items-center justify-end gap-1">
      {taken.map((i) => (
        <span
          key={i.key}
          className={`inline-flex items-baseline gap-1 rounded-[6px] px-1.5 py-[3px] text-[10.5px] font-bold uppercase tabular-nums ${SECTION_META[i.key].chip}`}
        >
          {i.key.charAt(0)}
          <span>{i.score}</span>
        </span>
      ))}
    </div>
  );
}

function scoreTone(score: number): string {
  if (score >= 9) return 'border-success/40 bg-success/15 text-success';
  if (score >= 7) return 'border-primary/40 bg-primary/15 text-primary';
  if (score >= 5) return 'border-warning/40 bg-warning/15 text-warning';
  return 'border-error/40 bg-error/15 text-error';
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}
