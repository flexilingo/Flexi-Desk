import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronRight,
  EyeOff,
  Layers,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchSessionCards, reportShadowProgress } from '../stores/studyStore';
import type { SessionCard } from '../types';
import { frontLanguage, meaningLanguage } from '../lib/cardLang';
import { formatClock } from '../lib/studyReport';
import type { QueueItem } from '../lib/shadowQueue';
import { useShadowQueue } from '../lib/useShadowQueue';
import { useAudioKeepAlive } from '../lib/audioKeepAlive';
import { useShadowingPrefs } from '../lib/shadowingPrefs';
import type { StudyMode } from '../lib/viewPrefs';
import { ShadowingSettingsPanel } from './ShadowingSettingsPanel';
import { StudyModePicker } from './StudyModePicker';

/** A FIXED row of dots, never one per character — a mask must not leak length. */
const MASK = '•'.repeat(40);

export interface ShadowingProgress {
  step: number;
  total: number;
  elapsed: string;
  round?: number;
  /** Whether any card in the run has a meaning the voice can read. */
  speakable: boolean;
  /** Cards the session has — the most a run can cover. */
  available: number;
  /** Whether anything in the run is read by an English voice — the only voices the accent changes. */
  english: boolean;
}

/**
 * Shadowing — one card at a time, hands free.
 *
 * The card appears, its word is spoken, and after a pause long enough to say it back
 * the next card arrives. Advancement waits on the SOUND finishing, never on a timer
 * (see `lib/shadowQueue`): a fixed timer either cuts a long word off or leaves dead
 * air after a short one, and the pause you repeat into is the whole exercise.
 *
 * Passive by contract. It never submits an answer, because there is no answer: a
 * fabricated grade would push a word the learner merely HEARD months down the
 * schedule. It reports which cards were heard and how many seconds actually played,
 * and the engine keeps that locally (view counts, and time XP under a daily ceiling).
 */
export function ShadowingRunner({
  sessionId,
  nativeLanguage,
  accent,
  onAccentChange,
  focusMode,
  onProgress,
  onFinish,
  finishing,
  normalSetup,
}: {
  sessionId: string;
  /** The learner's own language — the fallback voice for a meaning whose deck names none. */
  nativeLanguage: string;
  accent: 'us' | 'uk';
  onAccentChange: (accent: 'us' | 'uk') => void;
  focusMode: boolean;
  /** Reports this run's position and clock upward, so the session header shows the run being watched. */
  onProgress?: (progress: ShadowingProgress) => void;
  /** Ends the whole session from the FINISHED card — no confirmation: there is nothing left to abandon. */
  onFinish?: () => void;
  finishing?: boolean;
  /** Normal study as the second tab of the start card. The tab only SHOWS its settings; the mode changes on Start. */
  normalSetup?: { settings: ReactNode; onStart: () => void };
}) {
  const { t } = useTranslation('study');
  const prefs = useShadowingPrefs();
  const [setupTab, setSetupTab] = useState<StudyMode>('shadowing');
  const { size, gapMs, repeatEach, rounds, shuffle, speakMeaning, autoAdvance, meaning, showWord } =
    prefs;
  const showMeaning = meaning !== 'hidden';
  const revealAfter = meaning === 'after';

  // "All" reads the whole DECK; every other size reads the session plan, whose front
  // is ordered by what is most worth practising. A drill is not a graded session:
  // asking for all of it means all of it.
  const [loaded, setLoaded] = useState<{ full: boolean; cards: SessionCard[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const full = size === 0;
  const loadCards = useCallback(() => {
    setLoadError(false);
    fetchSessionCards(sessionId, full)
      .then((cards) => setLoaded({ full, cards }))
      .catch(() => setLoadError(true));
  }, [sessionId, full]);
  useEffect(() => {
    loadCards();
  }, [loadCards]);
  /** True once the answer on hand is the answer for the SELECTED scope: a run begun before it would be the old queue. */
  const scopeReady = loaded?.full === full;

  const { queue, state } = useShadowQueue(
    {
      gapMs,
      repeat: rounds === 0 ? 'infinite' : rounds,
      shuffle,
      repeatEach,
      speakSecondary: speakMeaning,
      revealAfterGap: revealAfter,
      manualAdvance: !autoAdvance,
    },
    accent,
  );
  const { isPlaying, isPaused, currentId, pass, step, utterance, phase, awaitingNext } = state;
  const isRunning = isPlaying || isPaused;
  // The window keeps its schedule while hidden, like a podcast.
  useAudioKeepAlive(isRunning);

  const allCards = useMemo(() => loaded?.cards ?? [], [loaded]);
  // The first N, not a random N: shuffle re-orders whatever this selected.
  const cards = useMemo(() => (size > 0 ? allCards.slice(0, size) : allCards), [allCards, size]);

  const items: QueueItem[] = useMemo(
    () =>
      cards.map((card) => ({
        id: card.card_id,
        text: card.front_text,
        language: frontLanguage(
          { notesLang: card.notes?.learning_lang, deckLanguage: card.language },
          card.front_text,
        ),
        secondaryText: card.back_text.trim() ? card.back_text : undefined,
        secondaryLanguage: meaningLanguage(card.back_text, card.native_language, nativeLanguage),
      })),
    [cards, nativeLanguage],
  );
  const hasSpeakableMeaning = useMemo(() => items.some((i) => i.secondaryText), [items]);
  const hasEnglish = useMemo(
    () => items.some((i) => i.language === 'en' || (speakMeaning && i.secondaryLanguage === 'en')),
    [items, speakMeaning],
  );

  // Looked up in `allCards`, NOT the size-trimmed `cards`: a run holds the queue it was started with,
  // so shrinking the size mid-run must not leave the screen without the card that is still being said.
  const current = useMemo(
    () => allCards.find((c) => c.card_id === currentId) ?? null,
    [allCards, currentId],
  );
  const currentMeaningSpeakable = !!current && current.back_text.trim().length > 0;
  /** The meaning, unless it is held back for the recall pause; it stays for a card the run is holding on. */
  const meaningInView = showMeaning && (!revealAfter || phase === 'answer' || awaitingNext);

  const [finished, setFinished] = useState(false);
  const [finishedWords, setFinishedWords] = useState(0);
  const [finishedMs, setFinishedMs] = useState(0);

  // The stopwatch ticks only while sound is being made.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isPlaying || isPaused) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [isPlaying, isPaused]);
  const elapsedMs = isPlaying && !isPaused ? queue.elapsedNow() : state.elapsedMs;

  useEffect(() => {
    onProgress?.({
      step: finished ? items.length : step,
      total: items.length,
      elapsed: formatClock(elapsedMs / 1000),
      round: isRunning && step > 0 && rounds !== 1 ? pass + 1 : undefined,
      speakable: hasSpeakableMeaning,
      available: allCards.length,
      english: hasEnglish,
    });
  }, [
    onProgress,
    step,
    items.length,
    elapsedMs,
    finished,
    isRunning,
    rounds,
    pass,
    hasSpeakableMeaning,
    allCards.length,
    hasEnglish,
  ]);

  // ── Reporting ──────────────────────────────────────────────────────────────
  // Only what was actually heard, and only the seconds that actually played. Both are
  // accumulated here and flushed in whole chunks, so an abandoned run still counts and
  // a paused run does not keep earning.
  const heardRef = useRef<Set<string>>(new Set());
  const reportedMsRef = useRef(0);
  const heardCountRef = useRef(0);
  const seenThisRunRef = useRef<Set<string>>(new Set());
  const [reportError, setReportError] = useState(false);

  useEffect(() => {
    // `currentId` is set before the voice starts, so a run stopped in that window would credit a card that never sounded.
    if (!currentId || !isPlaying || isPaused) return;
    heardRef.current.add(currentId);
    if (!seenThisRunRef.current.has(currentId)) {
      seenThisRunRef.current.add(currentId);
      heardCountRef.current += 1;
    }
  }, [currentId, isPlaying, isPaused]);

  const flush = useCallback(() => {
    const now = queue.elapsedNow();
    // A new run's stopwatch restarts at zero; a baseline above it belongs to a run that is over.
    if (now < reportedMsRef.current) reportedMsRef.current = 0;
    const unreported = Math.floor((now - reportedMsRef.current) / 1000);
    const cardIds = [...heardRef.current];
    if (unreported < 1 && cardIds.length === 0) return;
    reportedMsRef.current += unreported * 1000;
    heardRef.current.clear();
    reportShadowProgress({
      session_id: sessionId,
      card_ids: cardIds,
      played_seconds: Math.max(0, unreported),
    })
      .then(() => setReportError(false))
      // Losing a report costs a little progress, never the session — and re-queueing risks paying twice.
      .catch(() => setReportError(true));
  }, [queue, sessionId]);

  // Flush at every boundary where time stops accruing, and on a heartbeat while playing.
  useEffect(() => {
    if (!isPlaying || isPaused) flush();
  }, [isPlaying, isPaused, flush]);
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    if (!isPlaying || isPaused) return;
    const id = setInterval(flush, 30_000);
    return () => clearInterval(id);
  }, [isPlaying, isPaused, flush]);

  const resetRunCounters = () => {
    reportedMsRef.current = 0;
    heardCountRef.current = 0;
    seenThisRunRef.current = new Set();
  };

  const handleStart = useCallback(() => {
    if (!scopeReady) return; // the queue on screen is the previous scope's
    flush();
    resetRunCounters();
    setFinished(false);
    void queue.playAll(items).then((result) => {
      if (result !== 'finished') return; // superseded by Reset, not completed
      setFinishedWords(heardCountRef.current);
      setFinishedMs(queue.getState().elapsedMs);
      setFinished(true);
    });
  }, [flush, queue, items, scopeReady]);

  const handleReset = useCallback(() => {
    flush();
    resetRunCounters();
    setFinished(false);
    queue.reset();
  }, [flush, queue]);

  // A new size ends the run: the loop keeps the queue it was handed, so a live run would carry on
  // over the old list while the count describes the new one.
  const sizeSeenRef = useRef(size);
  useEffect(() => {
    if (sizeSeenRef.current === size) return;
    sizeSeenRef.current = size;
    if (isPlaying || isPaused) handleReset();
  }, [size, isPlaying, isPaused, handleReset]);

  const shell = (children: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
  );

  if (!scopeReady && allCards.length === 0 && !loadError) {
    return shell(
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-caption" />
      </div>,
    );
  }
  // The words never arrived — distinct from a session that genuinely has none.
  if (loadError && allCards.length === 0) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-error">{t('shadowing.loadFailed')}</p>
        <Button variant="accent" onClick={loadCards}>
          <RotateCcw />
          {t('shadowing.retry')}
        </Button>
      </div>,
    );
  }
  if (items.length === 0) {
    return shell(
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-sm text-caption">{t('shadowing.empty')}</p>
      </div>,
    );
  }

  const ipa = current?.notes?.ipa;
  // The front's size steps down as it gets longer: a word can carry 64px, a sentence at 64px wraps no matter the width.
  const frontLength = current?.front_text.trim().length ?? 0;
  const frontSize = focusMode
    ? frontLength > 48
      ? 'text-[1.9em]'
      : frontLength > 24
        ? 'text-[2.6em]'
        : 'text-[3.4em]'
    : frontLength > 48
      ? 'text-[1.3em]'
      : frontLength > 24
        ? 'text-[1.7em]'
        : 'text-[2.2em]';

  const showNormalTab = setupTab === 'normal' && !!normalSetup;
  const settingsPanel = (
    <ShadowingSettingsPanel
      prefs={prefs}
      runSize={items.length}
      available={allCards.length}
      hasSpeakableMeaning={hasSpeakableMeaning}
      accent={accent}
      onAccentChange={onAccentChange}
      showAccent={hasEnglish}
    />
  );

  return shell(
    <>
      <div
        className={cn(
          'flex min-h-0 flex-1 justify-center overflow-y-auto px-4',
          focusMode ? 'py-6' : 'py-8',
        )}
      >
        {finished && !isRunning ? (
          /* The run reached the end. A drill with no ending never feels finished, and the two numbers
             worth seeing are the two this mode can honestly claim: words heard, and time actually spent. */
          <div className="my-auto w-full max-w-md rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Check className="h-6 w-6 text-success" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t('shadowing.doneTitle')}</h2>
            <p className="mt-1 text-xs text-caption">{t('shadowing.doneSub')}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted px-4 py-3">
                <div className="text-xl font-bold tabular-nums text-foreground">
                  {finishedWords}
                </div>
                <div className="mt-0.5 text-[11px] text-caption">{t('shadowing.doneWords')}</div>
              </div>
              <div className="rounded-xl bg-muted px-4 py-3">
                <div className="text-xl font-bold tabular-nums text-foreground">
                  {formatClock(finishedMs / 1000)}
                </div>
                <div className="mt-0.5 text-[11px] text-caption">{t('shadowing.doneTime')}</div>
              </div>
            </div>
            {reportError && (
              <p className="mt-3 text-xs text-error">{t('shadowing.reportFailed')}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Button variant="accent" onClick={handleStart} disabled={!scopeReady}>
                <RotateCcw />
                {t('shadowing.again')}
              </Button>
              {onFinish && (
                <Button variant="outline" onClick={onFinish} loading={finishing}>
                  <Check />
                  {t('shadowing.done')}
                </Button>
              )}
            </div>
          </div>
        ) : current ? (
          <div
            className={cn(
              'relative my-auto flex w-full flex-col items-center justify-center rounded-2xl border border-border bg-card px-5 py-10 text-center sm:px-6 sm:py-14',
              focusMode
                ? 'min-h-[320px] max-w-[72em] sm:min-h-[420px]'
                : 'min-h-[200px] max-w-[48em] sm:min-h-[260px]',
            )}
          >
            <div className="mb-6 flex items-center justify-center gap-2">
              <span
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full',
                  isPlaying && !isPaused ? 'bg-accent/15 text-accent' : 'bg-muted text-caption',
                )}
              >
                <Volume2 className={cn('h-4 w-4', isPlaying && !isPaused && 'animate-pulse')} />
              </span>
              {repeatEach > 1 && utterance > 0 && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold tabular-nums text-muted-foreground">
                  {t('shadowing.listenOf', { n: utterance, total: repeatEach })}
                </span>
              )}
              {phase === 'recall' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  {t('shadowing.recall')}
                </span>
              )}
              {phase === 'answer' && utterance === 0 && speakMeaning && currentMeaningSpeakable && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                  <MessageSquare className="h-3 w-3" />
                  {t('shadowing.meaning')}
                </span>
              )}
            </div>

            {showWord ? (
              <div
                className={cn(
                  'max-w-full text-balance break-words font-black leading-tight tracking-tight text-foreground',
                  frontSize,
                )}
                dir="auto"
                data-testid="shadow-word"
              >
                {current.front_text}
              </div>
            ) : (
              <div
                className={cn(
                  'mx-auto max-w-[60%] select-none overflow-hidden whitespace-nowrap tracking-wide text-caption',
                  focusMode ? 'text-[3em]' : 'text-[2em]',
                )}
                aria-label={t('shadowing.hiddenWord')}
              >
                {MASK}
              </div>
            )}

            {/* IPA + part of speech + level — hidden with the word, never without it: a transcription spells
                out the exact thing a masked prompt asks the ear to catch. */}
            {showWord && (ipa || current.notes?.part_of_speech || current.notes?.cefr_level) && (
              <div
                className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs"
                dir="ltr"
              >
                {ipa && <span className="font-mono text-[1.1em] text-primary">{ipa}</span>}
                {current.notes?.part_of_speech && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-bold uppercase tracking-wider text-accent">
                    {current.notes.part_of_speech}
                  </span>
                )}
                {current.notes?.cefr_level && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-bold tracking-wider text-primary">
                    {current.notes.cefr_level}
                  </span>
                )}
              </div>
            )}

            {/* The learner's turn, by hand. Only while the run is actually holding. */}
            {awaitingNext && (
              <div className="mt-8 flex items-center justify-center gap-2.5">
                <Button variant="outline" onClick={() => void queue.replay()}>
                  <RotateCcw />
                  {t('shadowing.replay')}
                </Button>
                <Button variant="accent" onClick={() => queue.next()}>
                  {t('shadowing.next')}
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </div>
            )}

            {meaningInView ? (
              <div
                className={cn(
                  'mx-auto mt-6 max-w-[40em] text-balance break-words leading-relaxed text-muted-foreground',
                  focusMode ? 'text-[1.5em]' : 'text-[1.15em]',
                )}
                dir="auto"
                data-testid="shadow-meaning"
              >
                {current.back_text}
              </div>
            ) : (
              <div
                className={cn(
                  'mx-auto mt-6 max-w-[50%] select-none overflow-hidden whitespace-nowrap tracking-wide text-caption',
                  focusMode ? 'text-[1.5em]' : 'text-[1.15em]',
                )}
                aria-label={t('shadowing.hiddenMeaning')}
              >
                {MASK}
              </div>
            )}
          </div>
        ) : (
          /* Nothing is playing yet. The settings that decide what the run IS — how many words, how long the
             pause, how many rounds — belong here, at the one moment the learner is choosing them. */
          <div className="my-auto w-full max-w-md rounded-2xl border border-border bg-card px-6 py-8 lg:max-w-3xl lg:px-8">
            {normalSetup && (
              <div className="mb-6 flex justify-center border-b border-border pb-5 text-center">
                <StudyModePicker mode={setupTab} onChange={setSetupTab} />
              </div>
            )}
            <div className="text-center">
              <div
                className={cn(
                  'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full',
                  showNormalTab ? 'bg-primary/10' : 'bg-accent/10',
                )}
              >
                {showNormalTab ? (
                  <Layers className="h-6 w-6 text-primary" />
                ) : (
                  <Volume2 className="h-6 w-6 text-accent" />
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {showNormalTab ? t('runner.normalSetupTitle') : t('shadowing.readyTitle')}
              </h2>
              <p className="mt-1 text-xs text-caption">
                {showNormalTab ? t('runner.normalSetupSub') : t('shadowing.idle')}
              </p>
            </div>

            {/* Two columns from `lg`: the four groups stacked in one narrow column made a page and a half of
                scrolling in the middle of a mostly empty screen. */}
            <div className="mt-6 grid gap-4 text-start lg:grid-cols-2 lg:gap-x-10 lg:[&>section:nth-child(2)]:border-t-0 lg:[&>section:nth-child(2)]:pt-0">
              {showNormalTab ? normalSetup?.settings : settingsPanel}
            </div>

            <div className="mt-6 flex items-center justify-center">
              {showNormalTab ? (
                <Button variant="accent" size="lg" onClick={normalSetup?.onStart}>
                  <Play />
                  {t('shadowing.start')}
                </Button>
              ) : (
                <Button variant="accent" size="lg" onClick={handleStart} loading={!scopeReady}>
                  <Play />
                  {t('shadowing.start')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player bar: controls only, and only while a run is open. The count, the round and the clock live in
          the session header. */}
      {isRunning && (
        <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/70 px-4 py-3 backdrop-blur-sm">
          {awaitingNext ? null : isPlaying && !isPaused ? (
            <Button variant="outline" onClick={() => queue.pause()}>
              <Pause />
              {t('shadowing.pause')}
            </Button>
          ) : (
            <Button variant="accent" onClick={() => (isPaused ? queue.resume() : handleStart())}>
              <Play />
              {isPaused ? t('shadowing.resume') : t('shadowing.start')}
            </Button>
          )}
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw />
            {t('shadowing.reset')}
          </Button>
        </div>
      )}
    </>,
  );
}
