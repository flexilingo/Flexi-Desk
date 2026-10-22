import { describe, expect, it, vi } from 'vitest';
import {
  CheatsheetUnavailableError,
  createClient,
  indexWithFallback,
  topicWithFallback,
  type CachedEntry,
  type Deps,
} from '@/pages/cheatsheet/lib/client';
import { downloadForOffline, type DownloadProgress } from '@/pages/cheatsheet/lib/offline';
import { getVote, saveVote } from '@/pages/cheatsheet/lib/requestLanguage';
import { parseBlocks, parseInline, sectionise, inlineText } from '@/pages/cheatsheet/lib/markdown';
import { extractVocab, vocabCards } from '@/pages/cheatsheet/lib/vocab';

const notFound = () => new Error(JSON.stringify({ status: 404, error: 'NOT_FOUND', code: 'NOT_FOUND', data: {} }));

/** An in-memory store and a scripted server: what Tauri and the cloud are in the app. */
function harness(server: Record<string, unknown>, opts: { online?: boolean } = {}) {
  const store = new Map<string, CachedEntry>();
  const state = { online: opts.online ?? true, down: false, calls: [] as string[] };
  const deps: Deps = {
    call: vi.fn(async (_m, path) => {
      state.calls.push(path);
      if (state.down) throw new Error('error sending request');
      if (!(path in server)) throw notFound();
      return structuredClone(server[path]);
    }),
    cacheGet: async (lang, kind, key) => store.get(`${lang}|${kind}|${key}`) ?? null,
    cachePut: async (lang, kind, key, body) => {
      store.set(`${lang}|${kind}|${key}`, { key, body, fetched_at: '2026-10-21 00:00:00' });
    },
    online: () => state.online,
  };
  return { client: createClient(deps), store, state, deps };
}

const TOPIC = '/cheatsheet?action=topic&lang=fr&locale=en&slug=a';
const topicBody = (title: string) => ({ topic: { slug: 'a', title, body: '## x' } });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('cache: serve, fall back, refresh', () => {
  it('stores what it fetched and serves it with no connection afterwards', async () => {
    const h = harness({ [TOPIC]: topicBody('v1') });
    const first = await h.client.getTopic('fr', 'en', 'a');
    expect(first?.source).toBe('network');
    expect(h.store.size).toBe(1);

    h.state.online = false;
    h.state.calls.length = 0;
    const again = await h.client.getTopic('fr', 'en', 'a');
    expect(again?.source).toBe('cache');
    expect(again?.data.title).toBe('v1');
    expect(h.state.calls).toEqual([]);
  });

  it('serves the stored copy when the request fails while "online"', async () => {
    const h = harness({ [TOPIC]: topicBody('v1') });
    await h.client.getTopic('fr', 'en', 'a');
    h.client.resetSession();
    h.state.down = true;
    const res = await h.client.getTopic('fr', 'en', 'a');
    expect(res?.data.title).toBe('v1');
    await flush(); // the background refresh fails silently
  });

  it('refreshes in the background once per session and tells listeners when the page changed', async () => {
    const server: Record<string, unknown> = { [TOPIC]: topicBody('v1') };
    const h = harness(server);
    await h.client.getTopic('fr', 'en', 'a');
    h.client.resetSession();
    server[TOPIC] = topicBody('v2');
    const seen: string[] = [];
    h.client.onRefresh((e) => seen.push(`${e.kind}:${e.key}`));

    const stale = await h.client.getTopic('fr', 'en', 'a');
    expect(stale?.data.title).toBe('v1'); // instant, from the store
    await flush();
    expect(seen).toEqual(['topic:en:a']);
    expect((await h.client.getTopic('fr', 'en', 'a'))?.data.title).toBe('v2');

    // Once per session: a second read does not hit the network again.
    const before = h.state.calls.length;
    await h.client.getTopic('fr', 'en', 'a');
    await flush();
    expect(h.state.calls.length).toBe(before);
  });

  it('says so when nothing is stored and there is no connection or the request fails', async () => {
    const off = harness({}, { online: false });
    await expect(off.client.getTopic('fr', 'en', 'a')).rejects.toMatchObject({ offline: true });
    const down = harness({ [TOPIC]: topicBody('v1') });
    down.state.down = true;
    await expect(down.client.getTopic('fr', 'en', 'a')).rejects.toBeInstanceOf(CheatsheetUnavailableError);
  });

  it('treats a 404 as an answer (not stored, not an error)', async () => {
    const h = harness({});
    expect(await h.client.getTopic('fr', 'en', 'missing')).toBeNull();
    expect(h.store.size).toBe(0);
  });

  it('keeps a locale and a language apart', async () => {
    const h = harness({
      [TOPIC]: topicBody('en'),
      '/cheatsheet?action=topic&lang=fr&locale=fa&slug=a': topicBody('fa'),
    });
    await h.client.getTopic('fr', 'en', 'a');
    await h.client.getTopic('fr', 'fa', 'a');
    expect([...h.store.keys()].sort()).toEqual(['fr|topic|en:a', 'fr|topic|fa:a']);
  });

  it('English stands in for a locale with no translation, and works offline when only English is stored', async () => {
    const h = harness({
      [TOPIC]: topicBody('en'),
      '/cheatsheet?action=index&lang=fr&locale=en': { topics: [{ slug: 'a', title: 'en' }] },
      '/cheatsheet?action=index&lang=fr&locale=hi': { topics: [] },
    });
    const own = await topicWithFallback(h.client, 'fr', 'hi', 'a');
    expect(own).toMatchObject({ own: false });
    expect(own.topic?.title).toBe('en');
    const idx = await indexWithFallback(h.client, 'fr', 'hi');
    expect(idx.locale).toBe('en');

    h.state.online = false;
    h.client.resetSession();
    const offline = await topicWithFallback(h.client, 'fr', 'hi', 'a');
    expect(offline.topic?.title).toBe('en');
    expect((await indexWithFallback(h.client, 'fr', 'hi')).locale).toBe('en');
  });

  it('normalises a verb: a prose complement becomes a key list, the infinitive IPA is recovered', async () => {
    const h = harness({
      '/cheatsheet?action=verb&lang=fr&locale=en&verb=aller': {
        verb: {
          lemma: 'aller', complement: 'direct', ipa: null,
          forms: [{ mood: 'indicatif', tense: 'futur-proche', forms: [{ pr: 'je', form: 'je vais aller', ipa: '/ʒə vɛz ale/' }] }],
        },
      },
    });
    const v = (await h.client.getVerb('fr', 'en', 'aller'))?.data;
    expect(v?.complement).toEqual(['direct']);
    expect(v?.ipa).toBe('/ale/');
    expect(v?.examples).toEqual([]);
  });

  it('never stores a search, and a search offline asks the caller to fall back', async () => {
    const h = harness({ '/cheatsheet?action=search&lang=fr&locale=en&q=depuis': { hits: [{ slug: 'x' }], verbs: [] } });
    expect((await h.client.search('fr', 'en', 'depuis')).hits).toHaveLength(1);
    expect(h.store.size).toBe(0);
    h.state.online = false;
    await expect(h.client.search('fr', 'en', 'depuis')).rejects.toBeInstanceOf(CheatsheetUnavailableError);
  });
});

describe('download for offline', () => {
  it('fetches the index, every topic and the verb lists with progress, and leaves them stored', async () => {
    const h = harness({
      '/cheatsheet?action=index&lang=fr&locale=en': { topics: [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }, { slug: 'c', title: 'C' }] },
      '/cheatsheet?action=locales&lang=fr': { coverage: [] },
      '/cheatsheet?action=stats&lang=fr&locale=en': { topics: 3, verbs: 2, examples: 1 },
      '/cheatsheet?action=topic&lang=fr&locale=en&slug=a': topicBody('A'),
      '/cheatsheet?action=topic&lang=fr&locale=en&slug=b': topicBody('B'),
      '/cheatsheet?action=topic&lang=fr&locale=en&slug=c': topicBody('C'),
      '/cheatsheet?action=verbs&lang=fr&locale=en': { verbs: [{ lemma: 'aimer' }] },
      '/cheatsheet?action=verbs&lang=fr&locale=en&all=1': { verbs: [{ lemma: 'aimer' }, { lemma: 'abaisser' }] },
    });
    const seen: DownloadProgress[] = [];
    const final = await downloadForOffline(h.client, 'fr', 'en', (p) => seen.push(p));
    expect(final).toMatchObject({ phase: 'done', failed: 0 });
    expect(seen.filter((p) => p.phase === 'topics').map((p) => p.done)).toContain(3);
    expect(seen.find((p) => p.phase === 'topics')?.total).toBe(3);
    const keys = [...h.store.keys()];
    expect(keys.filter((k) => k.includes('|topic|'))).toHaveLength(3);
    expect(keys).toContain('fr|verbs|en');
    expect(keys).toContain('fr|verbs|all:en');

    // …and opens with no connection afterwards.
    h.state.online = false;
    h.client.resetSession();
    expect((await h.client.getTopic('fr', 'en', 'b'))?.data.title).toBe('B');
  });

  it('counts a page that failed and keeps going; a cancel stops it', async () => {
    const h = harness({
      '/cheatsheet?action=index&lang=fr&locale=en': { topics: [{ slug: 'a', title: 'A' }, { slug: 'zzz', title: 'Z' }] },
      '/cheatsheet?action=topic&lang=fr&locale=en&slug=a': topicBody('A'),
      '/cheatsheet?action=verbs&lang=fr&locale=en': { verbs: [] },
      '/cheatsheet?action=verbs&lang=fr&locale=en&all=1': { verbs: [] },
    });
    const final = await downloadForOffline(h.client, 'fr', 'en', () => undefined);
    expect(final.failed).toBe(1); // zzz answered 404
    const ctl = new AbortController();
    ctl.abort();
    const stopped = await downloadForOffline(h.client, 'fr', 'en', () => undefined, ctl.signal);
    expect(stopped.phase).not.toBe('done');
  });
});

describe('request-this-language vote state', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('remembers a recorded vote and a saved email, per language and locale', () => {
    const s = mem();
    expect(getVote('es', 'fa', s)).toEqual({ voted: false, emailSaved: false });
    saveVote('es', 'fa', { voted: true }, s);
    expect(getVote('es', 'fa', s)).toEqual({ voted: true, emailSaved: false });
    saveVote('es', 'fa', { voted: true, emailSaved: true }, s);
    expect(getVote('es', 'fa', s).emailSaved).toBe(true);
    expect(getVote('es', 'en', s).voted).toBe(false);
    expect(getVote('de', 'fa', s).voted).toBe(false);
  });

  it('survives a corrupt store', () => {
    const s = { getItem: () => '{not json', setItem: () => undefined };
    expect(getVote('es', 'fa', s).voted).toBe(false);
  });
});

describe('markdown reader', () => {
  const body = [
    '## In one line', '', '> **Every noun** has a word.', 'It continues lazily.', '',
    '## The table', '',
    '| Question | Words |', '|---|---|', '| **1. Prep?** | `à` · `de` |', '',
    '### Sub', '', '- one', '- two', '  - nested', '', '1. first', '2. second',
  ].join('\n');

  it('cuts the page into parts at each ## heading, with stable ids', () => {
    const { lead, sections } = sectionise(parseBlocks(body));
    expect(lead).toEqual([]);
    expect(sections.map((s) => s.title)).toEqual(['In one line', 'The table']);
    expect(sections.map((s) => s.id)).toEqual(['in-one-line', 'the-table']);
  });

  it('reads quotes with lazy continuation, tables, nested lists and numbered lists', () => {
    const [intro, table] = sectionise(parseBlocks(body)).sections;
    expect(intro.blocks[0]).toMatchObject({ k: 'quote' });
    const q = intro.blocks[0] as { blocks: { k: string; text?: string }[] };
    expect(q.blocks).toHaveLength(1);
    expect(q.blocks[0].text).toContain('It continues lazily.');
    const t = table.blocks[0] as { k: string; head: string[]; rows: string[][] };
    expect(t).toMatchObject({ k: 'table', head: ['Question', 'Words'] });
    expect(t.rows[0][1]).toBe('`à` · `de`');
    const lists = table.blocks.filter((b) => b.k === 'list') as { ordered: boolean; items: { children: unknown[] }[] }[];
    expect(lists).toHaveLength(2);
    expect(lists[0].items[1].children).toHaveLength(1);
    expect(lists[1].ordered).toBe(true);
  });

  it('reads inline marks and keeps backticked French whole', () => {
    const nodes = parseInline('**Free:** "the book" → `le livre` and a<br>b ~~x~~ [t](/cheatsheet/fr/a)');
    expect(nodes.map((n) => n.k)).toEqual(['strong', 'text', 'code', 'text', 'br', 'text', 'del', 'text', 'link']);
    expect(inlineText(nodes)).toContain('le livre');
    expect(parseInline('a * b * c')).toEqual([{ k: 'text', text: 'a * b * c' }]);
    expect(parseInline('\\*not em\\*')).toEqual([{ k: 'text', text: '*not em*' }]);
  });
});

describe('vocabulary → deck cards', () => {
  const page = '## Words\n\n| French | Pronunciation | English | Level |\n|---|---|---|---|\n| `la famille` | /fa.mij/ | family | A1 |\n| `le père` | /pɛʁ/ | father | A1 |\n| `la famille` | /fa.mij/ | family again | A1 |\n';
  it('takes a table that names a French column and a meaning column, in English and Persian', () => {
    const cards = vocabCards({ body: page } as never);
    expect(cards.map((c) => c.front)).toEqual(['la famille', 'le père']);
    expect(cards[0]).toMatchObject({ back: 'family', notes: '/fa.mij/' });
    const fa = '| فرانسه | تلفظ | فارسی |\n|---|---|---|\n| `le père` | /pɛʁ/ | پدر |\n';
    expect(extractVocab(fa)[0].cards[0].back).toBe('پدر');
  });
  it('ignores tables it does not understand', () => {
    expect(extractVocab('| a | b |\n|---|---|\n| x | y |\n')).toEqual([]);
  });
});
