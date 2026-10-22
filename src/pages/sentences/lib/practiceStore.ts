import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import type { AiSource } from '@/lib/aiSource';
import * as api from './api';
import { NotReadyError, SentencesError, toSentencesError } from './api';
import { grade as gradeLocally, isCorrect, type Grade } from './grade';
import { finalGrade, judgeSentence, type JudgeOutcome } from './judge';
import { forgetClip, stopClip } from './clip';
import type {
  AnswerModel,
  AnswerModelGrade,
  AttemptResult,
  Direction,
  Level,
  Meta,
  PanelSection,
  PracticeSentence,
  PracticeStats,
  PromptSide,
  Rule,
} from './types';

/**
 * One practice round, in the app.
 *
 * The website renders every step on its server and keeps the round in the URL.
 * Here the round lives in this store, so the settings, the score and the card in
 * front of the learner survive going to a cheatsheet page and back. Every step is
 * one call to `sentences-app`; the steps themselves (prompt, listening text,
 * result, retry, finished) are the website's.
 */

/** A card dealt to the learner: its prompt side and the sealed token that names it. */
export type Dealt = {
  token: string;
  dir: Direction;
  track: string;
  audio: string | null;
  card: PromptSide & { unit: number | null; level: Level };
};

/** Why a written answer has no AI scorecard, for the line the screen shows. */
export type JudgeNote = 'not_set_up' | 'unavailable' | null;

export type RetryInfo = { round: number; wrong: number; skipped: number };

export type Step =
  | { k: 'boot' }
  | { k: 'notReady' }
  /** Dealing the next card. */
  | { k: 'loading' }
  | { k: 'prompt'; dealt: Dealt; retry: RetryInfo | null }
  /** Listening, second step: the text, the meaning still hidden. */
  | { k: 'listenText'; dealt: Dealt; sentence: PracticeSentence; rules: Rule[] }
  /** Question and answer, second step: the question with its meaning, and the place to answer. */
  | { k: 'answerStep'; dealt: Dealt; sentence: PracticeSentence; rules: Rule[] }
  | {
      k: 'result';
      dealt: Dealt;
      sentence: PracticeSentence;
      rules: Rule[];
      /** What was typed (production, question and answer). */
      answer: string | null;
      grade: Grade | null;
      judgeNote: JudgeNote;
      /** Self-graded cards: the learner has not yet said whether they knew it. */
      asking: boolean;
      schedule: AttemptResult | null;
      /** Question and answer. */
      answers: AnswerModel[] | null;
      answerGrade: AnswerModelGrade | null;
      /** Production that missed does not move on until it was written once. */
      mustRetype: boolean;
      retryRound: number;
    }
  | {
      k: 'finished';
      scope: 'level' | 'unit' | 'topic';
      level: Level;
      unit: number | null;
      nextUnit: number | null;
      reset: string | null;
      replay: string | null;
      due: number;
    }
  | { k: 'reviewEmpty' }
  | { k: 'empty' }
  /** A refusal (the daily budget, an expired card) — said plainly, with a way on. */
  | { k: 'notice'; code: string; again: 'deal' | 'reload' };

export type Outcome = { schedule: AttemptResult | null; heard: boolean | null };

const AUTOPLAY_SETTING = 'sentences_autoplay';
const emptyScore = { r: 0, n: 0 };

interface PracticeState {
  lang: string | null;
  /** The language of the app (the learner's), and the one explanations are read in. */
  locale: string;
  explain: string;
  meta: Meta | null;
  picks: Record<string, string>;
  score: { r: number; n: number };
  stats: PracticeStats | null;
  step: Step;
  /** Which button is in flight (it spins; the others only stop accepting clicks). */
  busy: string | null;
  /** The AI is being asked about the answer just written. */
  judging: boolean;
  /** An inline problem that does not replace the card (an answer that could not be saved). */
  warning: string | null;
  /** What the previous card's answer did — shown above the next card. */
  outcome: Outcome | null;
  plays: number;
  heard: boolean | null;
  autoPlay: boolean;
  /** Verbs that have a conjugation page in the cheatsheet — the analysis links only those. */
  verbPages: string[];

  /** `initial`: picks to start with (from the record: «review all due», «back to practice») — it forces a fresh round. */
  open: (lang: string, locale: string, initial?: Record<string, string>) => Promise<void>;
  reload: () => Promise<void>;
  pick: (section: PanelSection, value: string) => Promise<void>;
  setAutoPlay: (on: boolean) => void;
  countPlay: () => void;
  deal: () => Promise<void>;
  reveal: () => Promise<void>;
  /** Listening: «I caught it by ear» or not, then the meaning. */
  hear: (heard: boolean) => void;
  /** Question and answer: the written answer. */
  submitQuestion: (typed: string, heard: boolean) => Promise<void>;
  submitWritten: (typed: string, ai: AiSource) => Promise<void>;
  /** Self-graded: «I knew it» / «I didn't know». */
  selfGrade: (knew: boolean) => Promise<void>;
  /** Question and answer, no model matched: the learner's own call. */
  judgeOwn: (right: boolean) => Promise<void>;
  next: () => Promise<void>;
  skip: () => Promise<void>;
  startOver: () => Promise<void>;
  replay: () => Promise<void>;
  showReview: () => Promise<void>;
  stopAudio: () => void;
}

const navigateKeys = (sections: PanelSection[]) =>
  new Set(sections.filter((s) => s.kind === 'navigate').map((s) => s.key));

/** The picks the app carries: the canonical ones, minus the language (it is the page). */
const picksOf = (meta: Meta) => {
  const skip = navigateKeys(meta.sections);
  return Object.fromEntries(Object.entries(meta.state).filter(([k]) => !skip.has(k)));
};

const errorCode = (err: unknown) => {
  const e = toSentencesError(err);
  return e instanceof SentencesError ? e.code : 'UNKNOWN_ERROR';
};

let epoch = 0;

export const usePracticeStore = create<PracticeState>()((set, get) => {
  const trackOf = () => get().meta?.deal.track ?? 'general';
  const levelOf = (): Level => (get().meta?.level ?? 'A1') as Level;
  const orderOf = () => get().meta?.deal.order ?? 'random';

  const guarded = async (key: string, run: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy: key, warning: null });
    const mine = epoch;
    try {
      await run();
    } catch (err) {
      if (mine !== epoch) return;
      const e = toSentencesError(err);
      if (e instanceof NotReadyError) set({ step: { k: 'notReady' } });
      else set({ warning: e.code });
    } finally {
      if (mine === epoch) set({ busy: null, judging: false });
    }
  };

  const refreshStats = async () => {
    const { lang } = get();
    if (!lang) return;
    try {
      const stats = await api.getStats(lang, levelOf(), trackOf());
      if (get().lang === lang) set({ stats });
    } catch {
      /* the position line is a courtesy; practice goes on without it */
    }
  };

  const loadMeta = async (picks: Record<string, string>) => {
    const { lang, locale } = get();
    if (!lang) return;
    const { meta, explain } = await api.getMeta(lang, locale, picks);
    set({ meta, explain, picks: picksOf(meta) });
  };

  const verbsOf = async (lang: string, explain: string) => {
    // Which verbs have a conjugation page here: a link to a page that does not exist is worse than none.
    try {
      const { cheatsheet } = await import('@/pages/cheatsheet/lib/service');
      const list = (await cheatsheet.getVerbList(lang, explain))?.data ?? [];
      return list.map((v: { lemma: string }) => v.lemma);
    } catch {
      return [] as string[];
    }
  };

  const toNotice = (err: unknown, again: 'deal' | 'reload' = 'deal') => {
    const e = toSentencesError(err);
    if (e instanceof NotReadyError) set({ step: { k: 'notReady' } });
    else set({ step: { k: 'notice', code: e.code, again } });
  };

  return {
    lang: null,
    locale: 'en',
    explain: 'en',
    meta: null,
    picks: {},
    score: emptyScore,
    stats: null,
    step: { k: 'boot' },
    busy: null,
    judging: false,
    warning: null,
    outcome: null,
    plays: 1,
    heard: null,
    autoPlay: false,
    verbPages: [],

    open: async (lang, locale, initial) => {
      const s = get();
      void getSetting(AUTOPLAY_SETTING).then((v) => set({ autoPlay: v === '1' }));
      const forced = !!initial && Object.keys(initial).length > 0;
      // Coming back from a cheatsheet page: the round is where it was left.
      if (
        !forced &&
        s.lang === lang &&
        s.locale === locale &&
        s.meta &&
        s.step.k !== 'boot' &&
        s.step.k !== 'notReady'
      ) {
        void refreshStats();
        return;
      }
      epoch++;
      stopClip();
      set({
        lang,
        locale,
        explain: locale,
        meta: null,
        picks: forced ? initial : {},
        verbPages: [],
        score: emptyScore,
        stats: null,
        step: { k: 'boot' },
        busy: null,
        judging: false,
        warning: null,
        outcome: null,
      });
      await get().reload();
    },

    reload: async () => {
      const mine = ++epoch;
      set({ step: { k: 'boot' }, busy: null, judging: false, warning: null });
      try {
        await loadMeta(get().picks);
        if (mine !== epoch) return;
        const { lang, explain } = get();
        if (lang) void verbsOf(lang, explain).then((v) => mine === epoch && set({ verbPages: v }));
        await get().deal();
      } catch (err) {
        if (mine === epoch) toNotice(err, 'reload');
      }
    },

    pick: async (section, value) => {
      const { picks, score } = get();
      const next = { ...picks, [section.key]: value };
      for (const key of section.resets) delete next[key];
      // A new filter starts a new stretch: the score belongs to the old one — unless the row says it does not.
      const keep = section.keepsScore ? score : emptyScore;
      if (get().busy) return;
      set({ busy: `pick:${section.key}`, warning: null });
      const mine = ++epoch;
      stopClip();
      try {
        await loadMeta(next);
        if (mine !== epoch) return;
        set({ score: keep, outcome: null, busy: null });
        await get().deal();
      } catch (err) {
        if (mine === epoch) {
          set({ busy: null });
          toNotice(err, 'reload');
        }
      }
    },

    setAutoPlay: (on) => {
      set({ autoPlay: on });
      void setSetting(AUTOPLAY_SETTING, on ? '1' : '0').catch(() => {});
    },

    countPlay: () => set((s) => ({ plays: s.plays + 1 })),

    deal: async () => {
      const { lang, locale, explain, picks, meta, score } = get();
      if (!lang || !meta) return;
      const mine = epoch;
      stopClip();
      set({ step: { k: 'loading' }, plays: 1, heard: null, judging: false });
      // Every third card, one the learner got wrong (or is due again) takes the place of a new one —
      // only for someone who asked for that in the settings.
      const mix = meta.deal.mix === '1' && orderOf() !== 'review' && score.n % 3 === 2;
      try {
        const answer = await api.deal({ lang, locale: explain || locale, state: picks, mix });
        if (mine !== epoch) return;
        switch (answer.status) {
          case 'card':
            set({
              step: {
                k: 'prompt',
                retry: null,
                dealt: {
                  token: answer.token,
                  dir: answer.dir,
                  track: answer.track,
                  audio: answer.audio,
                  card: answer.card,
                },
              },
            });
            break;
          case 'review_empty':
            set({ step: { k: 'reviewEmpty' } });
            break;
          case 'empty':
            set({ step: { k: 'empty' } });
            break;
          case 'finished': {
            const unit = Number(meta.deal.unit);
            set({
              step: {
                k: 'finished',
                scope: answer.scope ?? 'level',
                level: levelOf(),
                unit: Number.isInteger(unit) && unit > 0 ? unit : null,
                nextUnit: answer.nextUnit ?? null,
                reset: answer.reset,
                replay: answer.replay ?? null,
                due: answer.due,
              },
            });
            break;
          }
        }
      } catch (err) {
        if (mine === epoch) toNotice(err);
      }
      void refreshStats();
    },

    reveal: () =>
      guarded('reveal', async () => {
        const { step, lang, explain, locale } = get();
        if (step.k !== 'prompt' || !lang) return;
        const { dealt } = step;
        const revealed = await api.revealPatiently(lang, explain || locale, dealt.token);
        if (dealt.dir === 'listen') {
          set({
            step: { k: 'listenText', dealt, sentence: revealed.sentence, rules: revealed.rules },
          });
        } else if (dealt.dir === 'answer') {
          set({
            step: { k: 'answerStep', dealt, sentence: revealed.sentence, rules: revealed.rules },
          });
        } else {
          set({
            step: {
              k: 'result',
              dealt,
              sentence: revealed.sentence,
              rules: revealed.rules,
              answer: null,
              grade: null,
              judgeNote: null,
              asking: true,
              schedule: null,
              answers: null,
              answerGrade: null,
              mustRetype: false,
              retryRound: 0,
            },
          });
        }
      }),

    hear: (heard) => {
      const { step } = get();
      if (step.k !== 'listenText') return;
      set({
        heard,
        step: {
          k: 'result',
          dealt: step.dealt,
          sentence: step.sentence,
          rules: step.rules,
          answer: null,
          grade: null,
          judgeNote: null,
          asking: true,
          schedule: null,
          answers: null,
          answerGrade: null,
          mustRetype: false,
          retryRound: 0,
        },
      });
    },

    submitQuestion: (typed, heard) =>
      guarded('check', async () => {
        const { step, lang, explain, locale, plays } = get();
        if (step.k !== 'answerStep' || !lang) return;
        const res = await api.answerQuestion(lang, explain || locale, step.dealt.token, typed, {
          plays,
          heard,
        });
        const unmatched = res.answerGrade.verdict === 'unmatched';
        set((s) => ({
          heard,
          score: unmatched ? s.score : { r: s.score.r + 1, n: s.score.n + 1 },
          step: {
            k: 'result',
            dealt: step.dealt,
            sentence: res.sentence,
            rules: res.rules,
            answer: typed,
            grade: null,
            judgeNote: null,
            asking: unmatched,
            schedule: res.attempt,
            answers: res.answers,
            answerGrade: res.answerGrade,
            mustRetype: false,
            retryRound: 0,
          },
        }));
        void refreshStats();
      }),

    judgeOwn: (right) =>
      guarded(right ? 'right' : 'wrong', async () => {
        const { step, lang, explain, locale, plays, heard } = get();
        if (step.k !== 'result' || step.dealt.dir !== 'answer' || !lang) return;
        const res = await api.answerQuestion(
          lang,
          explain || locale,
          step.dealt.token,
          step.answer ?? '',
          { plays, heard },
          right ? 'knew' : 'missed',
        );
        set((s) => ({
          score: { r: s.score.r + (right ? 1 : 0), n: s.score.n + 1 },
          step: { ...step, asking: false, schedule: res.attempt },
        }));
        void refreshStats();
      }),

    submitWritten: (typed, ai) =>
      guarded('check', async () => {
        const { step, lang, explain, locale } = get();
        if (step.k !== 'prompt' || !lang) return;
        const { dealt } = step;
        const round = step.retry?.round ?? 0;
        const loc = explain || locale;
        const first = await api.answerWritten(lang, loc, dealt.token, typed, round);
        // The card's own check, as the website's grade — recomputed from the sentence if the server sent none.
        const base: Grade = first.grade ?? gradeLocally(first.sentence, typed);
        let final = base;
        let attempt = first.attempt;
        let note: JudgeNote = null;
        if (first.pending !== false && base.verdict !== 'exact' && !attempt) {
          // Everything but the sentence itself is a judgement about the learner's language, and the
          // learner's own AI makes it. Not set up, or unreachable: the card's own verdict stands.
          set({ judging: typed.trim() !== '' && ai.kind === 'own' });
          const outcome: JudgeOutcome = await judgeSentence(ai, lang, first.sentence.text, typed);
          if (outcome.kind === 'not_set_up' || outcome.kind === 'unavailable') note = outcome.kind;
          final = finalGrade(base, outcome);
          try {
            attempt = (
              await api.settle(
                lang,
                dealt.token,
                typed,
                final.verdict,
                outcome.kind === 'judged' ? outcome.card : null,
                round,
              )
            ).attempt;
          } catch (err) {
            // The verdict is on screen; the history just missed one answer. Say so, never silently.
            const e = toSentencesError(err);
            if (e instanceof NotReadyError) throw e;
            set({ warning: 'NOT_SAVED' });
          }
        }
        const correct = isCorrect(final.verdict);
        set((s) => ({
          score: { r: s.score.r + (correct ? 1 : 0), n: s.score.n + 1 },
          step: {
            k: 'result',
            dealt,
            sentence: first.sentence,
            rules: first.rules,
            answer: typed,
            grade: final,
            judgeNote: note,
            asking: false,
            schedule: attempt ?? null,
            answers: null,
            answerGrade: null,
            mustRetype: final.verdict === 'wrong' || final.verdict === 'accents',
            retryRound: round,
          },
        }));
        void refreshStats();
      }),

    selfGrade: (knew) =>
      guarded(knew ? 'knew' : 'missed', async () => {
        const { step, lang, explain, locale, plays, heard } = get();
        if (step.k !== 'result' || !lang) return;
        const ear = step.dealt.dir === 'listen' ? { plays, heard } : {};
        const res = await api.answerSelf(
          lang,
          explain || locale,
          step.dealt.token,
          knew ? 'knew' : 'missed',
          ear,
        );
        forgetClip(step.dealt.audio);
        set((s) => ({
          score: { r: s.score.r + (knew ? 1 : 0), n: s.score.n + 1 },
          outcome: { schedule: res.attempt, heard: step.dealt.dir === 'listen' ? heard : null },
        }));
        await get().deal();
      }),

    next: async () => {
      const { step, lang } = get();
      if (step.k !== 'result' || !lang) return get().deal();
      set({ outcome: null });
      forgetClip(step.dealt.audio);
      if (step.mustRetype) {
        // The same card again, as its own attempt: a fresh token, and how it has gone so far.
        await guarded('next', async () => {
          const again = await api.retry(lang, step.dealt.token);
          set({
            step: {
              k: 'prompt',
              dealt: { ...step.dealt, token: again.token },
              retry: { round: step.retryRound + 1, wrong: again.wrong, skipped: again.skipped },
            },
          });
        });
        return;
      }
      await get().deal();
    },

    skip: () =>
      guarded('skip', async () => {
        const { step, lang } = get();
        if (step.k !== 'prompt' || !lang || !step.retry) return;
        await api.skip(lang, step.dealt.token, step.retry.round || 1);
        await get().deal();
      }),

    startOver: () =>
      guarded('again', async () => {
        const { step, lang } = get();
        if (step.k !== 'finished' || !lang || !step.reset) return;
        await api.resetLevel(lang, step.level, step.reset);
        set({ score: emptyScore });
        await get().deal();
      }),

    replay: () =>
      guarded('again', async () => {
        const { step, lang } = get();
        if (step.k !== 'finished' || !lang || !step.replay) return;
        await api.replayUnit(lang, step.level, step.replay);
        set({ score: emptyScore });
        await get().deal();
      }),

    showReview: async () => {
      const { meta } = get();
      const section = meta?.sections.find((s) => s.key === 'order');
      if (!meta || !section) return;
      await get().pick({ ...section, resets: [], keepsScore: false }, 'review');
    },

    stopAudio: () => stopClip(),
  };
});

/** Verbs with a conjugation page, for the analysis' links (set by `reload`). */
export const useVerbPages = () => usePracticeStore((s) => s.verbPages);
