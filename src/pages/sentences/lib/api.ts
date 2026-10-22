import { supabaseCall } from '@/lib/supabase';
import { parseCloudError } from '@/lib/cloudError';
import type {
  AnswerModel,
  AnswerModelGrade,
  AttemptResult,
  DealAnswer,
  HistoryFilter,
  HistoryPage,
  Level,
  Meta,
  PracticeSentence,
  PracticeStats,
  Rule,
  Scorecard,
} from './types';
import type { Grade } from './grade';

/**
 * Sentence practice, from the desktop app's side of the backend.
 *
 * The website's page calls the `sentences` function from its own server with an
 * internal key. A desktop app cannot hold that key, so everything here goes to
 * `sentences-app` instead: the same practice rules, the user taken from the
 * signed-in session, every card travelling as a sealed token. Nothing in this
 * file knows the key and nothing runs a model — the learner's own AI judges a
 * written sentence (see `judge.ts`).
 *
 * The desktop additions (`settle`, `retry`, `skip`, `replay`, `meta.api`) arrive
 * with a server update. Until then `meta` answers without `api`, or the action is
 * unknown, and the screen says so calmly (`NotReadyError`) instead of failing.
 */

/** The API level this app needs: `meta.api` of the server must be at least this. */
export const REQUIRED_API = 2;

const FN = '/sentences-app';

/** A refusal from the backend, with the code the screen translates. */
export class SentencesError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
  ) {
    super(code);
  }
}

/** The server does not have the actions this app needs yet. */
export class NotReadyError extends Error {
  constructor() {
    super('SERVER_NOT_READY');
  }
}

/**
 * A call that failed, as the screen needs it. An unknown action, or a function the
 * gateway does not know (a 404 with no code of ours), means the server update has
 * not shipped; everything else is a normal refusal with its own code.
 */
export function toSentencesError(err: unknown): SentencesError | NotReadyError {
  if (err instanceof SentencesError || err instanceof NotReadyError) return err;
  const parsed = parseCloudError(err);
  if (parsed.code === 'INVALID_ACTION' || (parsed.status === 404 && !parsed.code))
    return new NotReadyError();
  if (parsed.code) return new SentencesError(parsed.code, parsed.status);
  if (
    parsed.status === null &&
    /error sending request|Failed to send|network|timed? ?out|API request failed/i.test(
      parsed.message,
    )
  ) {
    return new SentencesError('NETWORK', null);
  }
  return new SentencesError(
    parsed.status === 401 ? 'AUTH_REQUIRED' : 'UNKNOWN_ERROR',
    parsed.status,
  );
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  try {
    return await supabaseCall<T>(method, `${FN}${path}`, body);
  } catch (err) {
    throw toSentencesError(err);
  }
}

const qs = (params: Record<string, string | undefined | null>) =>
  new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][],
  ).toString();

/**
 * The settings panel for these picks, plus the levels, units and labels. In the
 * learner's language when it has sentences written, in English until then — the
 * website's `explainLocale` rule — and the language it answered in comes back too.
 */
export async function getMeta(
  lang: string,
  locale: string,
  picks: Record<string, string>,
): Promise<{ meta: Meta; explain: string }> {
  const ask = (loc: string) =>
    call<Meta>(
      'GET',
      `?${qs({ action: 'meta', lang, locale: loc, state: JSON.stringify(picks) })}`,
    );
  let explain = locale;
  let meta: Meta;
  try {
    meta = await ask(locale);
  } catch (err) {
    if (!(err instanceof SentencesError) || err.code !== 'PENDING_LOCALE' || locale === 'en')
      throw err;
    explain = 'en';
    meta = await ask('en');
  }
  if ((meta.api ?? 1) < REQUIRED_API) throw new NotReadyError();
  return { meta, explain };
}

export type DealParams = {
  lang: string;
  locale: string;
  state: Record<string, string>;
  /** Slip a due card in (every third answer, if the learner switched it on). */
  mix?: boolean;
};

export const deal = (p: DealParams) =>
  call<DealAnswer>('POST', '?action=deal', {
    lang: p.lang,
    locale: p.locale,
    state: p.state,
    ...(p.mix ? { mix: true } : {}),
  });

export type Revealed = { sentence: PracticeSentence; rules: Rule[]; answers?: AnswerModel[] };

export const reveal = (lang: string, locale: string, token: string) =>
  call<Revealed>('POST', '?action=reveal', { lang, locale, token });

/** Two answers inside the backend's minimum gap are a quick learner, not a script. */
export async function revealPatiently(
  lang: string,
  locale: string,
  token: string,
): Promise<Revealed> {
  try {
    return await reveal(lang, locale, token);
  } catch (err) {
    if (!(err instanceof SentencesError) || err.code !== 'TOO_FAST') throw err;
    await new Promise((r) => setTimeout(r, 1100));
    return await reveal(lang, locale, token);
  }
}

/** A written card's first answer. Not recorded unless it is `exact` — see `settle`. */
export type WrittenAnswer = {
  grade: Grade;
  sentence: PracticeSentence;
  rules: Rule[];
  attempt: AttemptResult | null;
  /** True when the answer is waiting for a verdict (the learner's own AI, or the static one). */
  pending?: boolean;
};

export const answerWritten = (
  lang: string,
  locale: string,
  token: string,
  answer: string,
  retry: number,
) =>
  call<WrittenAnswer>('POST', '?action=answer', {
    lang,
    locale,
    token,
    answer,
    defer: true,
    ...(retry > 0 ? { retry } : {}),
  });

/** Records the verdict the app reached for a written card, with the scorecard if there is one. */
export const settle = (
  lang: string,
  token: string,
  answer: string,
  verdict: Grade['verdict'],
  judgement: Scorecard | null,
  retry: number,
) =>
  call<{ attempt: AttemptResult }>('POST', '?action=settle', {
    lang,
    token,
    answer,
    verdict,
    ...(judgement ? { judgement } : {}),
    ...(retry > 0 ? { retry } : {}),
  });

/** A recognition or listening card, after it was opened. */
export const answerSelf = (
  lang: string,
  locale: string,
  token: string,
  verdict: 'knew' | 'missed',
  ear: { plays?: number; heard?: boolean | null } = {},
) =>
  call<{ attempt: AttemptResult }>('POST', '?action=answer', {
    lang,
    locale,
    token,
    verdict,
    ...(ear.plays ? { plays: ear.plays } : {}),
    ...(typeof ear.heard === 'boolean' ? { heard: ear.heard } : {}),
  });

export type QuestionAnswer = {
  answerGrade: AnswerModelGrade;
  attempt: AttemptResult | null;
  sentence: PracticeSentence;
  rules: Rule[];
  answers: AnswerModel[];
};

/** A written answer to a question. `verdict` is the learner's own call when no model answer matched. */
export const answerQuestion = (
  lang: string,
  locale: string,
  token: string,
  answer: string,
  ear: { plays?: number; heard?: boolean | null },
  verdict?: 'knew' | 'missed',
) =>
  call<QuestionAnswer>('POST', '?action=answer', {
    lang,
    locale,
    token,
    answer,
    ...(verdict ? { verdict } : {}),
    ...(ear.plays ? { plays: ear.plays } : {}),
    ...(typeof ear.heard === 'boolean' ? { heard: ear.heard } : {}),
  });

/** The same written card again after a miss: a fresh token and how it has gone so far. */
export const retry = (lang: string, token: string) =>
  call<{ token: string; wrong: number; skipped: number }>('POST', '?action=retry', { lang, token });

export const skip = (lang: string, token: string, round: number) =>
  call<{ ok: boolean }>('POST', '?action=skip', { lang, token, round });

export const resetLevel = (lang: string, level: Level, token: string) =>
  call<{ cycle: number }>('POST', '?action=reset', { lang, level, token });

export const replayUnit = (lang: string, level: Level, token: string) =>
  call<{ unit: number; replayed: number }>('POST', '?action=replay', { lang, level, token });

export const getStats = (lang: string, level: Level, track: string) =>
  call<PracticeStats>('GET', `?${qs({ action: 'stats', lang, level, track })}`);

export const getHistory = (
  lang: string,
  locale: string,
  level: Level,
  filter: HistoryFilter,
  page: number,
  track: string,
) =>
  call<HistoryPage>(
    'GET',
    `?${qs({ action: 'history', lang, locale, level, filter, page: String(page), track })}`,
  );

/** The path a listening card's sound is fetched from (the bytes come from `supabase_fetch_bytes`). */
export const audioPath = (lang: string, token: string) =>
  `${FN}?${qs({ action: 'audio', lang, token })}`;
