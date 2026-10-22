/**
 * A mocked `sentences-app` (api level 2) for the desk's tests: the same actions, the same shapes,
 * the same refusals, none of the content. Cards travel as tokens; a written card is not recorded
 * until `settle` (unless the first check was exact).
 */
export type Call = { method: string; action: string; query: URLSearchParams; body: Record<string, any> | null };

export const SENTENCE = {
  id: 1,
  unit: 2,
  text: "Où est-ce qu'il habite ?",
  level: 'A1',
  ipa: '/u ɛs kil a.bit/',
  form: 'interrogative',
  polarity: 'affirmative',
  register: 'standard',
  tags: ['place'],
  rule_keys: ['q-est-ce-que'],
  accepted: [],
  meaning: 'Where does he live?',
  literal: 'Where is-it that he lives?',
  hint: 'Use the est-ce que form.',
  token_glosses: { "Où": 'where', 'est-ce que': '(question marker)', "qu'il": 'that he', habite: 'lives' },
  beats: [{ for: 'est-ce que', text: 'It turns a statement into a question without moving words.' }],
  analysis: {
    structure: { pattern: 'WH + est-ce que + S + V', slots: ['WH', 'S', 'V'] },
    prompt_facts: ['subject-masculine', 'register-standard'],
    tokens: [
      { surface: 'Où', pos: 'adv', role: 'object_interrogative' },
      { surface: 'est-ce que', pos: 'chunk', role: 'question-marker', is_chunk: true },
      { surface: "qu'il", pos: 'pron', role: 'subject' },
      {
        surface: 'habite',
        pos: 'verb',
        role: 'predicate',
        conjugation: { infinitive: 'habiter', family: 'group-1-er', stem: 'habit', ending: 'e', mood: 'indicatif', tense: 'present', person: '3sg' },
      },
    ],
    mechanics: [{ type: 'elision', from: 'que il', to: "qu'il" }],
    variants: [
      { text: "Où il habite ?", register: 'familiar' },
      { text: "Où est-ce qu'il habite ?", register: 'standard' },
      { text: 'Où habite-t-il ?', register: 'formal' },
    ],
  },
};

export const RULE = {
  key: 'q-est-ce-que',
  kind: 'question',
  level: 'A1',
  cheatsheet_slug: 'questions',
  title: 'Questions with est-ce que',
  summary: 'Put est-ce que in front of a statement.',
  body: 'Put `est-ce que` before the statement.',
  examples: [{ fr: 'Est-ce que tu viens ?', gloss: 'Are you coming?' }],
};

const sections = (state: Record<string, string>) => [
  { key: 'lang', kind: 'navigate', title: 'Language', options: [{ value: 'fr', label: 'French' }, { value: 'en', label: 'English' }], value: 'fr', default: 'fr', resets: [], keepsScore: false },
  { key: 'level', kind: 'choice', title: 'Level', options: ['A1', 'A2'].map((v) => ({ value: v, label: v })), value: state.level ?? 'A1', default: 'A1', resets: ['unit'], keepsScore: false },
  {
    key: 'dir', kind: 'choice', title: 'Direction',
    options: [
      { value: 'recognize', label: 'Sentence to meaning' },
      { value: 'produce', label: 'Meaning to sentence' },
      { value: 'listen', label: 'Audio only' },
      { value: 'answer', label: 'Question and answer' },
    ],
    value: state.dir ?? 'recognize', default: 'recognize', resets: [], keepsScore: false,
  },
  {
    key: 'order', kind: 'choice', title: 'Order',
    options: ['random', 'course', 'easy', 'hard', 'review'].map((v) => ({ value: v, label: v })),
    value: state.order ?? 'random', default: 'random', resets: [], keepsScore: false, param: 'order',
  },
  { key: 'unit', kind: 'choice', title: 'Unit', options: [{ value: '', label: 'All' }, { value: '2', label: 'Unit 2' }, { value: '3', label: 'Unit 3' }], value: state.unit ?? '', default: '', resets: [], keepsScore: true, param: 'unit' },
  { key: 'mix', kind: 'switch', title: 'Auto review', short: 'Auto review', options: [], value: state.mix ?? '', default: '', resets: [], keepsScore: true },
  { key: 'path', kind: 'choice', title: 'Path', track: true, options: [{ value: '', label: 'General' }, { value: 'qa', label: 'Questions' }], value: state.path ?? '', default: '', resets: [], keepsScore: false },
];

export type ServerOptions = {
  api?: number | null;
  /** Locales with no content: `meta` answers PENDING_LOCALE for them. */
  pendingLocales?: string[];
  /** The order the cards are dealt in (ids into `bank`). */
  queue?: number[];
  /** Static first check for a written answer: the text that counts as `exact`. */
  failAction?: string;
  history?: Record<string, any>[];
  stats?: Record<string, number>;
  /** After these many cards, the deal says `finished`. */
  finishAfter?: { n: number; scope: 'level' | 'unit' | 'topic'; nextUnit?: number };
};

export function makeServer(opts: ServerOptions = {}) {
  const calls: Call[] = [];
  const bank: Record<number, typeof SENTENCE> = {
    1: SENTENCE,
    2: { ...SENTENCE, id: 2, text: 'Je suis étudiant.', meaning: 'I am a student.', ipa: '/ʒə sɥi e.ty.djɑ̃/', hint: null, analysis: { prompt_facts: [], tokens: [], mechanics: [], variants: [] } } as any,
    3: { ...SENTENCE, id: 3, text: 'Comment tu t\'appelles ?', meaning: 'What is your name?', ipa: null, hint: null, analysis: { prompt_facts: [], tokens: [], mechanics: [], variants: [] } } as any,
  };
  const queue = [...(opts.queue ?? [1, 2, 3, 1, 2, 3])];
  let dealt = 0;
  let token = 0;
  const tokens = new Map<string, { id: number; dir: string }>();
  const recorded: { key: string; verdict: string; answer?: string; judgement?: unknown; retry?: number }[] = [];
  const retries = new Map<number, { wrong: number; skipped: number }>();

  const asError = (status: number, code: string) => {
    throw JSON.stringify({ status, error: code, code, data: { error: code, code } });
  };

  const handler = async (method: string, path: string, body?: Record<string, any> | null) => {
    const url = new URL(`http://x${path}`);
    const action = url.searchParams.get('action') ?? '';
    calls.push({ method, action, query: url.searchParams, body: body ?? null });
    const need2 = ['settle', 'retry', 'skip', 'replay'];
    if (need2.includes(action) && (opts.api ?? 2) < 2) return asError(400, 'INVALID_ACTION');
    if (opts.failAction === action) return asError(500, 'UNKNOWN_ERROR');

    switch (action) {
      case 'meta': {
        const locale = url.searchParams.get('locale') ?? 'en';
        if (opts.pendingLocales?.includes(locale)) return asError(404, 'PENDING_LOCALE');
        const state = JSON.parse(url.searchParams.get('state') ?? '{}') as Record<string, string>;
        const merged = { level: 'A1', dir: 'recognize', order: 'random', ...state };
        return {
          ...(opts.api === null ? {} : { api: opts.api ?? 2 }),
          levels: ['A1', 'A2'],
          level: merged.level,
          units: [
            { unit: 2, title: 'Asking where', can_do: 'I can ask where someone lives.', rule_keys: [], hasSentences: true },
            { unit: 3, title: 'Asking names', can_do: 'I can ask a name.', rule_keys: [], hasSentences: true },
          ],
          topics: [{ tag: 'place' }],
          groups: [],
          labels: { roles: { subject: 'subject', predicate: 'verb', 'question-marker': 'question marker' }, facts: { 'subject-masculine': 'subject: masculine (il)', 'register-standard': 'register: neutral' } },
          sections: sections(merged),
          state: { lang: 'fr', ...merged },
          deal: { level: merged.level, dir: merged.dir, order: merged.order, unit: merged.unit ?? '', mix: merged.mix ?? '', track: merged.path || 'general' },
          ui: {},
        };
      }
      case 'deal': {
        const st = (body?.state ?? {}) as Record<string, string>;
        if (opts.finishAfter && dealt >= opts.finishAfter.n) {
          return { status: 'finished', track: 'general', reset: 'reset-token', due: 3, scope: opts.finishAfter.scope, nextUnit: opts.finishAfter.nextUnit ?? null, replay: opts.finishAfter.scope === 'unit' ? 'replay-token' : null };
        }
        if (st.order === 'review' && dealt >= 1) return { status: 'review_empty' };
        const id = queue[dealt % queue.length];
        dealt++;
        const t = `tok-${++token}`;
        const dir = st.dir ?? 'recognize';
        tokens.set(t, { id, dir });
        const s = bank[id];
        const card =
          dir === 'listen' || dir === 'answer'
            ? { text: '', ipa: null, meaning: '', hint: null, analysis: {} }
            : dir === 'recognize'
              ? { text: s.text, ipa: s.ipa, meaning: '', hint: null, analysis: {} }
              : { text: '', ipa: null, meaning: s.meaning, hint: s.hint, analysis: { prompt_facts: s.analysis.prompt_facts ?? [] } };
        return { status: 'card', dir, track: 'general', token: t, audio: dir === 'listen' || dir === 'answer' ? `audio-${t}` : null, card: { ...card, unit: s.unit, level: 'A1' } };
      }
      case 'reveal': {
        const c = tokens.get(body!.token);
        if (!c) return asError(403, 'NOT_DEALT');
        if (c.dir === 'produce') return asError(403, 'ANSWER_FIRST');
        const s = bank[c.id];
        return { sentence: s, rules: [RULE] };
      }
      case 'answer': {
        const c = tokens.get(body!.token);
        if (!c) return asError(403, 'NOT_DEALT');
        const s = bank[c.id];
        if (c.dir === 'produce') {
          const typed = String(body!.answer ?? '');
          const norm = (x: string) => x.toLowerCase().replace(/[.,;:!?«»"]/g, ' ').replace(/\s+/g, ' ').trim();
          const exact = norm(typed) === norm(s.text);
          const grade = exact ? { verdict: 'exact', diff: [] } : { verdict: 'wrong', diff: [{ kind: 'missing', text: s.text }] };
          if (body!.defer && !exact) return { grade, attempt: null, pending: true, sentence: s, rules: [RULE] };
          recorded.push({ key: body!.token, verdict: grade.verdict, answer: typed, retry: body!.retry });
          return { grade, attempt: { status: 'RECORDED', correct: exact, box_before: 0, box_after: 1, due_at: new Date(Date.now() + 600_000).toISOString() }, sentence: s, rules: [RULE], ...(body!.defer ? { pending: false } : {}) };
        }
        if (c.dir === 'answer') {
          const typed = String(body!.answer ?? '').trim().toLowerCase();
          const answers = [{ text: "J'habite à Toronto.", pattern: "J'habite à {city}.", meaning: 'I live in Toronto.', note: null }];
          const matched = typed.startsWith("j'habite");
          const verdict = body!.verdict as string | undefined;
          const attempt = matched || verdict ? { status: 'RECORDED', correct: matched || verdict === 'knew', box_before: 0, box_after: 1, due_at: new Date(Date.now() + 86_400_000 * 2).toISOString() } : null;
          if (attempt) recorded.push({ key: body!.token, verdict: matched ? 'exact' : String(verdict), answer: typed });
          return { answerGrade: matched ? { verdict: 'exact', index: 0 } : { verdict: 'unmatched', index: null }, attempt, sentence: s, rules: [RULE], answers };
        }
        if (body!.verdict !== 'knew' && body!.verdict !== 'missed') return asError(400, 'INVALID_VERDICT');
        recorded.push({ key: body!.token, verdict: body!.verdict });
        return { attempt: { status: 'RECORDED', correct: body!.verdict === 'knew', box_before: 0, box_after: body!.verdict === 'knew' ? 2 : 0, due_at: new Date(Date.now() + (body!.verdict === 'knew' ? 86_400_000 * 3 : 600_000)).toISOString() } };
      }
      case 'settle': {
        const c = tokens.get(body!.token);
        if (!c) return asError(403, 'NOT_DEALT');
        if (c.dir !== 'produce') return asError(400, 'INVALID_DIR');
        recorded.push({ key: body!.token, verdict: body!.verdict, answer: body!.answer, judgement: body!.judgement, retry: body!.retry });
        const ok = body!.verdict !== 'wrong';
        const r = retries.get(c.id) ?? { wrong: 0, skipped: 0 };
        if (body!.verdict === 'wrong' || body!.verdict === 'accents') retries.set(c.id, { ...r, wrong: r.wrong + 1 });
        return { attempt: { status: 'RECORDED', correct: ok, box_before: 0, box_after: ok ? 1 : 0, due_at: new Date(Date.now() + (ok ? 86_400_000 : 600_000)).toISOString() } };
      }
      case 'retry': {
        const c = tokens.get(body!.token);
        if (!c) return asError(403, 'NOT_DEALT');
        const t = `tok-${++token}`;
        tokens.set(t, c);
        return { token: t, ...(retries.get(c.id) ?? { wrong: 0, skipped: 0 }) };
      }
      case 'skip': {
        const c = tokens.get(body!.token);
        if (!c) return asError(403, 'NOT_DEALT');
        const r = retries.get(c.id) ?? { wrong: 0, skipped: 0 };
        retries.set(c.id, { ...r, skipped: r.skipped + 1 });
        return { ok: true };
      }
      case 'reset': return { cycle: 2 };
      case 'replay': return { unit: 2, replayed: 5 };
      case 'stats': return { practiced: 12, learned: 5, weak: 2, due: 3, dueListen: 1, misheard: 1, today: 4, streak: 3, ...(opts.stats ?? {}) };
      case 'history': {
        const filter = url.searchParams.get('filter') ?? 'all';
        const page = Number(url.searchParams.get('page') ?? 1);
        const all = opts.history ?? [];
        const items = all.filter((h) => (filter === 'all' ? true : filter === 'weak' ? h.box === 0 : filter === 'learned' ? h.box >= 2 : h.last_heard === false));
        return { filter, page, pageSize: 20, count: items.length, items: items.slice((page - 1) * 20, page * 20) };
      }
      default:
        return asError(400, 'INVALID_ACTION');
    }
  };

  return { calls, recorded, handler, bank };
}

export const historyRow = (over: Record<string, unknown>) => ({
  id: 1, text: 'Je suis étudiant.', meaning: 'I am a student.', box: 0, correct_count: 1, wrong_count: 2, last_correct: false,
  last_answered_at: '2026-10-20T10:00:00Z', due_at: null, last_wrong_answer: 'Je sui étudiant', last_dir: 'produce', last_plays: null, last_heard: null, listen_box: null, ...over,
});
