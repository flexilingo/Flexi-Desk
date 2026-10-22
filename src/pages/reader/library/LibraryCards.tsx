import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock } from 'lucide-react';
import { BookCover, LevelBadge } from './BookCover';
import { coverUrl } from './format';

/**
 * The library's cards, from the website's redesign (`BookCard.tsx` and the list page's series
 * tiles): one bordered card surface with the cover flush on top, the title and the facts
 * below. Each card is one plain link.
 */

const CARD =
  'group flex h-full flex-col overflow-hidden rounded-[9px] border border-border bg-card shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md';

/** Six across on a wide window, like the podcast and video catalogues. */
export const BOOK_GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 xl:grid-cols-6';

/**
 * A series page's episodes: denser than the shelf, up to eight across. Container widths, not
 * the window's: the page sits beside the app's sidebar.
 */
export const EPISODE_GRID =
  'grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6 @7xl:grid-cols-8';

/** A small tick beside an episode the reader finished. */
export function ReadMark({ label }: { label: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
      title={label}
      aria-label={label}
    >
      <Check className="h-3 w-3" />
    </span>
  );
}

/** A book's or a series' language, named in itself ("Français"), so a mixed shelf tells them apart. */
function LanguagePill({ label, language }: { label: string; language: string }) {
  return (
    <span
      lang={language}
      className="max-w-[60%] truncate rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground"
    >
      {label}
    </span>
  );
}

/**
 * One book on the shelf: cover with its level, title, "Series · Season 2 · Episode 1" or the
 * author, minutes and the book's language.
 */
export function BookCard({
  to,
  slug,
  title,
  level,
  language,
  coverPath,
  series = null,
  subtitle,
  minutes,
  languageLabel,
  corner,
}: {
  to: string;
  slug: string;
  title: string;
  level: string;
  /** The book's language: its title is marked up in it. */
  language: string;
  /** The language's own name, shown on the card ("English"). */
  languageLabel?: string;
  coverPath: string | null;
  /** Printed on the typographic cover when there is no artwork. */
  series?: string | null;
  subtitle?: string | null;
  /** Reading time, "16 min". */
  minutes: string;
  /** Laid over the cover's top-start corner (the "in your library" tick). */
  corner?: ReactNode;
}) {
  return (
    <li className="h-full">
      <Link to={to} className={CARD}>
        <div className="relative">
          <BookCover
            slug={slug}
            title={title}
            level={level}
            series={series}
            coverPath={coverPath}
            flush
          />
          {corner && <span className="absolute start-2 top-2">{corner}</span>}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p
            className="line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground transition-colors group-hover:text-primary"
            lang={language}
            dir="auto"
          >
            {title}
          </p>
          {subtitle && (
            <p className="mt-1 truncate text-[11.5px] text-muted-foreground" dir="auto">
              {subtitle}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-caption">
              <Clock className="h-3 w-3" />
              {minutes}
            </span>
            {languageLabel && <LanguagePill label={languageLabel} language={language} />}
          </div>
        </div>
      </Link>
    </li>
  );
}

/** One episode on a series page: the cover with its number large over its foot, the title, minutes, the tick. */
export function EpisodeCard({
  to,
  slug,
  title,
  level,
  language,
  coverPath,
  number,
  episodeLabel,
  minutes,
  mark,
}: {
  to: string;
  slug: string;
  title: string;
  level: string;
  language: string;
  coverPath: string | null;
  /** The episode's number within its season, in the reader's digits. */
  number: string;
  /** "Episode 3" — what the big number says, for screen readers. */
  episodeLabel: string;
  minutes: string;
  mark?: ReactNode;
}) {
  return (
    <li className="h-full">
      <Link to={to} className={CARD}>
        <div className="relative">
          <BookCover slug={slug} title={title} level={level} coverPath={coverPath} flush />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent"
          />
          <span
            aria-hidden
            className="absolute bottom-1.5 start-2.5 text-[30px] font-extrabold leading-none tracking-tight text-white tabular-nums drop-shadow-md"
          >
            {number}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-2.5">
          <span className="sr-only">{episodeLabel}</span>
          <p
            className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-primary"
            lang={language}
            dir="auto"
          >
            {title}
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
            <span className="inline-flex items-center gap-1 text-[11.5px] tabular-nums text-caption">
              <Clock className="h-3 w-3" />
              {minutes}
            </span>
            {mark}
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * A series as a picture tile under the shelf: the cover, "60 episodes", the level, the
 * language and the title on a gradient.
 */
export function SeriesTile({
  to,
  title,
  language,
  languageLabel,
  cover,
  level,
  episodes,
}: {
  to: string;
  title: string;
  language: string;
  /** The language's own name ("Français"). */
  languageLabel?: string;
  cover: string;
  level: string | null;
  /** "60 episodes", already translated. */
  episodes: string;
}) {
  // A picture that will not load leaves the tile's own colour under the title, never a broken image.
  const [failed, setFailed] = useState(false);
  return (
    <li>
      <Link
        to={to}
        className="group relative isolate block aspect-[3/2] overflow-hidden rounded-[9px] bg-primary transition-shadow duration-200 hover:shadow-md"
      >
        {!failed && (
          <img
            src={coverUrl(cover)}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10"
        />
        <span className="relative z-10 flex h-full flex-col justify-between p-3">
          <span className="flex items-start justify-between gap-2">
            <span className="rounded-[7px] bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
              {episodes}
            </span>
            {level && <LevelBadge level={level} />}
          </span>
          <span className="min-w-0">
            {languageLabel && (
              <span
                lang={language}
                className="mb-0.5 block truncate text-[10.5px] font-semibold uppercase tracking-wide text-white/80 drop-shadow-md"
              >
                {languageLabel}
              </span>
            )}
            <span
              className="line-clamp-2 text-[13px] font-bold leading-tight text-white drop-shadow-md"
              lang={language}
              dir="auto"
            >
              {title}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
