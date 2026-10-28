import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WordDialog } from '@/components/WordDialog';
import { getSetting } from '@/lib/tauri-bridge';
import { cn } from '@/lib/utils';
import { useStudyStore } from '../stores/studyStore';
import type { NextActivityResponse, SessionSummaryResponse } from '../types';
import { StudySpeechContext } from '../hooks/useSpeak';
import { frontLanguage } from '../lib/cardLang';
import { singleFlight } from '../lib/singleFlight';
import { useShadowingPrefs } from '../lib/shadowingPrefs';
import { useStudyReadingView } from '../lib/useStudyReadingView';
import {
  useStudyCardVisibility,
  useStudyMode,
  useStudyReadPrefs,
  type StudyVisibilityKey,
} from '../lib/viewPrefs';
import { METHOD_REGISTRY } from './session/methods';
import { StudyProgressHeader } from './session/StudyProgressHeader';
import { StudyComplete } from './session/StudyComplete';
import { PrevCardReview, type PrevCard } from './session/PrevCardReview';
import type { StudyAutoPlay, StudySubmitArgs, StudyViewState } from './session/types';
import { StudySettingsDialog } from './StudySettingsDialog';
import { ShadowingRunner, type ShadowingProgress } from './ShadowingRunner';
import { ShadowingSettingsPanel } from './ShadowingSettingsPanel';
import { NormalStudySettingsPanel } from './NormalStudySettingsPanel';
import { PronunciationSettingsDialog } from './PronunciationSettingsDialog';
import { StudyModePicker } from './StudyModePicker';
import { StudyViewControls } from './StudyViewControls';
import { AiWorkingStatus } from '@/components/ai/AiWait';
import { cancelAiRequests } from '@/lib/aiWait';

export function StudyRunner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  // Keyed on the session: starting another one ("Review again", "Drill weak words") remounts
  // the whole runner, so no tally, summary or prior card carries over.
  return sessionId ? <StudySession key={sessionId} sessionId={sessionId} /> : null;
}

function StudySession({ sessionId }: { sessionId: string }) {
  const { t, i18n } = useTranslation('study');
  const navigate = useNavigate();

  const config = useStudyStore((s) => s.config);
  const current = useStudyStore((s) => s.current);
  const deckStatus = useStudyStore((s) => s.deckStatus);
  const advancing = useStudyStore((s) => s.advancing);
  const submitting = useStudyStore((s) => s.submitting);
  const aiWaitStartedAt = useStudyStore((s) => s.aiWaitStartedAt);
  const starting = useStudyStore((s) => s.starting);
  const error = useStudyStore((s) => s.error);
  const fetchConfig = useStudyStore((s) => s.fetchConfig);
  const updateConfig = useStudyStore((s) => s.updateConfig);
  const fetchDeckStatus = useStudyStore((s) => s.fetchDeckStatus);
  const nextActivity = useStudyStore((s) => s.nextActivity);
  const submitActivity = useStudyStore((s) => s.submitActivity);
  const endSession = useStudyStore((s) => s.endSession);
  const resetRunner = useStudyStore((s) => s.resetRunner);
  const startSession = useStudyStore((s) => s.startSession);

  const [tally, setTally] = useState({ correct: 0, incorrect: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [finished, setFinished] = useState(false);
  /** The end-session call has settled — until then the report is a skeleton, never zeros. */
  const [summaryResolved, setSummaryResolved] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pronunciationOpen, setPronunciationOpen] = useState(false);
  const [lookup, setLookup] = useState<{ word: string; sentence: string } | null>(null);
  const [prevCard, setPrevCard] = useState<PrevCard | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [nativeLanguage, setNativeLanguage] = useState((i18n.language || 'en').split('-')[0]);
  const [shadowingProgress, setShadowingProgress] = useState<ShadowingProgress | null>(null);
  const finishingRef = useRef(false);
  const startedRef = useRef(false);

  // ── What the learner chose: mode, card view, text size, accent, direction ────────────────────────
  const [mode, setMode] = useStudyMode();
  const shadowingActive = mode === 'shadowing';
  const shadowingPrefs = useShadowingPrefs();
  const { visibility, setVisibility, toggleVisibility } = useStudyCardVisibility();
  const reading = useStudyReadingView();
  const { accent, setAccent, pronounceWordOnReveal, setPronounceWordOnReveal } =
    useStudyReadPrefs();

  useEffect(() => {
    void getSetting('native_language')
      .then((v) => v && setNativeLanguage(v.split('-')[0]))
      .catch(() => {});
  }, []);

  // Auto-pronounce is the engine's own setting; the menu writes it and the next card obeys.
  const autoPronounce = !!config?.auto_pronounce;
  const setAutoPronounce = useCallback(
    (value: boolean) => void updateConfig({ auto_pronounce: value }),
    [updateConfig],
  );

  // Reverse direction lives in the engine's config (it reads it when it serves a card). Shown at once
  // like the website, but a failed save flips it back and says so: a switch showing "on" while cards keep
  // coming front-first would read as broken. One save at a time, so two quick clicks cannot race.
  const [reverseOverride, setReverseOverride] = useState<boolean | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const reverseSaving = useRef(false);
  const reverseCard = reverseOverride ?? !!config?.reverse_card;
  const setReverseCard = useCallback(
    async (value: boolean) => {
      if (reverseSaving.current) return;
      reverseSaving.current = true;
      setReverseOverride(value);
      setReverseError(null);
      await updateConfig({ reverse_card: value });
      if (useStudyStore.getState().config?.reverse_card !== value) {
        setReverseOverride(null);
        setReverseError(t('runner.reverseCardError'));
      } else {
        setReverseOverride(null);
      }
      reverseSaving.current = false;
    },
    [updateConfig, t],
  );

  // Elapsed clock — frozen once the session is done.
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

  /** Ends the session. The report shows at once as a skeleton and fills in when the engine answers. */
  const finish = useCallback(
    async (abandoned: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      if (abandoned) {
        await endSession(sessionId, true);
        resetRunner();
        navigate('/study');
        return;
      }
      setFinished(true);
      const res = await endSession(sessionId, false);
      setSummary(res);
      setSummaryResolved(true);
    },
    [sessionId, endSession, navigate, resetRunner],
  );

  // One card per Continue. `next-activity` consumes an item of the queue on EVERY call, so a second
  // press while the next card is loading fetched another one and replaced the first unseen — skipping it.
  const advanceImpl = useCallback(async () => {
    const res = await nextActivity(sessionId);
    // An empty activity id means the queue is exhausted → complete the session.
    if (res && !res.activity.id) await finish(false);
  }, [sessionId, nextActivity, finish]);
  const advanceRef = useRef(advanceImpl);
  advanceRef.current = advanceImpl;
  const advance = useMemo(() => singleFlight(() => advanceRef.current()), []);
  const onNext = useCallback(() => void advance(), [advance]);

  // Boot: load config + deck status (for settings). Cards are served only in normal study: shadowing
  // reads the plan itself and consumes nothing, so a graded session is left exactly where it was.
  useEffect(() => {
    if (!config) void fetchConfig();
    if (deckStatus.length === 0) void fetchDeckStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (shadowingActive || finished || current || startedRef.current) return;
    startedRef.current = true;
    void advance();
  }, [shadowingActive, finished, current, advance]);
  // Back from shadowing to normal study with nothing on screen yet.
  useEffect(() => {
    if (!shadowingActive && !finished && !current && !advancing) {
      startedRef.current = true;
      void advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowingActive]);

  const handleSubmit = useCallback(
    async (args: StudySubmitArgs) => {
      if (!current) return null;
      const res = await submitActivity({
        session_id: sessionId,
        activity_id: current.activity.id,
        ...args,
      });
      if (res) {
        setTally((prev) =>
          res.activity.is_correct
            ? { ...prev, correct: prev.correct + 1 }
            : { ...prev, incorrect: prev.incorrect + 1 },
        );
        // Remember this card so the learner can peek back at it from the header.
        if (current.card_meta) {
          setPrevCard({
            front: current.card_meta.front_text,
            back: current.card_meta.back_text,
            isCorrect: res.activity.is_correct,
            notes: current.card_meta.notes,
          });
        }
      }
      return res;
    },
    [sessionId, current, submitActivity],
  );

  /** A new session over the same scope (or the weak words), pulling cards forward even if nothing is due. */
  const begin = async (args: { scope: 'due' | 'weak'; deckIds?: string[] }) => {
    const id = await startSession({ deck_ids: args.deckIds, scope: args.scope, study_ahead: true });
    if (id) {
      resetRunner();
      navigate(`/study/session/${id}`, { replace: true });
    }
  };
  const sessionDeckIds = summary?.session.deck_ids ?? [];
  const reviewAgain = () =>
    void begin({ scope: 'due', deckIds: sessionDeckIds.length === 1 ? sessionDeckIds : undefined });
  const drillWeak = () => void begin({ scope: 'weak' });

  const resolveErr = (code: string | null): string | null => {
    if (!code) return null;
    const key = `errors.${code}`;
    const msg = t(key);
    return msg === key ? t('errors.UNKNOWN_ERROR') : msg;
  };

  if (finished) {
    return (
      <StudySpeechContext.Provider value={{ language: 'en', accent }}>
        <div className="fixed inset-0 z-40 overflow-y-auto bg-background">
          <StudyComplete
            summary={summary}
            resolved={summaryResolved}
            elapsedSeconds={elapsed}
            tally={tally}
            onDone={() => {
              resetRunner();
              navigate('/study');
            }}
            onReviewAgain={reviewAgain}
            onDrillWeak={drillWeak}
            starting={starting}
            error={resolveErr(error)}
            shadowing={shadowingActive && tally.correct + tally.incorrect === 0}
          />
        </div>
      </StudySpeechContext.Provider>
    );
  }

  const cur: NextActivityResponse | null = current && current.activity.id ? current : null;
  const meta = cur?.card_meta ?? null;
  const cardLanguage = meta
    ? frontLanguage(
        { notesLang: meta.notes?.learning_lang, deckLanguage: meta.deck_language },
        meta.front_text,
      )
    : 'en';

  // A flashcard follows the direction switch at once. The engine fixes `reverse` when it serves a card, so
  // without this a switch flipped mid-card (or on the start card's Normal tab) left the card on screen the
  // old way round and read as broken. Display only — a recall answer sends just the rating.
  const payload = cur?.activity.prompt_payload;
  const shown =
    cur && payload && payload.type === 'recall' && payload.reverse !== reverseCard
      ? { ...cur.activity, prompt_payload: { ...payload, reverse: reverseCard } }
      : cur?.activity;

  const Method = cur
    ? (METHOD_REGISTRY[cur.activity.activity_type] ?? METHOD_REGISTRY.recall)
    : null;
  // The card keys are bound by the recall flashcard and by nothing else — the shortcut sheet must not advertise
  // a key the card on screen ignores.
  const cardShortcuts = !shadowingActive && cur?.activity.activity_type === 'recall';
  // The accent only changes English voices, so it is offered only when something on screen is read in English.
  const showAccent = shadowingActive
    ? !!shadowingProgress?.english
    : cardLanguage === 'en' || nativeLanguage === 'en';

  const view: StudyViewState = {
    focusMode: reading.focusMode,
    showWord: visibility.showWord,
    showMeaning: visibility.showMeaning,
    showExampleMeanings: visibility.showExampleMeanings,
    onToggleShowMeaning: () => toggleVisibility('showMeaning'),
  };
  const autoPlay: StudyAutoPlay = { autoPronounce, pronounceWordOnReveal, accent };

  const onVisibilityChange = (key: StudyVisibilityKey, value: boolean) => setVisibility(key, value);

  const controls = (
    <StudyViewControls
      title={t(`runner.settingsTitle.${mode}`)}
      textSize={reading.textSize}
      onTextSizeChange={reading.setTextSize}
      // One menu, showing only the mode on screen: shadowing's own panel carries its card, audio and accent
      // rows; normal study's rows are left out while it is the mode, because none of them change the drill.
      visibility={shadowingActive ? undefined : visibility}
      onVisibilityChange={onVisibilityChange}
      // Shadowing builds its drill from the plan, not from served cards, so a direction would change nothing there.
      reverseCard={shadowingActive ? undefined : reverseCard}
      onReverseCardChange={(v) => void setReverseCard(v)}
      reverseCardError={reverseError}
      pronounceWordOnReveal={pronounceWordOnReveal}
      onPronounceWordOnRevealChange={setPronounceWordOnReveal}
      modePicker={<StudyModePicker mode={mode} onChange={setMode} />}
      modeSettings={
        shadowingActive ? (
          <ShadowingSettingsPanel
            prefs={shadowingPrefs}
            runSize={shadowingProgress?.total}
            available={shadowingProgress?.available}
            hasSpeakableMeaning={shadowingProgress?.speakable ?? true}
            accent={accent}
            onAccentChange={setAccent}
            showAccent={showAccent}
          />
        ) : null
      }
      autoPronounce={shadowingActive ? undefined : autoPronounce}
      onAutoPronounceChange={setAutoPronounce}
      accent={!shadowingActive && showAccent ? accent : undefined}
      onAccentChange={setAccent}
      focusMode={reading.focusMode}
      onToggleFocusMode={reading.toggleFocusMode}
      // Beside fullscreen in both modes: shadowing reads every card aloud, so its voice matters there as much.
      onOpenPronunciation={() => setPronunciationOpen(true)}
      onSettings={() => setSettingsOpen(true)}
      cardShortcuts={cardShortcuts}
    />
  );

  return (
    <StudySpeechContext.Provider value={{ language: cardLanguage, accent }}>
      <div
        data-study-size={reading.textSize}
        data-testid="study-session"
        className={cn(
          'fixed inset-0 flex flex-col overflow-hidden bg-background',
          reading.focusMode ? 'z-60' : 'z-40',
        )}
      >
        <StudyProgressHeader
          total={cur?.total ?? 0}
          remaining={cur?.remaining ?? 0}
          correct={tally.correct}
          incorrect={tally.incorrect}
          elapsedSeconds={elapsed}
          cardProgress={cur?.card_progress ?? null}
          requeueCount={cur?.requeue_count ?? 0}
          repeatsAdded={0}
          onPrevCard={prevCard ? () => setPrevOpen(true) : undefined}
          onExit={() => setConfirmExit(true)}
          controls={controls}
          focusMode={reading.focusMode}
          onToggleFocusMode={reading.toggleFocusMode}
          shadowingActive={shadowingActive}
          shadowingProgress={shadowingProgress}
        />

        {/* Shadowing replaces the activity area entirely rather than dressing a card up as one: it reads the
            session's plan directly and is driven by the audio, so leaving the activity stream mounted
            underneath would give two things a claim on "what is the current card". */}
        {shadowingActive ? (
          <ShadowingRunner
            sessionId={sessionId}
            nativeLanguage={nativeLanguage}
            accent={accent}
            onAccentChange={setAccent}
            focusMode={reading.focusMode}
            onProgress={setShadowingProgress}
            // The FINISHED card's way out. No confirmation: the run is over, shadowing never graded a card to
            // lose, and the header's Exit, which does interrupt a run, keeps its dialog.
            onFinish={() => void finish(false)}
            // The start card's Normal tab: normal study's own settings, and a Start that switches the mode.
            normalSetup={{
              settings: (
                <NormalStudySettingsPanel
                  visibility={visibility}
                  onVisibilityChange={onVisibilityChange}
                  reverseCard={reverseCard}
                  onReverseCardChange={(v) => void setReverseCard(v)}
                  reverseCardError={reverseError}
                  pronounceWordOnReveal={pronounceWordOnReveal}
                  onPronounceWordOnRevealChange={setPronounceWordOnReveal}
                  autoPronounce={autoPronounce}
                  onAutoPronounceChange={setAutoPronounce}
                  accent={accent}
                  onAccentChange={setAccent}
                  showAccent={showAccent}
                />
              ),
              onStart: () => setMode('normal'),
            }}
          />
        ) : (
          <div className={cn('flex min-h-0 flex-1 overflow-y-auto', reading.focusMode && 'flex')}>
            <div
              className={cn(
                'mx-auto w-full px-4',
                // `pb-24` keeps the shortcut strip pinned at the bottom from covering the grade buttons.
                reading.focusMode
                  ? 'my-auto max-w-[72em] pb-24 pt-4 md:pt-6'
                  : 'max-w-[64em] py-6 md:py-8',
              )}
            >
              {!cur || !Method || !shown ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">{t('runner.preparingSession')}</span>
                  {!error && <PreparingNote />}
                  {error && <span className="text-sm text-error">{resolveErr(error)}</span>}
                </div>
              ) : (
                <>
                  {meta && !reading.focusMode && (
                    <div className="mb-4 text-center text-[11px] text-caption">
                      {t('activity.fromDeck', { deck: meta.deck_title })} ·{' '}
                      {t('activity.activityType')}:{' '}
                      <span className="font-semibold text-foreground">
                        {t(`activity.${cur.activity.activity_type}`)}
                      </span>
                    </div>
                  )}
                  {advancing ? (
                    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      {/* A generated exercise waits on the user's own AI. */}
                      <AiWorkingStatus
                        startedAt={aiWaitStartedAt}
                        onCancel={() => void cancelAiRequests()}
                        showAfterSec={3}
                      />
                    </div>
                  ) : (
                    <Method
                      key={cur.activity.id}
                      activity={shown}
                      cardMeta={cur.card_meta}
                      config={config}
                      srsAlgorithm={cur.srs_algorithm}
                      cardProgress={cur.card_progress}
                      predictedIntervals={cur.predicted_intervals}
                      requeueCount={cur.requeue_count}
                      submitting={submitting}
                      onSubmit={handleSubmit}
                      onNext={onNext}
                      advancing={advancing}
                      onLookup={(word, sentence) => setLookup({ word, sentence })}
                      view={view}
                      autoPlay={autoPlay}
                      deckLanguage={cardLanguage}
                      nativeLanguage={nativeLanguage}
                    />
                  )}
                  {submitting && (
                    <div className="mt-4 flex justify-center">
                      {/* Sentence grading waits on the user's own AI; Cancel grades without it. */}
                      <AiWorkingStatus
                        startedAt={aiWaitStartedAt}
                        onCancel={() => void cancelAiRequests()}
                        showAfterSec={3}
                      />
                    </div>
                  )}
                  {error && (
                    <div className="mt-4 text-center text-sm text-error">{resolveErr(error)}</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {lookup && (
          <WordDialog
            word={lookup.word}
            open
            onOpenChange={(open) => !open && setLookup(null)}
            sentenceContext={lookup.sentence || undefined}
          />
        )}

        <PrevCardReview
          open={prevOpen}
          onOpenChange={setPrevOpen}
          card={prevCard}
          onLookup={(w, s) => setLookup({ word: w, sentence: s })}
        />

        <StudySettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          decks={deckStatus}
          initialTab="prefs"
        />

        <PronunciationSettingsDialog
          open={pronunciationOpen}
          onOpenChange={setPronunciationOpen}
          language={cardLanguage}
          sampleText={meta?.front_text ?? ''}
          accent={accent}
          onAccentChange={setAccent}
        />

        <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('runner.exitTitle')}</DialogTitle>
              <DialogDescription>{t('runner.exitBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmExit(false)}>
                {t('scope.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => void finish(true)}>
                {t('runner.exit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </StudySpeechContext.Provider>
  );
}

/** Shown once preparing takes a while: the learner's own AI is writing the exercise (slow on a slow computer). */
function PreparingNote() {
  const { t, i18n } = useTranslation('study');
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  if (seconds < 3) return null;
  return (
    <span className="max-w-[28em] text-center text-xs text-caption">
      {t('runner.preparingWithAi', {
        seconds: new Intl.NumberFormat(i18n.language).format(seconds),
      })}
    </span>
  );
}
