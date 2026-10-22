import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import {
  dirFor,
  formatCount,
  type FormHit,
  type VerbDetail,
  type VerbListItem,
} from '../lib/types';
import { infinitiveIn } from '../lib/onDemand';
import { normalise } from '../lib/normalise';
import {
  buildVerbRows,
  filterVerbs,
  formsInVerbs,
  offerConjugation,
  pageCount,
  pageList,
  pageSlice,
  verbLevelCounts,
} from '../lib/search';
import { cheatsheet, cacheList } from '../lib/service';
import ConjugateOnDemand from './ConjugateOnDemand';
import { CARD, CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, LEVEL_PILL } from '../ui';
import { csPath, useCsLocale, useOnline } from './shared';

// The page you are on is state, so primary; accent is kept for the level chip the reader picked.
const pageBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors';
const pageActive = 'border-primary bg-primary text-primary-foreground';
const pageIdle = 'border-border bg-card text-primary hover:border-accent/40 hover:text-accent';

export default function VerbIndex({
  verbs,
  more = [],
  lang,
  locale,
}: {
  /** Verbs with a meaning in this locale. */
  verbs: VerbListItem[];
  /** Every other verb we conjugate — listed after them, by name alone. */
  more?: string[];
  lang: string;
  locale: string;
}) {
  const { t } = useCsLocale();
  const online = useOnline();
  const fmt = (n: number) => formatCount(n, locale);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<string | null>(null);

  const haystack = useMemo(() => buildVerbRows(verbs, more), [verbs, more]);
  const needle = normalise(q.trim());
  const shown = useMemo(() => filterVerbs(haystack, needle, level), [haystack, needle, level]);

  /**
   * When nothing matches the infinitive or the meaning, ask the backend whether
   * the query is a CONJUGATED form.
   *
   * That is the search a reader actually performs: they met `aiment` in a
   * sentence. Filtering only on the lemma returned "0 verbs" for the one
   * question the page exists to answer. The paradigms are 2.4 MB, so the lookup
   * belongs on the server; it is only asked once the local list comes up empty.
   */
  const [forms, setForms] = useState<{ q: string; hits: FormHit[] }>({ q: '', hits: [] });
  useEffect(() => {
    if (needle.length < 3 || shown.length > 0) return;
    const id = setTimeout(() => {
      // Offline, the same question is answered from the verb pages stored on this computer.
      cheatsheet
        .findForm(lang, locale, q.trim())
        .catch(async () => {
          const rows = await cacheList(lang, 'verb', `${locale}:`).catch(() => []);
          return formsInVerbs(
            rows.map((r) => (JSON.parse(r.body) as { verb: VerbDetail }).verb),
            q.trim(),
          );
        })
        .then((hits: FormHit[]) => setForms({ q: needle, hits }));
    }, 220);
    return () => clearTimeout(id);
  }, [needle, shown.length, lang, locale, q]);
  const formHits = forms.q === needle && shown.length === 0 ? forms.hits : [];

  // A verb we do not have is built on request. Offered once it is clear that
  // nothing here IS the typed verb — not in the list, and not the lemma of a
  // form lookup — and only after that lookup has answered, so it never flashes.
  const asked = infinitiveIn(q);
  const offer =
    online &&
    offerConjugation({
      asked,
      answered: shown.length > 0 || forms.q === needle,
      lemmas: [...haystack.map((v) => v.lemma), ...formHits.map((f) => f.lemma)],
    });

  // The page is tied to the filter it was chosen under, so a new search or
  // level starts again at page 1 without an effect to reset it.
  const view = `${needle}|${level ?? ''}`;
  const [pageAt, setPageAt] = useState({ view: '', n: 1 });
  const pages = pageCount(shown.length);
  const page = pageAt.view === view ? Math.min(pageAt.n, pages) : 1;
  const visible = pageSlice(shown, page);
  const listTop = useRef<HTMLParagraphElement>(null);
  const goTo = (n: number) => {
    setPageAt({ view, n });
    listTop.current?.scrollIntoView({ block: 'start' });
  };
  const rtl = dirFor(locale) === 'rtl';
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  const counts = useMemo(() => verbLevelCounts(verbs), [verbs]);

  return (
    <div dir={dirFor(locale)}>
      <div className="relative mb-4 max-w-xl">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-caption" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('verbs.searchPlaceholder')}
          className="w-full rounded-[9px] border border-border bg-card py-3 ps-10 pe-10 text-[0.9375rem] text-foreground outline-none placeholder:text-caption focus:border-accent/60"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-caption hover:text-accent"
            aria-label={t('search.clear')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLevel(null)}
          className={`${CHIP_BASE} ${level === null ? CHIP_ACTIVE : CHIP_IDLE}`}
          aria-pressed={level === null}
        >
          {t('levels.all')}
          <span className="tabular-nums opacity-60">{fmt(haystack.length)}</span>
        </button>
        {counts
          .filter((c) => c.count > 0)
          .map((c) => (
            <button
              key={c.level}
              type="button"
              onClick={() => setLevel(level === c.level ? null : c.level)}
              className={`${CHIP_BASE} ${level === c.level ? CHIP_ACTIVE : CHIP_IDLE}`}
              aria-pressed={level === c.level}
            >
              {c.level}
              <span className="tabular-nums opacity-60">{fmt(c.count)}</span>
            </button>
          ))}
      </div>

      <p ref={listTop} className="mb-2 scroll-mt-4 text-sm text-caption">
        {t('verbs.count', { count: fmt(shown.length) })}
      </p>

      {/* The query was a conjugated form. Shown as an answer rather than as
          another card, because the reader asked "what is this word" and the
          reply is a sentence, not a list entry. */}
      {formHits.length > 0 && (
        <div className="mb-4 space-y-2">
          {formHits.map((f) => (
            <Link
              key={`${f.lemma}-${f.form}`}
              to={csPath(lang, 'verbes', f.lemma)}
              className="block rounded-[9px] border border-warning/35 bg-warning/15 px-4 py-3 transition-colors hover:border-warning/60"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[15px] font-bold text-foreground" dir="ltr">
                  {f.form}
                </span>
                <span className="text-caption">←</span>
                <span className="text-[15px] font-bold text-accent" dir="ltr">
                  {f.lemma}
                </span>
                {f.gloss && <span className="text-sm text-muted-foreground">{f.gloss}</span>}
              </span>
              <span className="mt-0.5 block text-[13px] text-caption" dir="ltr">
                {f.pr} · {f.tense} · {f.ipa}
              </span>
            </Link>
          ))}
        </div>
      )}

      {offer && asked && (
        <div className="mb-4">
          <ConjugateOnDemand word={asked} lang={lang} />
        </div>
      )}

      {/* One card, a row per verb — a bordered box per verb was a wall of
          frames. The grid's last row of dividers is tucked under the card's
          own border by the negative margin. */}
      {visible.length > 0 && (
        <div className={CARD}>
          <div className="-mb-px grid sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((v, i) => (
              <Fragment key={v.lemma}>
                {/* Where the verbs without a meaning begin — so a row with only
                    a name on it reads as "not written yet", not as broken. */}
                {v.extra && !visible[i - 1]?.extra && (
                  <p className="col-span-full border-b border-border bg-background px-4 py-2 text-[0.8125rem] font-semibold text-primary">
                    {t('verbs.noMeaningYet')}
                  </p>
                )}
                <Link
                  to={csPath(lang, 'verbes', v.lemma)}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold text-foreground">
                      {/* Isolated rather than `dir="ltr"`, which pushed the
                          verb to the far side of its row on a Persian page. */}
                      <bdi>{v.lemma}</bdi>
                    </span>
                    {v.gloss && (
                      <span className="block truncate text-[0.8125rem] text-caption">
                        {v.gloss}
                      </span>
                    )}
                  </span>
                  {v.level && <span className={LEVEL_PILL}>{v.level}</span>}
                </Link>
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {pages > 1 && (
        <nav
          aria-label={t('verbs.pages')}
          className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => goTo(page - 1)}
            aria-label={t('verbs.prevPage')}
            className={`${pageBtn} ${pageIdle} ${page === 1 ? 'invisible' : ''}`}
          >
            <Prev className="h-4 w-4" />
          </button>
          {pageList(page, pages).map((n, i) =>
            n === null ? (
              <span
                key={`gap-${i}`}
                className="inline-flex h-9 w-6 items-center justify-center text-caption"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => goTo(n)}
                aria-current={n === page ? 'page' : undefined}
                className={`${pageBtn} ${n === page ? pageActive : pageIdle}`}
              >
                {fmt(n)}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => goTo(page + 1)}
            aria-label={t('verbs.nextPage')}
            className={`${pageBtn} ${pageIdle} ${page === pages ? 'invisible' : ''}`}
          >
            <Next className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
