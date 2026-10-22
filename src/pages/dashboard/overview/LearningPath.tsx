import { useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookA,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Headphones,
  Layers,
  NotebookPen,
  Radio,
  Target,
  Trophy,
} from 'lucide-react';
import { ENABLED_MODULES } from '@/config/features';
import { examFamily, formatBand, DESK_EXAMS } from './exam';
import { CardError, OverviewCard, RemoteImage, linkClass } from './parts';
import { ExamDateDialog } from './dialogs';
import { STATION_ORDER, stationOf, type StationKey } from './model';
import type { OverviewData } from './useOverviewData';

const CEFR_TONES = [
  'bg-primary/20',
  'bg-primary/30',
  'bg-primary/45',
  'bg-primary/60',
  'bg-primary/80',
  'bg-primary',
];
const CEFR_KEYS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

interface StationProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  empty: boolean;
  error?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyLink?: { to: string; label: string } | null;
  emptyAction?: { onClick: () => void; label: string } | null;
  big: string;
  unit: string;
  sub?: ReactNode;
  viz?: ReactNode;
  rows: { icon: ComponentType<{ className?: string }>; label: string; value: string }[];
  link: { to: string; label: string } | null;
  extraAction?: { onClick: () => void; label: string } | null;
}

/**
 * "Your learning path": the four things FlexiLingo does, in the order they
 * feed each other (listen and read, words, cards, the exam), each with this
 * learner's own numbers; it doubles as the map of the app.
 */
export function LearningPath({ data, onSignIn }: { data: OverviewData; onSignIn: () => void }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'home.path' });
  const { t: tSkills } = useTranslation('dashboard', { keyPrefix: 'examWeek.skills' });
  const { t: td } = useTranslation('dashboard', { keyPrefix: 'desk' });
  const [dateOpen, setDateOpen] = useState(false);
  const now = stationOf(data.steps[0]);
  const n = (v: number) => v.toLocaleString(i18n.language);

  const stations: Record<StationKey, StationProps> = {
    listen: (() => {
      const l = data.listening;
      const empty = l.episodes === 0 && data.reading.length === 0;
      const hours = l.minutes30 >= 60;
      return {
        icon: Headphones,
        title: t('listen.title'),
        empty,
        error: data.errors.listening,
        emptyTitle: t('listen.emptyTitle'),
        emptyBody: t('listen.emptyBody'),
        big: hours
          ? (l.minutes30 / 60).toLocaleString(i18n.language, { maximumFractionDigits: 1 })
          : n(l.minutes30),
        unit: hours ? t('listen.unitHours') : t('listen.unitMinutes'),
        viz:
          l.artwork.length > 0 ? (
            <div className="flex justify-center gap-1.5">
              {l.artwork.map((src) => (
                <div
                  key={src}
                  className="h-12 w-12 overflow-hidden rounded-md border border-border bg-muted"
                >
                  <RemoteImage
                    src={src}
                    fallback={<Headphones className="m-3 h-6 w-6 text-primary" />}
                  />
                </div>
              ))}
            </div>
          ) : null,
        rows: [
          { icon: Headphones, label: t('listen.episodes'), value: n(l.episodes) },
          { icon: Radio, label: t('listen.followed'), value: n(l.followed) },
          { icon: BookOpen, label: t('listen.books'), value: n(data.reading.length) },
        ],
        link: { to: '/podcast', label: t('listen.link') },
      };
    })(),

    words: (() => {
      const w = data.words;
      const dist = w?.cefr;
      const peak = dist ? Math.max(...CEFR_KEYS.map((k) => dist[k] ?? 0), 1) : 1;
      return {
        icon: BookA,
        title: t('words.title'),
        empty: !!w && w.total === 0,
        error: data.errors.words,
        emptyTitle: t('words.emptyTitle'),
        emptyBody: t('words.emptyBody'),
        big: w ? n(w.total) : '–',
        // Signed in, the Vocabulary / Notes pages add the account's words and notes;
        // this card counts this computer, and says so (Windows QA W9).
        unit: data.signedIn ? t('words.unitLocal') : t('words.unit'),
        sub:
          w && w.new_this_week > 0 ? (
            <span className="font-bold text-success">
              {t('words.thisWeek', { count: w.new_this_week })}
            </span>
          ) : data.signedIn ? (
            <span className="text-muted-foreground">{t('words.localHint')}</span>
          ) : null,
        viz: dist ? (
          <div>
            <div className="grid h-11 grid-cols-6 items-end gap-1">
              {CEFR_KEYS.map((k, i) => (
                <div
                  key={k}
                  title={`${k}: ${n(dist[k] ?? 0)}`}
                  className={`rounded-b-[1px] rounded-t-[3px] ${CEFR_TONES[i]}`}
                  style={{ height: `${Math.max(8, Math.round(((dist[k] ?? 0) / peak) * 100))}%` }}
                />
              ))}
            </div>
            <div
              className="mt-1 grid grid-cols-6 gap-1 text-center text-[10.5px] text-muted-foreground"
              dir="ltr"
            >
              {CEFR_KEYS.map((k) => (
                <span key={k}>{k}</span>
              ))}
            </div>
          </div>
        ) : null,
        rows: [
          {
            icon: NotebookPen,
            label: data.signedIn ? t('words.notesLocal') : t('words.notes'),
            value: w ? n(w.notes) : '–',
          },
        ],
        link: ENABLED_MODULES.vocabulary ? { to: '/vocabulary', label: t('words.link') } : null,
      };
    })(),

    review: (() => {
      const r = data.review;
      const parts = [
        { key: 'learned', value: r.mature, tone: 'bg-success' },
        { key: 'reviewing', value: r.reviewing, tone: 'bg-primary/50' },
        { key: 'unseen', value: r.unseen, tone: 'bg-border' },
      ];
      const whole = Math.max(1, r.total);
      return {
        icon: Layers,
        title: t('review.title'),
        empty: r.total === 0,
        error: data.errors.review,
        emptyTitle: t('review.emptyTitle'),
        emptyBody: t('review.emptyBody'),
        emptyLink: { to: '/review', label: t('review.emptyLink') },
        big: n(r.mature),
        unit: t('review.unit'),
        sub: r.due > 0 ? t('review.due', { count: r.due }) : t('review.noneDue'),
        viz: (
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {parts.map((p) => (
                <div
                  key={p.key}
                  className={p.tone}
                  style={{ width: `${(p.value / whole) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
              {parts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-[2px] ${p.tone}`} />
                  {t(`review.${p.key}`)} {n(p.value)}
                </span>
              ))}
            </div>
          </div>
        ),
        rows: [
          { icon: Layers, label: t('review.decks'), value: n(r.deckCount) },
          {
            icon: Trophy,
            label: t('review.accuracy'),
            value:
              data.accuracy == null
                ? '–'
                : `${Math.round(data.accuracy).toLocaleString(i18n.language)}%`,
          },
        ],
        link: { to: '/review', label: t('review.link') },
      };
    })(),

    exam: (() => {
      const e = data.exam;
      if (!data.signedIn) {
        return {
          icon: GraduationCap,
          title: t('exam.title'),
          empty: true,
          emptyTitle: td('examSignedOutTitle'),
          emptyBody: td('examSignedOutBody'),
          emptyAction: { onClick: onSignIn, label: td('signIn') },
          big: '',
          unit: '',
          rows: [],
          link: null,
        };
      }
      if (!e) {
        return {
          icon: GraduationCap,
          title: t('exam.title'),
          empty: true,
          error: data.errors.exam,
          emptyTitle: t('exam.emptyTitle'),
          emptyBody: data.examGoal === 'none' ? t('exam.emptyBodyNone') : t('exam.emptyBody'),
          emptyLink: { to: '/celpip', label: t('exam.emptyLink') },
          big: '',
          unit: '',
          rows: [],
          link: null,
        };
      }
      const family = examFamily(e.exam);
      const { min, max, label } = e.profile.band;
      const scored = e.skills.some((s) => s.band != null || s.tried);
      const hasDate = e.daysLeft != null && e.daysLeft >= 0;
      return {
        icon: GraduationCap,
        title: t('exam.title'),
        empty: false,
        error: data.errors.exam,
        big: hasDate ? n(e.daysLeft as number) : n(e.taken),
        unit: hasDate
          ? t('exam.daysUnit', { count: e.daysLeft as number, exam: e.name })
          : t('exam.takenUnit', { exam: e.name }),
        sub: t('exam.weekProgress', { done: Math.min(e.thisWeek, e.target), target: e.target }),
        viz: scored ? (
          <div className="flex flex-col gap-2">
            {e.skills.map((s) => (
              <div key={s.skill} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <bdi className="truncate">{tSkills(`${family}.${s.skill}`)}</bdi>
                    {e.weakest === s.skill && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                        title={t('exam.weakest')}
                      />
                    )}
                  </span>
                  <span className="text-[11.5px] font-bold tabular-nums text-foreground">
                    {formatBand(e.profile, s.band).replace(/\d+/g, (d) => n(Number(d)))}
                  </span>
                </div>
                <span className="relative block h-[6px] overflow-hidden rounded-full bg-muted">
                  {s.band != null && (
                    <span
                      className="absolute inset-y-0 start-0 rounded-full bg-primary"
                      style={{
                        width: `${Math.max(6, ((s.band - min + 1) / (max - min + 1)) * 100)}%`,
                      }}
                    />
                  )}
                </span>
              </div>
            ))}
            <span className="mt-0.5 text-[11px] text-muted-foreground">
              {t('exam.scale', { label })}
            </span>
          </div>
        ) : (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {t('exam.noScores')}
          </p>
        ),
        rows: [{ icon: Target, label: t('exam.taken'), value: n(e.taken) }],
        link: DESK_EXAMS.includes(e.exam) ? { to: '/celpip', label: e.name } : null,
        extraAction: hasDate
          ? null
          : { onClick: () => setDateOpen(true), label: t('exam.addDate') },
      };
    })(),
  };

  return (
    <OverviewCard labelledBy="path-title" className="pt-5">
      <div className="px-5 sm:px-6">
        <h2 id="path-title" className="text-base font-bold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 max-w-[75ch] text-sm leading-relaxed text-muted-foreground">
          {t('lead')}
        </p>
      </div>

      <div className="relative mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[12.5%] top-7 hidden border-t-2 border-dashed border-primary/30 xl:block"
        />
        {STATION_ORDER.map((key, i) => (
          <Station
            key={key}
            {...stations[key]}
            now={now === key}
            first={i === 0}
            index={i}
            hereLabel={t('here')}
            onRetry={data.reloadAll}
          />
        ))}
      </div>
      <ExamDateDialog
        open={dateOpen}
        onOpenChange={setDateOpen}
        current={data.settings?.exam_date ?? null}
        onSaved={data.settingsReload}
      />
    </OverviewCard>
  );
}

function Station({
  icon: Icon,
  title,
  empty,
  error,
  emptyTitle,
  emptyBody,
  emptyLink,
  emptyAction,
  big,
  unit,
  sub,
  viz,
  rows,
  link,
  extraAction,
  now,
  first,
  index,
  hereLabel,
  onRetry,
}: StationProps & {
  now: boolean;
  first: boolean;
  index: number;
  hereLabel: string;
  onRetry: () => void;
}) {
  const go = empty ? (emptyLink ?? link) : link;
  const frame = [
    'md:pt-0',
    'border-t md:border-t-0 md:border-s md:pt-0',
    'border-t md:pt-5 xl:border-t-0 xl:border-s xl:pt-0',
    'border-t md:border-s md:pt-5 xl:border-t-0 xl:pt-0',
  ][index];

  return (
    <div
      data-station-now={now ? 'true' : undefined}
      className={`relative grid grid-cols-[56px_1fr] gap-x-4 border-border px-5 py-5 md:flex md:flex-col ${frame}`}
    >
      {!first && (
        <span
          aria-hidden
          className="absolute -start-[9px] top-[19px] z-[2] hidden h-[18px] w-[18px] items-center justify-center rounded-full bg-card text-primary/60 xl:flex"
        >
          <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </span>
      )}

      <div className="flex flex-col items-center">
        <span
          className={`relative z-[1] flex h-12 w-12 items-center justify-center rounded-full border-2 md:h-14 md:w-14 ${
            now
              ? 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15'
              : 'border-primary/30 bg-card text-primary'
          }`}
        >
          <Icon className="h-5 w-5 md:h-6 md:w-6" />
        </span>
        <span
          className={`mt-2 rounded-full bg-primary/10 px-2 py-0.5 text-center text-[10px] font-bold leading-tight text-primary md:px-2.5 md:text-[11px] ${
            now ? '' : 'invisible hidden md:block'
          }`}
        >
          {hereLabel}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:mt-2 md:text-center">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>

        {error ? (
          <CardError className="mt-3 md:justify-center" onRetry={onRetry} />
        ) : empty ? (
          <>
            <p className="mt-2 text-[15px] font-bold text-muted-foreground">{emptyTitle}</p>
            <p className="mt-2 text-xs leading-[1.75] text-muted-foreground">{emptyBody}</p>
            {emptyAction && (
              <div className="mt-3 md:flex md:justify-center">
                <button type="button" onClick={emptyAction.onClick} className={linkClass}>
                  {emptyAction.label}
                  <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 md:mt-3 md:justify-center">
              <span className="text-[28px] font-black leading-none tabular-nums text-foreground">
                {big}
              </span>
              <span className="text-xs text-muted-foreground">{unit}</span>
            </div>
            <div className="mt-1 min-h-[18px] text-xs text-muted-foreground">{sub}</div>
            {viz && <div className="mt-3 min-h-[58px] md:text-start">{viz}</div>}
            {rows.length > 0 && (
              <div className="mt-3 divide-y divide-border border-t border-border md:text-start">
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-2 py-2 text-[13px] text-muted-foreground"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <r.icon className="h-[15px] w-[15px] shrink-0 text-primary" />
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="font-bold tabular-nums text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!error && (go || extraAction) && (
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-3 md:justify-center">
            {go && (
              <Link to={go.to} className={linkClass}>
                {go.label}
                <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
              </Link>
            )}
            {extraAction && (
              <button type="button" onClick={extraAction.onClick} className={linkClass}>
                {extraAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
