import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Captions,
  Headphones,
  Loader2,
  Lock,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import { useTrackListens } from '../lib/use-book-track';
import { trackNumbers, type BookEdition, type BookTrack, type TrackIndex } from '../lib/book-audio';
import type { TrackPlayer } from '../lib/use-track-player';

/** A track's subtitles, from this learner's side: how many full listens, out of how many. */
interface SubtitleState {
  listens: number;
  required: number;
}

/**
 * Every recording in the book, named for the exercise it belongs to.
 *
 * The names and pages come from the book's own track index (see
 * `readTrackIndex`) — "Phonie-graphie : les liaisons · Activité 1, page 28"
 * instead of "Track 26", because the reader is holding page 28, not a track
 * list. A recording the index does not mention keeps its number and no page:
 * it is still in the list, it just makes no claim about where it belongs.
 *
 * The page being read leads the panel, so the recordings for what is on
 * screen are always the first thing in it. Nothing scrolls the book on its
 * own — each row's Go button is there for the reader to press.
 */
export function PdfAudioPanel({
  edition,
  index,
  indexing,
  currentPage,
  player,
  onGoToPage,
  onClose,
}: {
  edition: BookEdition;
  /** Null while it is being read, and for a book that prints no index. */
  index: TrackIndex | null;
  /** True until the book's index has been read. */
  indexing: boolean;
  currentPage: number;
  player: TrackPlayer;
  onGoToPage: (pageNumber: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const [query, setQuery] = useState('');
  const listens = useTrackListens(edition.id);

  // Only tracks that have subtitles at all get a mark: a recording nobody
  // transcribed makes no promise.
  const subtitles = useMemo(() => {
    const out = new Map<number, SubtitleState>();
    if (!listens || listens.edition !== edition.id) return out;
    for (const track of listens.subtitled) {
      out.set(track, { listens: listens.listens[track] ?? 0, required: listens.required });
    }
    return out;
  }, [listens, edition.id]);

  const rows = useMemo(
    () =>
      trackNumbers(edition).map((track) => ({ track, info: index?.byTrack.get(track) ?? null })),
    [edition, index],
  );

  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return rows;
    return rows.filter(
      ({ track, info }) =>
        String(track) === needle ||
        (info !== null &&
          (String(info.page) === needle ||
            fold(`${info.title} ${info.unit ?? ''}`).includes(needle))),
    );
  }, [rows, query]);

  // Consecutive rows of one unit share a heading. Consecutive, not grouped:
  // the list stays in the book's order whatever the search leaves behind.
  const groups = useMemo(() => {
    const out: { unit: string | null; rows: typeof filtered }[] = [];
    for (const row of filtered) {
      const unit = row.info?.unit ?? null;
      const last = out[out.length - 1];
      if (last && last.unit === unit) last.rows.push(row);
      else out.push({ unit, rows: [row] });
    }
    return out;
  }, [filtered]);

  const onThisPage = !query.trim() ? (index?.byPage.get(currentPage) ?? []) : [];

  const renderRow = (track: number, info: BookTrack | null, key: string) => (
    <TrackRow
      key={key}
      track={track}
      info={info}
      subtitles={subtitles.get(track) ?? null}
      player={player}
      onGoToPage={onGoToPage}
    />
  );

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-s border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Headphones className="h-4 w-4 text-primary" />
        </span>
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t('pdf.audio.panelTitle', { n: edition.track_count })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdf.notes.close')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border px-4 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pdf.audio.search')}
            aria-label={t('pdf.audio.search')}
            className="h-9 w-full rounded-md border border-border bg-card ps-8 pe-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
        </div>
        {indexing && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('pdf.audio.reading')}
          </p>
        )}
        {!indexing && index === null && (
          <p className="mt-2 text-xs text-muted-foreground">{t('pdf.audio.noIndex')}</p>
        )}
        {/* DESK: a hosted book's recordings are signed for a cloud copy only — said calmly, once. */}
        {player.hostedAudio === 'needs-account-copy' && (
          <p role="status" className="mt-2 text-xs leading-snug text-muted-foreground">
            {tDesk('audio.hostedNeedsAccount')}
          </p>
        )}
        {player.hostedAudio === 'failed' && (
          <p role="status" className="mt-2 text-xs leading-snug text-muted-foreground">
            {tDesk('audio.hostedFailed')}
          </p>
        )}
        {subtitles.size > 0 && listens && listens.required > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
            <Captions className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
            {t('pdf.audio.subtitlesRule', { count: listens.required, required: listens.required })}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {onThisPage.length > 0 && (
          <section className="border-b border-border">
            <h3 className="sticky top-0 z-[1] border-b border-border bg-muted px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              {t('pdf.audio.onThisPage', { n: currentPage })}
            </h3>
            <ul className="divide-y divide-border">
              {onThisPage.map((info) => renderRow(info.track, info, `here-${info.track}`))}
            </ul>
          </section>
        )}

        {groups.map((group, groupIndex) => (
          <section key={`${group.unit ?? 'none'}-${groupIndex}`}>
            {group.unit && (
              <h3
                dir="auto"
                className="sticky top-0 z-[1] border-y border-border bg-muted px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary"
              >
                {group.unit}
              </h3>
            )}
            <ul className="divide-y divide-border">
              {group.rows.map(({ track, info }) => renderRow(track, info, String(track)))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

function TrackRow({
  track,
  info,
  subtitles,
  player,
  onGoToPage,
}: {
  track: number;
  info: BookTrack | null;
  /** Null for a track without subtitles. */
  subtitles: SubtitleState | null;
  player: TrackPlayer;
  onGoToPage: (pageNumber: number) => void;
}) {
  const { t } = useTranslation('reader');
  const isPlaying = player.playing === track;
  const isLoading = player.loading === track;
  const isFailed = player.failed.has(track);
  const name = info?.title ?? t('pdf.audio.track', { n: track });

  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <button
        type="button"
        onClick={() => player.toggle(track)}
        aria-label={name}
        className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isFailed
            ? 'border-border text-muted-foreground'
            : isPlaying
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-border text-primary hover:bg-muted'
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>

      <div className="min-w-0 flex-1 px-1.5">
        {/* The book's own label, in the book's language — see PdfVideoPanel. */}
        <p dir="auto" className="text-sm font-semibold leading-snug text-foreground">
          {name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {/* The number stays: it is what the book's own code pages use. */}
          {info && <span className="tabular-nums">{t('pdf.audio.track', { n: track })}</span>}
          {info && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{t('pdf.audio.page', { n: info.page })}</span>
            </>
          )}
          {/* Said only where it happened: a number the publisher does not
              serve is one dead row, not a warning about the whole list. */}
          {isFailed && <span className="text-muted-foreground">{t('pdf.audio.unavailable')}</span>}
          {subtitles && (
            <>
              <span aria-hidden="true">·</span>
              <SubtitleMark {...subtitles} />
            </>
          )}
        </p>
      </div>

      {/* At the row's end, where the eye finishes reading the name. */}
      {info && (
        <button
          type="button"
          onClick={() => onGoToPage(info.page)}
          aria-label={t('pdf.audio.goToPage', { n: info.page })}
          title={t('pdf.audio.goToPage', { n: info.page })}
          className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10"
        >
          {t('pdf.audio.go')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      )}
    </li>
  );
}

/** Locked with the count so far, or open. The rule itself is said once, at the top of the panel. */
function SubtitleMark({ listens, required }: SubtitleState) {
  const { t } = useTranslation('reader');
  if (listens >= required) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-primary">
        <Captions className="h-3 w-3" />
        {t('pdf.audio.subtitlesOpen')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums"
      title={t('pdf.audio.subtitlesLockedTitle', { n: listens, required })}
    >
      <Lock className="h-3 w-3" />
      {t('pdf.audio.subtitlesLocked', { n: listens, required })}
    </span>
  );
}

/** Case and accents off, so "activite" finds "Activité". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
