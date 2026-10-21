import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookCover } from '../library/BookCover';
import { bookReadPath, coverFor, readingMinutes } from '../library/format';
import type { LibraryBook } from '../services/libraryService';

/**
 * The first visit, in one card: a real book, picked for them, one click away.
 * The same card leads after a finished book whose story goes on, with the line
 * above the title saying so (`eyebrow`).
 */
export function ReaderStartPanel({ book, eyebrow }: { book: LibraryBook; eyebrow?: string }) {
  const { t } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');

  const meta = [
    book.series_title && book.series_order
      ? `${book.series_title} · ${tl('catalog.episode', { n: book.series_order })}`
      : book.author,
    book.level,
    tl('catalog.minutes', { n: readingMinutes(book.word_count) }),
  ];

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-nowrap sm:gap-5 sm:p-5">
      <Link to={bookReadPath(book.id)} className="w-20 shrink-0 sm:w-28" tabIndex={-1}>
        <BookCover
          slug={book.slug}
          title={book.title}
          level={book.level}
          series={book.series_title}
          coverPath={coverFor(book)}
          showLevel={false}
        />
      </Link>

      <div className="min-w-0 flex-[1_1_12rem]">
        <p className="text-xs font-semibold text-muted-foreground">
          {eyebrow ?? t('home.first.pick')}
        </p>
        <h2 className="mt-1 text-lg font-extrabold leading-snug tracking-tight text-foreground sm:text-[22px]">
          <bdi>{book.title}</bdi>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{meta.join(' · ')}</p>
        <p
          className="mt-2 line-clamp-2 max-w-[60ch] text-sm leading-6 text-muted-foreground"
          dir="auto"
          lang={book.language}
        >
          {book.summary}
        </p>
      </div>

      <Button asChild className="shrink-0">
        <Link to={bookReadPath(book.id)}>
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          {t('home.startEyebrow')}
        </Link>
      </Button>
    </section>
  );
}
