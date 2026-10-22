import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookMarked, ChevronLeft, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { normalise } from '../lib/normalise';
import { searchBodies, formsInVerbs, localHits, buildHaystack } from '../lib/search';
import { cheatsheet, cacheList } from '../lib/service';
import { useResource } from '../lib/useResource';
import {
  CATEGORIES,
  SECTIONS,
  dirFor,
  sameScript,
  type FormHit,
  type Topic,
  type TopicSummary,
  type VerbDetail,
} from '../lib/types';
import { CheatsheetMarkdown } from './CheatsheetMarkdown';
import VerbConjugation from './VerbConjugation';
import { csPath, languageLabel, useCsLocale } from './shared';

/**
 * The cheatsheet as a book beside the book you are reading.
 *
 * Open it and you get the contents; tap a topic and the page slides in over them,
 * with a way back. Nothing here navigates: the reader keeps their page, zoom and
 * place. Where the reader is (the pages opened, the search) lives with the caller,
 * so closing the panel to read on and opening it again lands on the same page.
 *
 * Explained in the reader's own language when the cheatsheet has it, then the UI's,
 * then English. Works offline on the pages already opened or downloaded.
 */

export type CheatsheetPage =
  | { kind: 'topic'; slug: string; q?: string }
  | { kind: 'verb'; lemma: string };
export type CheatsheetPanelState = { pages: CheatsheetPage[]; query: string };
export const CHEATSHEET_PANEL_START: CheatsheetPanelState = { pages: [], query: '' };

/** A link inside a topic that points at another cheatsheet page opens in the panel. */
const INTERNAL_LINK = /\/cheatsheet\/([a-z]{2})\/(verbes\/)?([^/?#]+)/;

/** The first of the reader's locales that has the thing; a 404 means "not translated", move on. */
async function firstLocale<T>(locales: string[], read: (locale: string) => Promise<T | null>) {
  let failure: unknown = null;
  for (const locale of locales) {
    try {
      const res = await read(locale);
      if (res) return { locale, res };
    } catch (err) {
      // Not stored and no connection for this locale: the next one may be stored.
      failure = err;
    }
  }
  if (failure) throw failure;
  return null;
}

export function CheatsheetPanel({
  lang,
  state,
  onStateChange,
  onClose,
}: {
  /** The language being taught — the book's language. */
  lang: string;
  state: CheatsheetPanelState;
  onStateChange: (state: CheatsheetPanelState) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const { locale: uiLocale } = useCsLocale();
  const { nativeLang } = useLanguageSettings();
  const navigate = useNavigate();
  const locales = useMemo(
    () => [...new Set([nativeLang, uiLocale, 'en'].filter(Boolean))],
    [nativeLang, uiLocale],
  );

  const index = useResource(async () => {
    const found = await firstLocale(locales, async (l) => {
      const r = await cheatsheet.getIndex(lang, l);
      return r && r.data.length ? r.data : null;
    });
    return { locale: found?.locale ?? locales[locales.length - 1], topics: found?.res ?? [] };
  }, [lang, locales.join(',')]);
  const topics = useMemo(() => index.data?.topics ?? [], [index.data?.topics]);
  const contentLocale = index.data?.locale ?? locales[0];

  const page = state.pages[state.pages.length - 1];
  const open = (next: CheatsheetPage) => onStateChange({ ...state, pages: [...state.pages, next] });
  const back = () => onStateChange({ ...state, pages: state.pages.slice(0, -1) });

  const fullPage = page
    ? page.kind === 'topic'
      ? csPath(lang, page.slug)
      : csPath(lang, 'verbes', page.lemma)
    : csPath(lang);

  return (
    <aside className="flex w-full max-w-md shrink-0 flex-col border-s border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {page ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 rounded-[7px] py-1 pe-2 ps-1 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            {state.pages.length > 1 ? t('pdf.cheatsheet.back') : t('pdf.cheatsheet.contents')}
          </button>
        ) : (
          <>
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary/10">
              <BookMarked className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-foreground">
                {t('pdf.cheatsheet.title')}
              </h2>
              <p className="truncate text-[11.5px] text-caption">
                {t('pdf.cheatsheet.subtitle', { language: languageLabel(lang, uiLocale) })}
              </p>
            </div>
          </>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => navigate(fullPage)}
          aria-label={t('pdf.cheatsheet.openPage')}
          title={t('pdf.cheatsheet.openPage')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdf.notes.close')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* The contents stay mounted under an open page, so going back lands at the
          same scroll position rather than at the top of the book. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 overflow-y-auto" aria-hidden={!!page} inert={!!page}>
          <Contents
            lang={lang}
            contentLocale={contentLocale}
            topics={topics}
            loading={index.loading}
            failed={index.error !== null && index.data === undefined}
            onRetry={index.reload}
            query={state.query}
            onQueryChange={(query) => onStateChange({ ...state, query })}
            onOpen={open}
          />
        </div>

        {page && (
          <div
            key={`${state.pages.length}:${page.kind === 'topic' ? page.slug : page.lemma}`}
            className="absolute inset-0 z-20 overflow-y-auto bg-background animate-in fade-in-0 slide-in-from-right-4 duration-200 rtl:slide-in-from-left-4"
          >
            {page.kind === 'topic' ? (
              <TopicPage
                lang={lang}
                locales={locales}
                slug={page.slug}
                q={page.q}
                topics={topics}
                onOpen={open}
              />
            ) : (
              <VerbPage lang={lang} locales={locales} lemma={page.lemma} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

// ---------- Contents + search ----------

type Hit = Pick<TopicSummary, 'slug' | 'title' | 'level'> & {
  line?: string | null;
  heading?: string | null;
};

function Contents({
  lang,
  contentLocale,
  topics,
  loading,
  failed,
  onRetry,
  query,
  onQueryChange,
  onOpen,
}: {
  lang: string;
  contentLocale: string;
  topics: TopicSummary[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (page: CheatsheetPage) => void;
}) {
  const { t } = useTranslation('reader');
  const { t: tc } = useCsLocale();

  const trimmed = query.trim();
  const needle = normalise(trimmed);
  const searching = needle.length >= 2;

  // The body search (the only one that finds a word living in a table row) joins
  // once typing settles; offline it reads the stored pages instead.
  const [server, setServer] = useState<{ q: string; hits: Hit[]; verbs: FormHit[]; busy: boolean }>(
    { q: '', hits: [], verbs: [], busy: false },
  );
  useEffect(() => {
    if (trimmed.length < 2 || topics.length === 0) return;
    let live = true;
    const id = setTimeout(async () => {
      setServer((s) => ({ ...s, busy: true }));
      let answer: { hits: Hit[]; verbs: FormHit[] };
      try {
        answer = await cheatsheet.search(lang, contentLocale, trimmed);
      } catch {
        const [tr, vr] = await Promise.all([
          cacheList(lang, 'topic', `${contentLocale}:`).catch(() => []),
          cacheList(lang, 'verb', `${contentLocale}:`).catch(() => []),
        ]);
        answer = {
          hits: searchBodies(
            tr.map((r) => (JSON.parse(r.body) as { topic: Topic }).topic),
            trimmed,
          ),
          verbs: formsInVerbs(
            vr.map((r) => (JSON.parse(r.body) as { verb: VerbDetail }).verb),
            trimmed,
          ),
        };
      }
      if (live) setServer({ q: normalise(trimmed), ...answer, busy: false });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [trimmed, lang, contentLocale, topics.length]);

  // Titles, tags and headings answer on the keystroke; body hits carry the matched row.
  const hits = useMemo<Hit[]>(() => {
    if (!searching) return [];
    const local = localHits(buildHaystack(topics), needle);
    const remote = server.q === needle ? server.hits : [];
    const seen = new Set(remote.map((h) => h.slug));
    return [
      ...remote,
      ...local
        .filter((x) => !seen.has(x.slug))
        .map((x) => ({ slug: x.slug, title: x.title, level: x.level ?? '' })),
    ].slice(0, 30);
  }, [searching, topics, needle, server]);
  const verbs = searching && server.q === needle ? server.verbs : [];

  const tree = useMemo(
    () =>
      SECTIONS.map((section) => ({
        id: section.id,
        categories: CATEGORIES.filter((c) => c.section === section.id)
          .map((c) => ({
            id: c.id,
            topics: topics
              .filter((topic) => topic.section === section.id && topic.category === c.id)
              .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
          }))
          .filter((c) => c.topics.length > 0),
      })).filter((s) => s.categories.length > 0),
    [topics],
  );

  const bodyDir = dirFor(contentLocale);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2.5">
        <div className="flex h-9 items-center gap-2 rounded-[7px] border border-input bg-background px-2.5 focus-within:border-accent">
          <Search className="h-4 w-4 shrink-0 text-caption" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('pdf.cheatsheet.search')}
            aria-label={t('pdf.cheatsheet.search')}
            dir="auto"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-caption"
          />
          {searching && server.busy && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-caption" />
          )}
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label={t('pdf.cheatsheet.clear')}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-caption hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 px-4 py-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-[7px] bg-muted" />
          ))}
        </div>
      ) : failed ? (
        <div className="space-y-3 px-4 py-4">
          <InlineError message={tc('errors.loadFailed')} />
          <Button variant="outline" onClick={onRetry}>
            {t('pdf.cheatsheet.retry')}
          </Button>
        </div>
      ) : searching ? (
        <div dir={bodyDir} className="px-2 py-2">
          {verbs.length > 0 && (
            <ul className="mb-1 border-b border-border pb-1">
              {verbs.slice(0, 5).map((v) => (
                <li key={`${v.lemma}:${v.mood}:${v.tense}:${v.pr}`}>
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: 'verb', lemma: v.lemma })}
                    className="flex w-full items-baseline gap-2 rounded-[7px] px-2.5 py-2 text-start transition-colors hover:bg-muted"
                  >
                    <span dir="ltr" lang={lang} className="text-sm font-bold text-foreground">
                      {v.lemma}
                    </span>
                    <span dir="ltr" lang={lang} className="text-xs text-muted-foreground">
                      {v.pr && !v.form.startsWith(v.pr) ? `${v.pr} ${v.form}` : v.form}
                    </span>
                    {v.gloss && (
                      <span className="min-w-0 flex-1 truncate text-xs text-caption">
                        {v.gloss}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hits.length === 0 && verbs.length === 0 ? (
            server.busy || server.q !== needle ? null : (
              <p className="px-2.5 py-4 text-sm text-caption">
                {t('pdf.cheatsheet.noResults', { q: trimmed })}
              </p>
            )
          ) : (
            <ul>
              {hits.map((hit) => (
                <li key={hit.slug}>
                  <button
                    type="button"
                    onClick={() => onOpen({ kind: 'topic', slug: hit.slug, q: trimmed })}
                    className="block w-full rounded-[7px] px-2.5 py-2 text-start transition-colors hover:bg-muted"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                        {hit.title}
                      </span>
                      <LevelChip level={hit.level} />
                    </span>
                    {hit.line && (
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-caption">
                        {hit.heading ? `${hit.heading} — ` : ''}
                        {hit.line
                          .replace(/[`*_|]/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim()}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : topics.length === 0 ? (
        <p className="px-4 py-6 text-sm leading-6 text-caption">{t('pdf.cheatsheet.empty')}</p>
      ) : (
        // A book's contents: chapters, their sections, and a dotted leader to the level.
        <nav dir={bodyDir} className="px-2 pb-6 pt-1">
          {tree.map((section, i) => (
            <section key={section.id} className={i > 0 ? 'mt-4' : 'mt-2'}>
              <h3 className="px-2.5 text-[10.5px] font-bold uppercase tracking-[.14em] text-primary">
                {tc(`sections.${section.id}`)}
              </h3>
              {section.categories.map((category) => (
                <div key={category.id} className="mt-2">
                  {section.categories.length > 1 && (
                    <h4 className="px-2.5 pb-0.5 text-xs font-semibold text-muted-foreground">
                      {tc(`categories.${category.id}`)}
                    </h4>
                  )}
                  <ul>
                    {category.topics.map((topic) => (
                      <li key={topic.slug}>
                        <button
                          type="button"
                          onClick={() => onOpen({ kind: 'topic', slug: topic.slug })}
                          className="group flex w-full items-baseline gap-2 rounded-[7px] px-2.5 py-1.5 text-start transition-colors hover:bg-muted"
                        >
                          <span className="min-w-0 text-[13px] text-foreground group-hover:text-primary">
                            {topic.title}
                          </span>
                          <span
                            aria-hidden
                            className="mb-1 min-w-[1rem] flex-1 border-b border-dotted border-border"
                          />
                          <LevelChip level={topic.level} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </nav>
      )}
    </div>
  );
}

function LevelChip({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <span className="shrink-0 rounded-[5px] bg-primary/10 px-1.5 py-px text-[10.5px] font-bold tabular-nums text-primary">
      {level}
    </span>
  );
}

// ---------- A topic ----------

function Failure({
  error,
  notFound,
  onRetry,
}: {
  error: boolean;
  notFound: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation('reader');
  const { t: tc } = useCsLocale();
  return (
    <div className="space-y-3 px-5 py-5">
      <InlineError
        message={notFound && !error ? tc('errors.pageNotFound') : tc('errors.loadFailed')}
      />
      {error && (
        <Button variant="outline" onClick={onRetry}>
          {t('pdf.cheatsheet.retry')}
        </Button>
      )}
    </div>
  );
}

function TopicPage({
  lang,
  locales,
  slug,
  q,
  topics,
  onOpen,
}: {
  lang: string;
  locales: string[];
  slug: string;
  /** What the reader searched for — the page opens on the row that matched. */
  q?: string;
  topics: TopicSummary[];
  onOpen: (page: CheatsheetPage) => void;
}) {
  const { t: tc } = useCsLocale();
  const res = useResource(async () => {
    const found = await firstLocale(
      locales,
      async (l) => (await cheatsheet.getTopic(lang, l, slug))?.data ?? null,
    );
    return found ? { locale: found.locale, topic: found.res } : null;
  }, [lang, slug, locales.join(',')]);
  const body = useRef<HTMLDivElement>(null);
  const data = res.data;

  // Opened from a search: land on the row that matched, and mark it.
  useEffect(() => {
    if (!data || !q || q.length < 2) return;
    const needle = normalise(q);
    const target = Array.from(
      body.current?.querySelectorAll<HTMLElement>('tr, li, blockquote, p, h2, h3, h4, td') ?? [],
    ).find((el) => normalise(el.textContent ?? '').includes(needle));
    if (!target) return;
    const flash = [
      'bg-warning/25',
      'ring-2',
      'ring-warning/40',
      'transition-colors',
      'duration-700',
    ];
    const id = requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add(...flash);
    });
    const off = setTimeout(() => target.classList.remove(...flash), 2200);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(off);
    };
  }, [data, q]);

  const followInternalLinks = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const match = anchor?.getAttribute('href')?.match(INTERNAL_LINK);
    if (!match || match[1] !== lang) return;
    event.preventDefault();
    const target = decodeURIComponent(match[3]);
    onOpen(match[2] ? { kind: 'verb', lemma: target } : { kind: 'topic', slug: target });
  };

  if (res.loading) return <PanelSkeleton />;
  if (res.error || !data)
    return <Failure error={res.error !== null} notFound={!res.error} onRetry={res.reload} />;

  const { topic, locale } = data;
  const related = topic.related
    .map((s) => topics.find((x) => x.slug === s))
    .filter((r): r is TopicSummary => Boolean(r));

  return (
    <article dir={dirFor(locale)} lang={locale} className="px-5 pb-8 pt-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-primary">
        {tc(`sections.${topic.section}`)}
        {topic.category !== topic.section ? ` · ${tc(`categories.${topic.category}`)}` : ''}
      </p>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <h3 className="text-lg font-extrabold leading-snug text-foreground">{topic.title}</h3>
        <span className="mt-1">
          <LevelChip level={topic.level} />
        </span>
      </div>
      {topic.subtitle && (
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{topic.subtitle}</p>
      )}

      <div
        ref={body}
        onClickCapture={followInternalLinks}
        className="mt-4 border-t border-border pt-4"
      >
        <CheatsheetMarkdown body={topic.body} lang={lang} codeOnly={sameScript(lang, locale)} />
      </div>

      {related.length > 0 && (
        <footer className="mt-8 border-t border-border pt-4">
          <h4 className="mb-2 text-xs font-bold text-muted-foreground">{tc('related')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <button
                key={r.slug}
                type="button"
                onClick={() => onOpen({ kind: 'topic', slug: r.slug })}
                className="inline-flex items-center rounded-[7px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-accent/40 hover:bg-muted"
              >
                {r.title}
              </button>
            ))}
          </div>
        </footer>
      )}
    </article>
  );
}

// ---------- A verb ----------

function VerbPage({ lang, locales, lemma }: { lang: string; locales: string[]; lemma: string }) {
  const res = useResource(async () => {
    const found = await firstLocale(
      locales,
      async (l) => (await cheatsheet.getVerb(lang, l, lemma))?.data ?? null,
    );
    return found ? { locale: found.locale, verb: found.res } : null;
  }, [lang, lemma, locales.join(',')]);
  if (res.loading) return <PanelSkeleton />;
  if (res.error || !res.data)
    return <Failure error={res.error !== null} notFound={!res.error} onRetry={res.reload} />;

  const { verb, locale } = res.data;
  return (
    <div className="px-5 pb-8 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 dir="ltr" lang={lang} className="text-2xl font-extrabold text-foreground">
            {verb.lemma}
          </h3>
          {verb.ipa && (
            <p dir="ltr" className="font-mono text-xs text-caption">
              {verb.ipa.startsWith('/') ? verb.ipa : `/${verb.ipa}/`}
            </p>
          )}
          {verb.gloss && (
            <p dir={dirFor(locale)} className="mt-1 text-sm text-muted-foreground">
              {verb.gloss}
            </p>
          )}
        </div>
        <span className="mt-1.5">
          <LevelChip level={verb.level} />
        </span>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <VerbConjugation verb={verb} lang={lang} locale={locale} />
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 px-5 py-5">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-muted/60" />
      ))}
    </div>
  );
}
