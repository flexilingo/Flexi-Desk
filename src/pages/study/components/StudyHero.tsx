import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  RefreshCw,
  Plus,
  Info,
  AlertTriangle,
  Play,
  Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudyStore } from '../stores/studyStore';
import { FocusChips } from './FocusChips';
import { StudyModePicker } from './StudyModePicker';
import { useStudyMode } from '../lib/viewPrefs';

interface Props {
  /** Runs today's full mix (no deck scope). */
  onStart: () => void;
  starting: boolean;
  /** Opens Settings → Activities (the per-exercise editor behind the Custom chip). */
  onCustomize: () => void;
  /** Starts the stuck-cards (leech) rescue scope. */
  onStuckCards: () => void;
}

/**
 * "Today's practice" — the hero of the Study landing. Three states, mirroring the
 * web app: loading / done (all caught up) / active. The Focus chips write weight
 * presets straight into the study config, so Start just runs today's mix.
 */
export function StudyHero({ onStart, starting, onCustomize, onStuckCards }: Props) {
  const { t } = useTranslation('study');
  const navigate = useNavigate();

  const plan = useStudyStore((s) => s.dailyPlan);
  const planLoading = useStudyStore((s) => s.loadingPlan);
  const decks = useStudyStore((s) => s.deckStatus);
  const deckLoading = useStudyStore((s) => s.loadingDecks);
  const regeneratePlan = useStudyStore((s) => s.regeneratePlan);
  const [mode, setMode] = useStudyMode();
  const shadowing = mode === 'shadowing';

  // True after a "check for new cards" rebuild that surfaced nothing new — so the
  // click isn't a silent no-op.
  const [noNewFound, setNoNewFound] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const total = plan?.total_cards ?? 0;
  const consumed = plan?.consumed_count ?? 0;
  const remaining = Math.max(0, total - consumed);
  const finishedAll = total > 0 && remaining === 0;
  const progressPct = total > 0 ? Math.round((consumed / total) * 100) : 0;
  const estMinutes = plan?.estimated_minutes ?? 0;
  const remainingMins = total > 0 ? Math.max(1, Math.round((estMinutes * remaining) / total)) : 0;
  const totalLeech = decks.reduce((s, d) => s + (d.leech_count ?? 0), 0);

  const isDone = !planLoading && (total === 0 || finishedAll);
  const isActive = !planLoading && remaining > 0;

  const handleRegenerate = async () => {
    setNoNewFound(false);
    setRegenerating(true);
    await regeneratePlan();
    const next = useStudyStore.getState().dailyPlan;
    if ((next?.total_cards ?? 0) === 0) setNoNewFound(true);
    setRegenerating(false);
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (planLoading) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
        <p className="text-sm text-muted-foreground">{t('calculatingPlan')}</p>
      </div>
    );
  }

  // ── Done / all caught up ─────────────────────────────────────────────────
  if (isDone) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-success" />
        <div className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/15">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-none text-foreground">
              {t('wellDone')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {finishedAll ? `${consumed} / ${total} ✓` : t('landing.noCardsToday')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {!deckLoading && decks.length === 0 ? (
            <Button size="sm" onClick={() => navigate('/review')}>
              <Plus className="h-3 w-3" />
              {t('landing.goToDecks')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              <RefreshCw className={regenerating ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              {regenerating ? t('landing.preparing') : t('landing.regenerate')}
            </Button>
          )}
          {noNewFound && !regenerating && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
              {t('landing.noNewCardsFound')}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Active (cards remaining) ─────────────────────────────────────────────
  if (isActive) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />

        <div className="flex flex-col gap-4 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('landing.today')}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 sm:gap-6">
              <div>
                <div className="text-[34px] font-black leading-none tracking-tight text-foreground tabular-nums sm:text-[40px]">
                  {remaining}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{t('stats.cardsLeft')}</div>
              </div>
              <div className="h-9 w-px shrink-0 bg-border" />
              <div>
                <div className="text-[34px] font-black leading-none tracking-tight text-foreground tabular-nums sm:text-[40px]">
                  {remainingMins}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {t('stats.minLeft')}
                </div>
              </div>
            </div>

            {/* Start names the mode it opens, so the pick below is never a guess. */}
            <Button size="lg" variant="accent" onClick={onStart} loading={starting}>
              {shadowing ? <Mic className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {starting
                ? t('landing.preparing')
                : shadowing
                  ? t('landing.startShadowing')
                  : consumed > 0
                    ? t('runner.continueAnother')
                    : t('landing.startSmart')}
            </Button>
          </div>

          {/* The mode, and Focus together: the tour's "how you study" stop. */}
          <div className="flex flex-col gap-3">
            <StudyModePicker
              mode={mode}
              onChange={setMode}
              disabled={starting}
              tourId="hero-shortcuts"
            />
            {/* Focus weighs the exercise mix, which only normal study has. */}
            {!shadowing && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-foreground">
                  {t('landing.focusLabel')}
                </span>
                <FocusChips disabled={starting} onCustomize={onCustomize} />
              </div>
            )}
          </div>
        </div>

        {/* Footer: progress */}
        <div className="border-t border-border px-5 py-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-success transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {t('landing.today')} — {consumed} / {total}
            </span>
            <div className="flex items-center gap-2">
              {totalLeech > 0 && (
                <button
                  type="button"
                  onClick={onStuckCards}
                  disabled={starting}
                  title={t('landing.stuckCardsHint')}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold text-foreground transition-colors hover:border-warning/50 hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
                  {t('landing.stuckCards', { count: totalLeech })}
                  <Play className="h-2.5 w-2.5 shrink-0 text-foreground/30 transition-colors group-hover:text-foreground rtl:rotate-180" />
                </button>
              )}
              <span>{progressPct}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
