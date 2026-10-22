import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, HelpCircle, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSource } from '@/stores/aiSourceStore';
import { useStudyStore } from '../stores/studyStore';
import type { DeckStatus, StudyScope } from '../types';
import { DeckStudyList } from './DeckStudyList';
import { StudyHero } from './StudyHero';
import { StudyScopeSheet } from './StudyScopeSheet';
import { StudySettingsDialog, type StudySettingsTab } from './StudySettingsDialog';
import { StudyTour } from './StudyTour';
import { markStudyTourSeen, shouldAutoStartTour, stepsFor } from '../lib/studyTour';

export function StudyLanding() {
  const { t } = useTranslation('study');
  // Sentence grading and generated exercises use the user's own AI; without one, study falls back to recall.
  const { own: ownAi } = useAiSource();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    deckStatus,
    loadingDecks,
    starting,
    error,
    fetchConfig,
    fetchDailyPlan,
    fetchDeckStatus,
    startSession,
    clearError,
  } = useStudyStore();

  const [scopeDeck, setScopeDeck] = useState<DeckStatus | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<StudySettingsTab>('pace');

  useEffect(() => {
    fetchConfig();
    fetchDailyPlan();
    fetchDeckStatus();
  }, [fetchConfig, fetchDailyPlan, fetchDeckStatus]);

  // ── Guided tour ─────────────────────────────────────────────────────────────────────────────────
  // Steps that need a deck are dropped when there is none. Whether the scope sheet / settings dialog should
  // be open (and on which tab) is derived straight from the current step — no imperative open/close sequence.
  // It opens by itself ONCE (the first visit) and is replayable from the Guide button.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const tourSteps = useMemo(() => stepsFor(deckStatus.length > 0), [deckStatus.length]);
  const currentTourStep = tourOpen ? tourSteps[tourStepIndex] : null;
  const tourWantsSheet = !!currentTourStep?.needsSheet;
  const tourWantsSettings = !!currentTourStep?.dialogTab;

  const startTour = useCallback(() => {
    setScopeOpen(false);
    setSettingsOpen(false);
    setTourStepIndex(0);
    setTourOpen(true);
  }, []);
  const closeTour = useCallback(() => {
    markStudyTourSeen();
    setTourOpen(false);
  }, []);
  const autoTourTried = useRef(false);
  useEffect(() => {
    if (autoTourTried.current || loadingDecks) return;
    // Only once the deck list has answered: a learner with no decks yet is shown the tour when they have some.
    if (shouldAutoStartTour(deckStatus.length > 0, loadingDecks)) {
      autoTourTried.current = true;
      startTour();
    }
  }, [deckStatus.length, loadingDecks, startTour]);

  const openSettings = (tab: StudySettingsTab) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  // The Custom chip's target: the per-exercise editor. The settings dialog layers
  // above the scope sheet, so opening it from there keeps the sheet intact underneath.
  const handleCustomize = () => openSettings('activities');

  const neglectedDeck = useMemo(
    () =>
      deckStatus
        .filter((d) => d.days_since_practice != null && d.days_since_practice > 7)
        .sort((a, b) => (b.days_since_practice ?? 0) - (a.days_since_practice ?? 0))[0],
    [deckStatus],
  );

  const resolveErr = (code: string | null): string | null => {
    if (!code) return null;
    const key = `errors.${code}`;
    const msg = t(key);
    return msg === key ? t('errors.UNKNOWN_ERROR') : msg;
  };

  // "Starting" lasts until the session page has opened, and a press while one is under way does nothing:
  // the session exists as soon as the engine answers, and a second press started a second session.
  const startingRef = useRef(false);
  const begin = async (args: { deckId?: string; scope: StudyScope; force: boolean }) => {
    if (startingRef.current) return;
    startingRef.current = true;
    clearError();
    const id = await startSession({
      deck_ids: args.deckId ? [args.deckId] : undefined,
      scope: args.scope,
      study_ahead: args.force,
    });
    if (id) {
      setScopeOpen(false);
      navigate(`/study/session/${id}`);
    } else {
      startingRef.current = false;
    }
  };

  const openScope = (deck: DeckStatus | null) => {
    clearError();
    setScopeDeck(deck);
    setScopeOpen(true);
  };

  // /study?deck=<id> — the deck page's "study this deck" link (the website's
  // OpenDeckFromQuery): open that deck's scope sheet once, then drop the parameter so a
  // refresh or Back does not reopen it.
  const deckParam = searchParams.get('deck');
  useEffect(() => {
    if (!deckParam || loadingDecks) return;
    const match = deckStatus.find((d) => d.deck_id === deckParam);
    if (match) openScope(match);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckParam, loadingDecks, deckStatus]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={startTour}>
            <HelpCircle className="h-3 w-3" />
            {t('tour.guideButton')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openSettings('pace')}>
            <Settings className="h-3 w-3" />
            {t('landing.settings')}
          </Button>
        </div>
      </div>

      {ownAi.kind === 'unconfigured' && <AiSetupCard compact />}

      {/* Hero: today's practice */}
      <div data-tour="hero">
        <StudyHero
          onStart={() => openScope(null)}
          starting={starting}
          onCustomize={handleCustomize}
          onStuckCards={() => void begin({ scope: 'leech', force: false })}
        />
      </div>

      {/* Shared start error */}
      {error && !scopeOpen && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
          {resolveErr(error)}
        </div>
      )}

      {/* Neglected deck alert */}
      {neglectedDeck && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-warning" />
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/15">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
              <span className="truncate text-[12.5px] font-bold text-foreground">
                {neglectedDeck.deck_title}
              </span>
              <span className="shrink-0 text-[11.5px] font-medium text-warning">
                —{' '}
                {t('landing.daysWithoutReview', {
                  days: Math.round(neglectedDeck.days_since_practice ?? 0),
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Deck list — opens the scope sheet */}
      <DeckStudyList decks={deckStatus} isLoading={loadingDecks} onPickDeck={openScope} />

      <StudyScopeSheet
        open={scopeOpen || tourWantsSheet}
        onOpenChange={setScopeOpen}
        tourLocked={tourWantsSheet}
        deck={tourWantsSheet ? null : scopeDeck}
        onStart={begin}
        starting={starting}
        errorText={resolveErr(error)}
        onCustomize={handleCustomize}
      />
      <StudySettingsDialog
        open={settingsOpen || tourWantsSettings}
        onOpenChange={setSettingsOpen}
        decks={deckStatus}
        initialTab={settingsTab}
        activeTab={tourWantsSettings ? currentTourStep?.dialogTab : undefined}
        tourLocked={tourWantsSettings}
      />

      {/* The guided walkthrough spotlights the real elements above and inside the sheet and dialog; closing it
          (Skip / Done / Escape) releases them back to their normal manual state. */}
      <StudyTour
        open={tourOpen}
        steps={tourSteps}
        stepIndex={tourStepIndex}
        onStepChange={setTourStepIndex}
        onClose={closeTour}
      />
    </div>
  );
}
