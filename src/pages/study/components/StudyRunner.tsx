import { useCallback, useEffect, useRef, useState } from 'react';
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
import { DictionarySheet } from '@/pages/review/components/DictionarySheet';
import { useStudyStore } from '../stores/studyStore';
import type { SessionSummaryResponse } from '../types';
import { METHOD_REGISTRY } from './session/methods';
import { StudyProgressHeader } from './session/StudyProgressHeader';
import { StudyComplete } from './session/StudyComplete';
import { PrevCardReview, type PrevCard } from './session/PrevCardReview';
import { StudySettingsDialog } from './StudySettingsDialog';
import type { StudySubmitArgs } from './session/types';

export function StudyRunner() {
  const { t } = useTranslation('study');
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const config = useStudyStore((s) => s.config);
  const current = useStudyStore((s) => s.current);
  const deckStatus = useStudyStore((s) => s.deckStatus);
  const advancing = useStudyStore((s) => s.advancing);
  const submitting = useStudyStore((s) => s.submitting);
  const error = useStudyStore((s) => s.error);
  const fetchConfig = useStudyStore((s) => s.fetchConfig);
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
  const [confirmExit, setConfirmExit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lookup, setLookup] = useState<{ word: string; sentence: string } | null>(null);
  const [prevCard, setPrevCard] = useState<PrevCard | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const startedRef = useRef(false);
  const finishingRef = useRef(false);

  // Elapsed clock — frozen once the session is done.
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

  const finish = useCallback(
    async (abandoned: boolean) => {
      if (!sessionId || finishingRef.current) return;
      finishingRef.current = true;
      const res = await endSession(sessionId, abandoned);
      if (abandoned) {
        resetRunner();
        navigate('/study');
        return;
      }
      setSummary(res);
      setFinished(true);
    },
    [sessionId, endSession, navigate, resetRunner],
  );

  const advance = useCallback(async () => {
    if (!sessionId) return;
    const res = await nextActivity(sessionId);
    // An empty activity id means the queue is exhausted → complete the session.
    if (res && !res.activity.id) {
      await finish(false);
    }
  }, [sessionId, nextActivity, finish]);

  // Boot: load config + deck status (for settings) + serve the first activity.
  useEffect(() => {
    if (startedRef.current || !sessionId) return;
    startedRef.current = true;
    if (!config) fetchConfig();
    if (deckStatus.length === 0) fetchDeckStatus();
    advance();
  }, [sessionId, config, deckStatus.length, fetchConfig, fetchDeckStatus, advance]);

  const handleSubmit = useCallback(
    async (args: StudySubmitArgs) => {
      if (!sessionId || !current) return null;
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

  const restart = async () => {
    resetRunner();
    setFinished(false);
    setSummary(null);
    setTally({ correct: 0, incorrect: 0 });
    setElapsed(0);
    finishingRef.current = false;
    startedRef.current = false;
    // "Study more" pulls cards forward even if nothing is due yet.
    const id = await startSession({ scope: 'due', study_ahead: true });
    if (id) navigate(`/study/session/${id}`, { replace: true });
    else navigate('/study');
  };

  if (finished) {
    return (
      <StudyComplete
        summary={summary}
        elapsedSeconds={elapsed}
        onDone={() => {
          resetRunner();
          navigate('/study');
        }}
        onStudyMore={restart}
      />
    );
  }

  // Initial load / between activities with nothing rendered yet.
  if (!current || !current.activity.id) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">{t('landing.preparing')}</span>
        {error && <span className="text-sm text-error">{error}</span>}
      </div>
    );
  }

  const Method = METHOD_REGISTRY[current.activity.activity_type] ?? METHOD_REGISTRY.recall;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <StudyProgressHeader
        total={current.total}
        remaining={current.remaining}
        correct={tally.correct}
        incorrect={tally.incorrect}
        elapsedSeconds={elapsed}
        cardProgress={current.card_progress}
        requeueCount={current.requeue_count}
        onPrevCard={prevCard ? () => setPrevOpen(true) : undefined}
        onSettings={() => setSettingsOpen(true)}
        onExit={() => setConfirmExit(true)}
      />

      {advancing ? (
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Method
          key={current.activity.id}
          activity={current.activity}
          cardMeta={current.card_meta}
          config={config}
          srsAlgorithm={current.srs_algorithm}
          cardProgress={current.card_progress}
          submitting={submitting}
          onSubmit={handleSubmit}
          onNext={advance}
          onLookup={(word, sentence) => setLookup({ word, sentence })}
        />
      )}

      {error && <div className="text-center text-sm text-error">{error}</div>}

      <DictionarySheet
        open={lookup !== null}
        onOpenChange={(open) => !open && setLookup(null)}
        word={lookup?.word ?? null}
        sentenceContext={lookup?.sentence ?? ''}
      />

      <PrevCardReview
        open={prevOpen}
        onOpenChange={setPrevOpen}
        card={prevCard}
        onLookup={(word, sentence) => setLookup({ word, sentence })}
      />

      <StudySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        decks={deckStatus}
        initialTab="prefs"
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
            <Button variant="destructive" onClick={() => finish(true)}>
              {t('runner.exit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
