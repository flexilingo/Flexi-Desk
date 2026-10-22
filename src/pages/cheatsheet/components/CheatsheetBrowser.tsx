import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Menu,
  MessageSquare,
  Repeat,
  X,
} from 'lucide-react';
import { type TopicSummary, buildSidebarTree, formatCount, splitTitle } from '../lib/types';
import { CARD, CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE, LEVEL_PILL } from '../ui';
import { csPath, useCsLocale } from './shared';

/**
 * The sections, in the order someone actually needs them: the rule first, the
 * verb it applies to second, the words to use it on third, and the sentence
 * that puts it to work last.
 */
const SECTION_ICONS = {
  grammaire: BookOpen,
  verbes: Repeat,
  vocabulaire: Layers,
  communication: MessageSquare,
  examen: ClipboardCheck,
} as const;

/**
 * Sidebar + level filter. The filter lives here rather than in the sidebar
 * because it also drives the index grid, and both have to agree about which
 * topics are visible.
 */
export default function CheatsheetBrowser({
  topics,
  lang,
  locale,
  activeSlug,
  variant,
}: {
  topics: TopicSummary[];
  lang: string;
  locale: string;
  activeSlug?: string;
  /**
   * `index` on the landing page. A topic page renders two: the desktop `rail`
   * and the phone `drawer` with its trigger, which sits in the page's top row.
   * Only one is ever visible, so their separate level filters never disagree
   * on screen.
   */
  variant: 'rail' | 'drawer' | 'index';
}) {
  const { t, dir } = useCsLocale();
  const fmt = (n: number) => formatCount(n, locale);
  const [open, setOpen] = useState(false);
  // Drawn from `topics` here rather than passed in: as a prop it was the same
  // topics a second time in the page payload (see buildSidebarTree).
  const tree = useMemo(() => buildSidebarTree(topics), [topics]);

  /**
   * Scrolls the rail to the page you are on.
   *
   * The rail is 161 links in one scrollable column, so it always opened at the
   * top — a reader on a page two thirds down saw no sign of where they were,
   * and had to hunt for it before they could move to a neighbouring topic.
   *
   * It scrolls the RAIL only, never the window: `scrollIntoView` would drag the
   * whole page, and on a sticky sidebar that yanks the article out from under
   * the reader. `auto` rather than `smooth` because this runs on load, and an
   * animation from the top on every navigation is motion nobody asked for.
   */
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeSlug) return;
    const link = rail.querySelector<HTMLElement>('[data-active]');
    if (!link) return;
    const offset = link.offsetTop - rail.clientHeight / 2 + link.clientHeight / 2;
    rail.scrollTo({ top: Math.max(0, offset), behavior: 'auto' });
    // `open`: the drawer's list only exists once it is opened.
  }, [activeSlug, open]);
  const [level, setLevel] = useState<string | null>(null);

  const counts = useMemo(
    () =>
      // The levels the pages actually have — a new level's pages bring their chip.
      [...new Set(topics.map((t) => t.level).filter(Boolean))]
        .sort()
        .map((l) => ({ level: l, count: topics.filter((t) => t.level === l).length })),
    [topics],
  );

  const keep = (t: TopicSummary) => !level || t.level === level;

  const chips = (
    <div className="flex flex-wrap items-center gap-2" dir={dir}>
      <button
        type="button"
        onClick={() => setLevel(null)}
        className={`${CHIP_BASE} ${level === null ? CHIP_ACTIVE : CHIP_IDLE}`}
        aria-pressed={level === null}
      >
        {t('levels.all')}
        <span className="tabular-nums opacity-60">{fmt(topics.length)}</span>
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
  );

  /**
   * The index's own level chips, so the filter looks the same on both pages —
   * without the counts, which in a 15rem rail wrapped the row onto two lines.
   */
  const levelTabs = (
    <div className="mb-5 flex flex-wrap items-center gap-1.5" dir={dir}>
      {[null, ...counts.filter((c) => c.count > 0).map((c) => c.level)].map((l) => (
        <button
          key={l ?? 'all'}
          type="button"
          onClick={() => setLevel(l === level ? null : l)}
          aria-pressed={level === l}
          className={`${CHIP_BASE} ${level === l ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          {l ?? t('levels.all')}
        </button>
      ))}
    </div>
  );

  /**
   * Which categories are open. Only the one holding this page starts open:
   * all of them at once was 161 links in one column, most of them two lines
   * long, with the reader's own page somewhere in the middle.
   */
  const activeCategory = useMemo(
    () =>
      tree.flatMap((s) => s.categories).find((c) => c.topics.some((x) => x.slug === activeSlug))
        ?.id,
    [tree, activeSlug],
  );
  const [openCats, setOpenCats] = useState<Set<string>>(
    () => new Set(activeCategory ? [activeCategory] : []),
  );
  const toggleCat = (id: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nav = (
    <nav className="space-y-6" dir={dir}>
      <Link
        to={csPath(lang, 'verbes')}
        onClick={() => setOpen(false)}
        className="inline-flex items-center gap-2 rounded-[9px] border-[1.5px] border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
      >
        <Repeat className="h-4 w-4 shrink-0" />
        {t('verbs.title')}
      </Link>
      {tree.map((s) => {
        const cats = s.categories
          .map((c) => ({ ...c, topics: c.topics.filter(keep) }))
          .filter((c) => c.topics.length > 0);
        if (cats.length === 0) return null;
        return (
          <div key={s.id}>
            <h3 className="mb-1.5 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-caption rtl:text-xs rtl:tracking-normal">
              {t(`sections.${s.id}`)}
            </h3>
            <ul className="space-y-0.5">
              {cats.map((c) => {
                const isOpen = openCats.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggleCat(c.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-caption transition-transform rtl:rotate-180 ${isOpen ? 'rotate-90 rtl:rotate-90' : ''}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{t(`categories.${c.id}`)}</span>
                      <span className="shrink-0 text-xs tabular-nums text-caption">
                        {fmt(c.topics.length)}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="mb-1.5 ms-[0.9rem] mt-0.5 space-y-px border-s border-border ps-2">
                        {c.topics.map((x) => {
                          const active = x.slug === activeSlug;
                          return (
                            <li key={x.slug}>
                              <Link
                                to={csPath(lang, x.slug)}
                                onClick={() => setOpen(false)}
                                title={x.title}
                                data-active={active || undefined}
                                className={`block truncate rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] transition-colors ${
                                  active
                                    ? 'bg-card font-medium text-primary shadow-sm'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                              >
                                {splitTitle(x.title).lead}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  if (variant === 'index') {
    /**
     * A card per section, its categories as rows that open in place. All 161
     * topics as cards was the whole page — forty screens on a phone — before a
     * reader could see the sections' names. Now the four sections fit on one
     * screen and a category is one tap away.
     */
    return (
      <div dir={dir} className="space-y-3 sm:space-y-4">
        {chips}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 lg:items-start">
          <Link
            to={csPath(lang, 'verbes')}
            className={`${CARD} flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/60 sm:px-6 lg:col-span-2`}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
              <Repeat className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-foreground">{t('verbs.title')}</span>
              <span className="mt-0.5 block text-sm text-caption">{t('verbs.cardLine')}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-caption rtl:rotate-180" />
          </Link>

          {tree.map((s) => {
            const cats = s.categories
              .map((c) => ({ ...c, topics: c.topics.filter(keep) }))
              .filter((c) => c.topics.length > 0);
            if (cats.length === 0) return null;
            const Icon = SECTION_ICONS[s.id as keyof typeof SECTION_ICONS] ?? BookOpen;
            const count = cats.reduce((n, c) => n + c.topics.length, 0);
            return (
              <section key={s.id} className={CARD}>
                <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug text-foreground sm:text-lg">
                    {t(`sections.${s.id}`)}
                  </h3>
                  <span className="shrink-0 text-sm tabular-nums text-caption">{fmt(count)}</span>
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {cats.map((c) => {
                    const isOpen = openCats.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => toggleCat(c.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-muted/60 sm:px-6"
                        >
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 text-primary transition-transform rtl:rotate-180 ${isOpen ? 'rotate-90 rtl:rotate-90' : ''}`}
                          />
                          <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-foreground">
                            {t(`categories.${c.id}`)}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-caption">
                            {fmt(c.topics.length)}
                          </span>
                        </button>
                        {isOpen && (
                          <ul className="divide-y divide-border border-t border-border bg-muted/40">
                            {c.topics.map((x) => {
                              const { lead, tail } = splitTitle(x.title);
                              return (
                                <li key={x.slug}>
                                  <Link
                                    to={csPath(lang, x.slug)}
                                    className="flex items-center gap-3 py-2.5 pe-4 ps-10 transition-colors hover:bg-muted sm:pe-6 sm:ps-12"
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[0.9375rem] text-foreground">
                                        {lead}
                                      </span>
                                      {(tail || x.subtitle) && (
                                        <span className="block truncate text-[0.8125rem] text-caption">
                                          {tail || x.subtitle}
                                        </span>
                                      )}
                                    </span>
                                    {x.level && <span className={LEVEL_PILL}>{x.level}</span>}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === 'drawer') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('topicList')}
          title={t('topicList')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-card text-primary hover:border-accent/40 transition-colors lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" dir={dir}>
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
            <div
              ref={railRef}
              className="absolute inset-y-0 end-0 w-[min(20rem,86vw)] overflow-y-auto overscroll-contain bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl"
            >
              <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-center justify-between border-b border-border bg-background px-5 py-3">
                <span className="text-sm font-extrabold text-foreground">{t('topicList')}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-foreground hover:bg-foreground/40"
                  aria-label={t('close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {levelTabs}
              {nav}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    // Its width is the page grid's first column.
    <aside className="hidden lg:block">
      <div
        ref={railRef}
        className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pe-2 [scrollbar-width:thin]"
      >
        {levelTabs}
        {nav}
      </div>
    </aside>
  );
}
