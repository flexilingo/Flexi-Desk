import { invoke } from '@tauri-apps/api/core';
import type { Scorecard } from './types';
import { isAiSetupError, type AiSource } from '@/lib/aiSource';
import { withScorecard, type Grade } from './grade';

/**
 * The answer judge, on the learner's OWN AI.
 *
 * The website asks a model on its server whether a written sentence is right
 * when it differs from the card's. The desktop app never does: the sentence goes
 * to the model on this computer (or the learner's own key) through the
 * `sentences_judge` command, which fills in a scorecard and applies the same
 * accepted / not accepted rule. `lib/aiSource.ts` decides whether that AI is
 * ready; if it is not, nothing is called and the static grade stands.
 *
 * The result says WHY a card has no scorecard, so the screen can say it:
 *   judged      the learner's AI answered (`card`)
 *   not_set_up  the user's AI is not set up — show the setup card
 *   unavailable it was asked and could not answer — the static verdict stands
 *   skipped     nothing to ask (an empty answer)
 */
export type JudgeOutcome =
  | { kind: 'judged'; card: Scorecard }
  | { kind: 'not_set_up' }
  | { kind: 'unavailable' }
  | { kind: 'skipped' };

/** Whether the learner's own AI may be asked right now. The cloud is never used here. */
export const canJudge = (own: AiSource): boolean => own.kind === 'own';

export async function judgeSentence(
  own: AiSource,
  lang: string,
  target: string,
  answer: string,
  ask: (lang: string, target: string, answer: string) => Promise<Scorecard> = (l, t, a) =>
    invoke<Scorecard>('sentences_judge', { lang: l, target: t, answer: a }),
): Promise<JudgeOutcome> {
  if (!answer.trim()) return { kind: 'skipped' };
  if (own.kind === 'unconfigured') return { kind: 'not_set_up' };
  if (!canJudge(own)) return { kind: 'unavailable' };
  try {
    const card = await ask(lang, target, answer);
    if (!card || typeof card.accepted !== 'boolean') return { kind: 'unavailable' };
    return { kind: 'judged', card };
  } catch (err) {
    return isAiSetupError(err) ? { kind: 'not_set_up' } : { kind: 'unavailable' };
  }
}

/** The grade the learner sees, and what it was judged by. */
export function finalGrade(base: Grade, outcome: JudgeOutcome): Grade {
  return outcome.kind === 'judged' ? withScorecard(base, outcome.card) : base;
}
