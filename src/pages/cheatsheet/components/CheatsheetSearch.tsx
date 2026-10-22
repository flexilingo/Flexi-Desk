import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Search, WifiOff, X } from 'lucide-react';
import { infinitiveIn } from '../lib/onDemand';
import { normalise } from '../lib/normalise';
import {
  buildHaystack,
  excerpt,
  formsInVerbs,
  highlightAt,
  localHits,
  mergeHits,
  offerConjugation,
  plainLine,
  searchBodies,
  type Hit,
} from '../lib/search';
import { cheatsheet, cacheList } from '../lib/service';
import type { FormHit, Topic, TopicSummary, VerbDetail } from '../lib/types';
import { LEVEL_PILL } from '../ui';
import ConjugateOnDemand from './ConjugateOnDemand';
import { csPath, useCsLocale, useOnline } from './shared';

/**
 * Two layers, because they fail in opposite directions.
 *
 * The LOCAL layer matches title / subtitle / tags / headings from data the page
 * already has. It answers on the keystroke, with no network — which is what
 * makes the box feel like a filter rather than a form.
 *
 * The SERVER layer searches the actual body of all 161 pages. It is the only
 * one that can find `depuis` or «قال گذاشتن», which live in table rows and
 * appear in no title. Shipping that index to the browser costs 103 KB gzipped
 * on every page load, so it stays on the server and is asked only once typing
 * settles.
 *
 * Server hits carry the row they matched, and that row is the point: someone
 * searching a word usually wants to READ it in place, not to navigate. The
 * result list shows the sentence, so clicking through is optional.
 */

/** Highlights the query inside the matched row (offsets only when folding kept the length). */
function Highlight({ text, q }: { text: string; q: string }) {
  const at = useMemo(() => highlightAt(text, q), [text, q]);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-warning/30 px-0.5 text-foreground">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

type VerbHit = FormHit;

export default function CheatsheetSearch({
  topics,
  lang,
  locale,
  contentLocale = locale,
  variant = 'field',
}: {
  topics: TopicSummary[];
  lang: string;
  locale: string;
  /** Which translation to search, when it is not the reader's own (the English fallback). */
  contentLocale?: string;
  /**
   * `field` is the box itself. `icon` is a magnifier for a phone's top row
   * that opens the same box as a sheet across the top of the screen — the
   * always-open box was one more full-width block between the reader and the
   * page they came for.
   */
  variant?: 'field' | 'icon';
}) {
  const { t, dir } = useCsLocale();
  const navigate = useNavigate();
  const online = useOnline();
  const [q, setQ] = useState('');
  /**
   * The remote result is stored WITH the query it answers, so both "is this
   * still loading?" and "has the query moved on?" are derived rather than kept
   * in sync by hand. Holding a separate `loading` flag meant setting state
   * synchronously inside the effect, which React now warns about — and which
   * could disagree with the results it was describing.
   */
  const [remote, setRemote] = useState<{ q: string; hits: Hit[]; verbs: VerbHit[] }>({
    q: '',
    hits: [],
    verbs: [],
  });
  /** Cursor is tied to its query too, so a new search starts at the top for free. */
  const [cursorAt, setCursorAt] = useState<{ q: string; i: number }>({ q: '', i: 0 });
  /**
   * Whether the result panel is showing. Separate from the query, so a click
   * elsewhere closes the panel but keeps what was typed — focusing the box
   * again brings the same results back.
   */
  const [open, setOpen] = useState(false);
  /** The `icon` variant's sheet. */
  const [sheet, setSheet] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const haystack = useMemo(() => buildHaystack(topics), [topics]);

  const needle = normalise(q.trim());
  const local: Hit[] = useMemo(() => localHits(haystack, needle), [haystack, needle]);

  // Server results replace the local ones for pages both found, because the
  // server version carries the matched row and the local one does not.
  const loading = needle.length >= 2 && remote.q !== needle;
  const verbHits = remote.q === needle ? remote.verbs : [];
  // A verb we do not have is built on request — offered once the search has
  // answered and none of its verbs is the one typed.
  const asked = infinitiveIn(q);
  const offer =
    online && offerConjugation({ asked, answered: !loading, lemmas: verbHits.map((v) => v.lemma) });

  const hits = useMemo(() => mergeHits(remote, local, needle), [local, remote, needle]);

  const cursor = cursorAt.q === needle ? Math.min(cursorAt.i, Math.max(0, hits.length - 1)) : 0;
  const moveCursor = (next: (c: number) => number) => setCursorAt({ q: needle, i: next(cursor) });

  /**
   * Full-text lookup, once typing settles. Offline (or when the request fails) the
   * same question is answered from the pages stored on this computer.
   */
  const [offlineAnswer, setOfflineAnswer] = useState(false);
  useEffect(() => {
    if (needle.length < 2) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const res = await cheatsheet.search(lang, contentLocale, q.trim());
        if (live) {
          setOfflineAnswer(false);
          setRemote({ q: needle, hits: res.hits, verbs: res.verbs });
        }
      } catch {
        try {
          const [topicRows, verbRows] = await Promise.all([
            cacheList(lang, 'topic', `${contentLocale}:`),
            cacheList(lang, 'verb', `${contentLocale}:`),
          ]);
          const stored = topicRows.map((r) => (JSON.parse(r.body) as { topic: Topic }).topic);
          const verbs = verbRows.map((r) => (JSON.parse(r.body) as { verb: VerbDetail }).verb);
          if (live) {
            setOfflineAnswer(true);
            setRemote({
              q: needle,
              hits: searchBodies(stored, q.trim()),
              verbs: formsInVerbs(verbs, q.trim()),
            });
          }
        } catch {
          // Nothing stored either: the local layer still answers.
          if (live) setRemote({ q: needle, hits: [], verbs: [] });
        }
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, needle, lang, contentLocale]);

  /** `/` focuses the box, the way every reference site the reader already uses does. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (typing) return;
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** A click or a Tab anywhere outside the box and its panel closes the panel. */
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [open]);

  /**
   * The query rides along so the destination can scroll to the row instead of
   * dropping the reader at the top of a page they then have to re-scan.
   */
  const hrefFor = useCallback(
    (slug: string) =>
      `${csPath(lang, slug)}?q=${encodeURIComponent(q.trim())}${contentLocale !== locale ? `&explain=${contentLocale}` : ''}`,
    [lang, q, contentLocale, locale],
  );

  /** Leaving for a result: the query and the sheet both go. */
  const leave = () => {
    setQ('');
    setSheet(false);
  };

  const go = useCallback(
    (slug: string) => {
      const to = hrefFor(slug);
      leave();
      navigate(to);
    },
    [navigate, hrefFor],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setQ('');
      setSheet(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) {
      // Only verbs matched: Enter opens the first one, like it opens the first page.
      if (e.key === 'Enter' && verbHits[0]) {
        e.preventDefault();
        leave();
        navigate(csPath(lang, 'verbes', verbHits[0].lemma));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[cursor].slug);
    }
  };

  // Keep the highlighted row inside the scroll box when arrowing past its edge.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-cursor]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const field = (
    <div
      ref={rootRef}
      className={variant === 'icon' ? 'relative min-w-0 flex-1' : 'relative mb-6'}
      dir={dir}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-caption" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          // Opened by a tap, so focusing at once is what the tap asked for — and
          // iOS only raises the keyboard for a focus inside that same gesture.
          autoFocus={variant === 'icon'}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="w-full rounded-[9px] border-[1.5px] border-border bg-card py-3 ps-11 pe-12 text-[15px] sm:pe-24 text-foreground outline-none transition-colors placeholder:text-caption focus:border-accent/60"
        />
        <div className="pointer-events-none absolute end-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-caption" />}
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              className="pointer-events-auto text-caption transition-colors hover:text-foreground"
              aria-label={t('search.clear')}
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          ) : (
            // A shortcut hint is noise on a phone, which has no `/` key to press.
            <kbd className="hidden rounded border sm:inline-block border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold text-caption">
              /
            </kbd>
          )}
        </div>
      </div>

      {open && needle && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[9px] border border-border bg-card shadow-lg">
          {/* A verb no page mentions — most of the catalogue — is still an
              answer. Testing only `hits` here said "no results" over it. */}
          {hits.length === 0 && verbHits.length === 0 ? (
            offer && asked ? (
              <ConjugateOnDemand word={asked} lang={lang} compact />
            ) : (
              <p className="px-4 py-3.5 text-[15px] text-muted-foreground">
                {loading ? '…' : t('search.noResults')}
              </p>
            )
          ) : (
            <ul ref={listRef} className="max-h-[26rem] divide-y divide-border overflow-y-auto">
              {/* A conjugated form is a direct answer, not a page to go read,
                  so it sits above the pages rather than among them. */}
              {verbHits.map((v) => (
                <li key={`verb-${v.lemma}`}>
                  <Link
                    to={csPath(lang, 'verbes', v.lemma)}
                    onClick={leave}
                    className="block bg-warning/10 px-4 py-3 transition-colors hover:bg-warning/15"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[15px] font-bold text-foreground" dir="ltr">
                        {v.form}
                      </span>
                      <span className="text-[13px] text-caption">←</span>
                      <span className="text-[15px] font-bold text-accent" dir="ltr">
                        {v.lemma}
                      </span>
                      {v.gloss && (
                        <span className="text-[13.5px] text-muted-foreground">{v.gloss}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-caption" dir="ltr">
                      {v.pr} · {v.tense} · {v.ipa}
                    </span>
                  </Link>
                </li>
              ))}
              {hits.map((h, i) => (
                <li key={h.slug}>
                  <Link
                    to={hrefFor(h.slug)}
                    onClick={leave}
                    onMouseEnter={() => setCursorAt({ q: needle, i })}
                    data-cursor={i === cursor ? '' : undefined}
                    className={`block px-4 py-3 transition-colors ${
                      i === cursor ? 'bg-accent/10' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-[15px] font-bold text-foreground">
                        <Highlight text={h.title} q={q.trim()} />
                      </span>
                      {h.level && <span className={LEVEL_PILL}>{h.level}</span>}
                    </span>

                    {/* Two lines at most: the match in context, not the paragraph
                        — a full excerpt let only two results fit on a phone. */}
                    {h.line ? (
                      <span className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">
                        {h.heading && <span className="text-caption">{h.heading} — </span>}
                        <Highlight text={excerpt(plainLine(h.line), q.trim())} q={q.trim()} />
                        {h.matches && h.matches > 1 ? (
                          <span className="text-caption"> · {h.matches}×</span>
                        ) : null}
                      </span>
                    ) : (
                      h.subtitle && (
                        <span className="mt-0.5 block text-[13.5px] text-caption">
                          {h.subtitle}
                        </span>
                      )
                    )}
                  </Link>
                </li>
              ))}
              {offer && asked && (
                <li>
                  <ConjugateOnDemand word={asked} lang={lang} compact />
                </li>
              )}
            </ul>
          )}
          {/* Keyboard keys mean nothing on a phone. The message carries its
              own ↵, so no icon beside it. */}
          {offlineAnswer && (
            <p className="flex items-center gap-1.5 border-t border-border bg-background px-4 py-2 text-[12px] text-caption">
              <WifiOff className="h-3.5 w-3.5" />
              {t('offline.searchNote')}
            </p>
          )}
          {hits.length > 0 && (
            <p className="hidden border-t border-border bg-background px-4 py-2 text-[12px] text-caption sm:block">
              {t('search.hint')}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (variant === 'field') return field;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label={t('search.placeholder')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-card text-primary hover:border-accent/40 transition-colors"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
      {sheet && (
        <div className="fixed inset-0 z-50" dir={dir}>
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setSheet(false)} />
          <div className="relative flex items-center gap-2 border-b border-border bg-background px-4 pb-3 pt-3 shadow-lg">
            {field}
            <button
              type="button"
              onClick={() => {
                setQ('');
                setSheet(false);
              }}
              className="inline-flex h-11 shrink-0 items-center px-1 text-sm font-semibold text-primary"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
