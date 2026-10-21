import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudyStore } from '../stores/studyStore';
import type { DeckStatus, StudyScope } from '../types';
import { DeckStudyList } from './DeckStudyList';
import { StudyHero } from './StudyHero';
import { StudyScopeSheet } from './StudyScopeSheet';
import { StudySettingsDialog, type StudySettingsTab } from './StudySettingsDialog';

export function StudyLanding() {
  const { t } = useTranslation('study');
  const navigate = useNavigate();

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

  const begin = async (args: { deckId?: string; scope: StudyScope; force: boolean }) => {
    clearError();
    const id = await startSession({
      deck_ids: args.deckId ? [args.deckId] : undefined,
      scope: args.scope,
      study_ahead: args.force,
    });
    if (id) {
      setScopeOpen(false);
      navigate(`/study/session/${id}`);
    }
  };

  const openScope = (deck: DeckStatus | null) => {
    clearError();
    setScopeDeck(deck);
    setScopeOpen(true);
  };

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
        <Button variant="outline" size="sm" onClick={() => openSettings('pace')}>
          <Settings className="h-3 w-3" />
          {t('landing.settings')}
        </Button>
      </div>

      {/* Hero: today's practice */}
      <StudyHero
        onStart={() => openScope(null)}
        starting={starting}
        onCustomize={handleCustomize}
      />

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
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        deck={scopeDeck}
        onStart={begin}
        starting={starting}
        errorText={resolveErr(error)}
        onCustomize={handleCustomize}
      />
      <StudySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        decks={deckStatus}
        initialTab={settingsTab}
      />
    </div>
  );
}
