/**
 * The cheatsheet's data layer: the website's `service.ts`, with an offline copy.
 *
 * Every index, topic and verb answer is written to the local store as it arrives
 * (`cheatsheet_cache`, see `commands/cheatsheet.rs`). A page that has been opened
 * once is then served from there:
 *
 *  - offline, or when the request fails, the stored copy is the answer;
 *  - online, the stored copy is shown at once and refreshed in the background,
 *    once per session per page — a changed page is announced to `onRefresh`
 *    listeners so an open screen swaps it in.
 *
 * Searches, form look-ups, conjugation and the language vote are never stored:
 * a search is a question, not a page, and the last two are writes.
 *
 * Everything the client touches from outside is injected (`Deps`), so the rules
 * above are tested without Tauri.
 */
import { parseCloudError } from '@/lib/cloudError';
import {
  FALLBACK_EXPLAIN_LOCALE,
  type CheatsheetStats,
  type CoverageRow,
  type FormHit,
  type IndexResponse,
  type SearchHit,
  type Topic,
  type TopicResponse,
  type TopicSummary,
  type VerbDetail,
  type VerbListItem,
} from './types';

export type CacheKind = 'index' | 'topic' | 'verbs' | 'verb';

export type CachedEntry = { key: string; body: string; fetched_at: string };

export type Deps = {
  call: (method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) => Promise<unknown>;
  cacheGet: (lang: string, kind: CacheKind, key: string) => Promise<CachedEntry | null>;
  cachePut: (lang: string, kind: CacheKind, key: string, body: string) => Promise<void>;
  online: () => boolean;
};

/** Where an answer came from. `cache` answers can be older than the server's. */
export type Fetched<T> = { data: T; source: 'network' | 'cache'; fetchedAt: string | null };

/** Nothing stored and no connection (or the request failed): the caller shows its retry. */
export class CheatsheetUnavailableError extends Error {
  constructor(public offline: boolean) {
    super(offline ? 'OFFLINE' : 'CHEATSHEET_UNAVAILABLE');
  }
}

export type RefreshEvent = { lang: string; kind: CacheKind; key: string };

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

export function createClient(deps: Deps) {
  const refreshed = new Set<string>();
  const listeners = new Set<(e: RefreshEvent) => void>();

  const emit = (e: RefreshEvent) => listeners.forEach((l) => l(e));

  /** Network read. A 404 is an ANSWER (not translated / no such page), never a failure. */
  async function network(path: string): Promise<{ found: true; body: unknown } | { found: false }> {
    try {
      return { found: true, body: await deps.call('GET', path) };
    } catch (err) {
      if (parseCloudError(err).status === 404) return { found: false };
      throw err;
    }
  }

  async function readCache(
    lang: string,
    kind: CacheKind,
    key: string,
  ): Promise<CachedEntry | null> {
    try {
      return await deps.cacheGet(lang, kind, key);
    } catch {
      return null;
    }
  }

  async function writeCache(lang: string, kind: CacheKind, key: string, body: unknown) {
    try {
      await deps.cachePut(lang, kind, key, JSON.stringify(body));
    } catch {
      /* the page still shows; it just will not be there offline */
    }
  }

  /**
   * The one read path. `null` = the server said 404.
   * `force` skips the stored copy (the offline download uses it to refresh).
   */
  async function load<T>(
    lang: string,
    kind: CacheKind,
    key: string,
    path: string,
    opts: { force?: boolean } = {},
  ): Promise<Fetched<T> | null> {
    const cached = opts.force ? null : await readCache(lang, kind, key);
    const id = `${lang}|${kind}|${key}`;

    if (cached) {
      if (deps.online() && !refreshed.has(id)) {
        refreshed.add(id);
        // Background refresh: failure is silent, the stored copy already answered.
        void network(path)
          .then(async (res) => {
            if (!res.found) return;
            const text = JSON.stringify(res.body);
            await writeCache(lang, kind, key, res.body);
            if (text !== cached.body) emit({ lang, kind, key });
          })
          .catch(() => refreshed.delete(id));
      }
      return { data: JSON.parse(cached.body) as T, source: 'cache', fetchedAt: cached.fetched_at };
    }

    if (!deps.online()) throw new CheatsheetUnavailableError(true);
    try {
      const res = await network(path);
      if (!res.found) return null;
      await writeCache(lang, kind, key, res.body);
      refreshed.add(id);
      return { data: res.body as T, source: 'network', fetchedAt: null };
    } catch (err) {
      // Online per the browser, but the request failed — one more look at the
      // store was already done above, so there is nothing to fall back to.
      if (err instanceof CheatsheetUnavailableError) throw err;
      throw new CheatsheetUnavailableError(false);
    }
  }

  return {
    onRefresh(listener: (e: RefreshEvent) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Forget which pages were refreshed this session (tests, and after a download). */
    resetSession() {
      refreshed.clear();
    },

    async getIndex(lang: string, locale: string, opts?: { force?: boolean }) {
      const res = await load<IndexResponse>(
        lang,
        'index',
        locale,
        `/cheatsheet?${qs({ action: 'index', lang, locale })}`,
        opts,
      );
      return res && ({ ...res, data: res.data.topics ?? [] } as Fetched<TopicSummary[]>);
    },

    async getTopic(lang: string, locale: string, slug: string, opts?: { force?: boolean }) {
      const res = await load<TopicResponse>(
        lang,
        'topic',
        `${locale}:${slug}`,
        `/cheatsheet?${qs({ action: 'topic', lang, locale, slug })}`,
        opts,
      );
      return res?.data.topic ? ({ ...res, data: res.data.topic } as Fetched<Topic>) : null;
    },

    /** `all` lists every verb the conjugator has, glossed in this locale or not. */
    async getVerbList(lang: string, locale: string, all = false, opts?: { force?: boolean }) {
      const params: Record<string, string> = { action: 'verbs', lang, locale };
      if (all) params.all = '1';
      const res = await load<{ verbs: VerbListItem[] }>(
        lang,
        'verbs',
        all ? `all:${locale}` : locale,
        `/cheatsheet?${qs(params)}`,
        opts,
      );
      return res && ({ ...res, data: res.data.verbs ?? [] } as Fetched<VerbListItem[]>);
    },

    async getVerb(lang: string, locale: string, verb: string, opts?: { force?: boolean }) {
      const res = await load<{ verb: VerbDetail }>(
        lang,
        'verb',
        `${locale}:${verb}`,
        `/cheatsheet?${qs({ action: 'verb', lang, locale, verb })}`,
        opts,
      );
      if (!res?.data.verb) return null;
      return { ...res, data: normaliseVerb(res.data.verb) } as Fetched<VerbDetail>;
    },

    /** Which (taught language, explain locale) pairs have content. Soft: [] on any failure. */
    async getCoverage(lang: string): Promise<CoverageRow[]> {
      try {
        const res = await load<{ coverage: CoverageRow[] }>(
          lang,
          'index',
          'coverage',
          `/cheatsheet?${qs({ action: 'locales', lang })}`,
        );
        return res?.data.coverage ?? [];
      } catch {
        return [];
      }
    },

    /** The counts under the landing headline. Soft. */
    async getStats(lang: string, locale: string): Promise<CheatsheetStats | null> {
      try {
        const res = await load<CheatsheetStats>(
          lang,
          'index',
          `stats:${locale}`,
          `/cheatsheet?${qs({ action: 'stats', lang, locale })}`,
        );
        return res?.data ?? null;
      } catch {
        return null;
      }
    },

    /** Never stored. Rejects when the server cannot be asked; the caller falls back to local search. */
    async search(
      lang: string,
      locale: string,
      q: string,
    ): Promise<{ hits: SearchHit[]; verbs: FormHit[] }> {
      if (!deps.online()) throw new CheatsheetUnavailableError(true);
      const res = (await deps.call(
        'GET',
        `/cheatsheet?${qs({ action: 'search', lang, locale, q })}`,
      )) as {
        hits?: SearchHit[];
        verbs?: FormHit[];
      };
      return { hits: res.hits ?? [], verbs: res.verbs ?? [] };
    },

    async findForm(lang: string, locale: string, q: string): Promise<FormHit[]> {
      if (!deps.online()) throw new CheatsheetUnavailableError(true);
      const res = (await deps.call(
        'GET',
        `/cheatsheet?${qs({ action: 'find-form', lang, locale, q })}`,
      )) as {
        verbs?: FormHit[];
      };
      return res.verbs ?? [];
    },

    /** POST, never retried: a retried write would build the verb twice. Returns the lemma. */
    async conjugate(lang: string, verb: string): Promise<string> {
      if (!deps.online()) throw new CheatsheetUnavailableError(true);
      const res = (await deps.call('POST', '/cheatsheet?action=conjugate', { lang, verb })) as {
        lemma?: string;
      };
      if (!res.lemma) throw new Error('CONJUGATION_UNAVAILABLE');
      return res.lemma;
    },

    async requestLanguage(lang: string, locale: string, email?: string): Promise<void> {
      if (!deps.online()) throw new CheatsheetUnavailableError(true);
      await deps.call('POST', '/cheatsheet?action=request-language', {
        lang,
        locale,
        ...(email ? { email } : {}),
      });
    },
  };
}

export type CheatsheetClient = ReturnType<typeof createClient>;

/**
 * `complement` became a key array; it used to be one prose string. During a
 * rollout both exist, so normalise rather than letting a page crash on the older
 * half. The infinitive's IPA is recovered from the futur proche when the row has
 * none (the same fallback as the website).
 */
export function normaliseVerb(verb: VerbDetail): VerbDetail {
  const raw = verb.complement as unknown;
  return {
    ...verb,
    forms: verb.forms ?? [],
    form_glosses: verb.form_glosses ?? {},
    examples: verb.examples ?? [],
    collocations: verb.collocations ?? [],
    tips: verb.tips ?? [],
    complement: Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [],
    ipa: verb.ipa ?? infinitiveIpa(verb.forms),
  };
}

function infinitiveIpa(forms: VerbDetail['forms'] | undefined): string | null {
  const g = (forms ?? []).find((t) => t.mood === 'indicatif' && t.tense === 'futur-proche');
  const je = g?.forms.find((f) => f.pr === 'je');
  const parts = je?.ipa?.replace(/^\/|\/$/g, '').split(/\s+/) ?? [];
  return parts.length >= 3 ? `/${parts.slice(2).join(' ')}/` : null;
}

// ---------- Locale resolution (the website's contentLocaleFor & co) ----------

/** The locales to try, in order: the reader's own, then English. */
export const localesFor = (locale: string): string[] =>
  locale === FALLBACK_EXPLAIN_LOCALE ? [locale] : [locale, FALLBACK_EXPLAIN_LOCALE];

/** The topic list in the first of the reader's locales that has one. */
export async function indexWithFallback(client: CheatsheetClient, lang: string, locale: string) {
  let failure: unknown = null;
  for (const l of localesFor(locale)) {
    try {
      const res = await client.getIndex(lang, l);
      if (res && res.data.length) return { locale: l, ...res };
    } catch (err) {
      // Offline and this locale was never stored: English may have been.
      failure = err;
    }
  }
  if (failure) throw failure;
  return {
    locale: FALLBACK_EXPLAIN_LOCALE,
    data: [] as TopicSummary[],
    source: 'network' as const,
    fetchedAt: null,
  };
}

/** The topic in the reader's locale, or in English until it is translated. `own` says which. */
export async function topicWithFallback(
  client: CheatsheetClient,
  lang: string,
  locale: string,
  slug: string,
) {
  let mine: Awaited<ReturnType<CheatsheetClient['getTopic']>> = null;
  try {
    mine = await client.getTopic(lang, locale, slug);
  } catch (err) {
    // Offline and not stored in the reader's language: fall through to English.
    if (locale === FALLBACK_EXPLAIN_LOCALE) throw err;
  }
  if (mine || locale === FALLBACK_EXPLAIN_LOCALE)
    return { topic: mine?.data ?? null, own: true, source: mine?.source ?? 'network' };
  const en = await client.getTopic(lang, FALLBACK_EXPLAIN_LOCALE, slug);
  return { topic: en?.data ?? null, own: false, source: en?.source ?? 'network' };
}

/** Which explain-locales already have this page — tells a translation gap from a made-up URL. */
export async function localesWithTopic(
  client: CheatsheetClient,
  lang: string,
  slug: string,
): Promise<string[]> {
  const coverage = await client.getCoverage(lang);
  const found = await Promise.all(
    coverage.map(async ({ locale }) => {
      const idx = await client.getIndex(lang, locale).catch(() => null);
      return idx?.data.some((t) => t.slug === slug) ? locale : null;
    }),
  );
  return found.filter((l): l is string => Boolean(l));
}

/** The locale to read a verb's meaning in: the reader's own once its verbs are glossed. */
export async function verbLocaleFor(
  client: CheatsheetClient,
  lang: string,
  locale: string,
): Promise<string> {
  if (locale === FALLBACK_EXPLAIN_LOCALE) return locale;
  const own = await client.getVerbList(lang, locale);
  return own && own.data.length ? locale : FALLBACK_EXPLAIN_LOCALE;
}
