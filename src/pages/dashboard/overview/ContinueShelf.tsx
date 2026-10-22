import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ChevronRight,
  FileText,
  GraduationCap,
  Headphones,
  Layers,
  Play,
} from 'lucide-react';
import { InlineError } from '@/components/common/InlineError';
import { bookReadPath, coverFor } from '@/pages/reader/library/format';
import { DESK_EXAMS } from './exam';
import { BookFallback, DeckStackArt, IconArt, OverviewCard, RemoteImage, linkClass } from './parts';
import { useStartStudy } from './useStartStudy';
import type { OverviewData } from './useOverviewData';

interface ShelfItem {
  key: string;
  kind: 'podcast' | 'book' | 'file' | 'exam' | 'deck';
  title: string;
  meta: string;
  /** 0–100; null hides the bar. */
  progress: number | null;
  to?: string;
  onClick?: () => void;
  cover: ReactNode;
  at: number;
}

const KIND_ICON: Record<ShelfItem['kind'], ComponentType<{ className?: string }>> = {
  podcast: Headphones,
  book: BookOpen,
  file: FileText,
  exam: GraduationCap,
  deck: Layers,
};

/**
 * Where the learner left off, across the whole app: the episode half listened,
 * the book on page 14, the practice not finished, the deck with cards due, each
 * one tap from where it was. With nothing to continue it becomes a starter
 * shelf of library books at the learner's level (signed in).
 */
export function ContinueShelf({ data }: { data: OverviewData }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'home.shelf' });
  const { startStudy, starting, startError } = useStartStudy();

  const items: ShelfItem[] = [
    ...data.listening.inProgress.map(({ episode, href, minutesLeft }) => ({
      key: `ep-${episode.id}`,
      kind: 'podcast' as const,
      title: episode.title,
      meta: t('minLeft', { count: minutesLeft }),
      progress: episode.duration_seconds
        ? Math.round((episode.position_seconds / episode.duration_seconds) * 100)
        : null,
      to: href,
      cover: <RemoteImage src={episode.image_url} fallback={<IconArt kind="listen" size={84} />} />,
      at: Date.parse(episode.last_played_at) || 0,
    })),
    ...data.readingInProgress.map((item) => ({
      key: item.id,
      kind: item.kind === 'book' ? ('book' as const) : ('file' as const),
      title: item.title,
      meta: item.pageCount
        ? t('page', { page: item.page, total: item.pageCount })
        : t('pageOnly', { page: item.page }),
      progress: item.progress,
      to: item.href,
      cover: item.cover ? (
        <RemoteImage
          src={item.cover.path}
          fallback={<BookFallback />}
          className="object-[center_30%]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-primary">
          <FileText className="h-9 w-9" strokeWidth={1.4} />
        </div>
      ),
      at: item.activityAt,
    })),
  ].sort((a, b) => b.at - a.at);

  if (data.exam?.open && DESK_EXAMS.includes(data.exam.exam)) {
    items.push({
      key: `exam-${data.exam.open.id}`,
      kind: 'exam',
      title: t('examTitle', { exam: data.exam.name }),
      meta: t('examMeta'),
      progress: null,
      to: `/celpip/session/${data.exam.open.id}`,
      cover: (
        <div className="flex h-full w-full items-center justify-center">
          <IconArt kind="exam" size={84} />
        </div>
      ),
      at: 0,
    });
  }
  for (const deck of data.review.dueDecks.slice(0, 2)) {
    items.push({
      key: `deck-${deck.deck_id}`,
      kind: 'deck',
      title: deck.deck_title,
      meta: t('due', { count: deck.due_count }),
      progress: deck.total_cards ? Math.round((deck.mature_count / deck.total_cards) * 100) : null,
      onClick: () => startStudy(deck.deck_id),
      cover: (
        <div className="flex h-full w-full items-center justify-center">
          <DeckStackArt
            size={104}
            label={deck.due_count > 999 ? '999+' : deck.due_count.toLocaleString(i18n.language)}
          />
        </div>
      ),
      at: 0,
    });
  }

  const starter = items.length === 0;
  const shown: ShelfItem[] = starter
    ? data.starterBooks.map((book) => ({
        key: book.id,
        kind: 'book' as const,
        title: book.title,
        meta: t('level', { level: book.level }),
        progress: null,
        to: bookReadPath(book.id),
        cover: (
          <RemoteImage
            src={coverFor(book)}
            fallback={<BookFallback />}
            className="object-[center_30%]"
          />
        ),
        at: 0,
      }))
    : items.slice(0, 5);

  // Starter books arrive after the rest of the page; hold the shelf's place
  // with empty covers meanwhile so nothing below it moves when they land.
  const waiting = starter && shown.length === 0 && data.starterLoading;
  if (shown.length === 0 && !waiting) return null;

  return (
    <OverviewCard labelledBy="shelf-title">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-6">
        <h2 id="shelf-title" className="text-base font-bold text-foreground">
          {starter ? t('starterTitle') : t('title')}
        </h2>
        <Link to={starter ? '/reader/library' : '/podcast'} className={linkClass}>
          {starter ? t('library') : t('allPodcasts')}
          <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
        </Link>
      </div>

      <div className="flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-5 pt-4 sm:px-6 md:grid md:snap-none md:grid-cols-4 md:overflow-visible xl:grid-cols-5">
        {waiting &&
          Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className={`w-[62%] shrink-0 md:w-auto ${i === 4 ? 'md:hidden xl:block' : ''}`}
            >
              <div className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              <div className="mt-3 h-3 w-4/5 animate-pulse rounded-full bg-muted" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        {shown.map((item, i) => {
          const Kind = KIND_ICON[item.kind];
          const body = (
            <>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted transition-shadow group-hover:shadow-md">
                {item.cover}
                <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <Kind className="h-3 w-3" />
                  {t(`kind.${item.kind}`)}
                </span>
                <span className="absolute bottom-2.5 end-2.5 flex h-8 w-8 translate-y-1 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
              </div>
              {item.progress != null && item.progress > 0 && (
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, item.progress)}%` }}
                  />
                </div>
              )}
              <div className="min-w-0 text-start">
                <p className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">
                  <bdi>{item.title}</bdi>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.meta}</p>
              </div>
            </>
          );
          const cls = `group flex w-[62%] shrink-0 snap-start flex-col gap-2 md:w-auto ${i === 4 ? 'md:hidden xl:flex' : ''}`;
          return item.to ? (
            <Link key={item.key} to={item.to} className={cls}>
              {body}
            </Link>
          ) : (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              disabled={starting !== null}
              className={`${cls} disabled:opacity-60`}
            >
              {body}
            </button>
          );
        })}
      </div>
      {startError && (
        <div className="px-5 pb-5 sm:px-6">
          <InlineError message={startError} />
        </div>
      )}
    </OverviewCard>
  );
}
