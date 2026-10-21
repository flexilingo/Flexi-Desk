import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookCover } from '../library/BookCover';
import { bookReadPath, coverFor, readingMinutes } from '../library/format';
import type { LibraryBook } from '../services/libraryService';

/**
 * One row of covers and a way out to the whole library. The full catalogue
 * lives on its own page; the reading home only needs enough of it to answer
 * "what next".
 */
export function ReaderSuggestions({ heading, books }: { heading: string; books: LibraryBook[] }) {
  const { t } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');

  if (books.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-foreground">{heading}</h2>
        <Link
          to="/reader/library"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {t('home.browse')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </div>

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6 xl:grid-cols-8">
        {books.slice(0, 8).map((book, i) => (
          <li
            key={book.id}
            className={cn(
              i >= 6
                ? 'hidden xl:block'
                : i >= 4
                  ? 'hidden lg:block'
                  : i >= 3
                    ? 'hidden sm:block'
                    : undefined,
            )}
          >
            <Link to={bookReadPath(book.id)} className="group block">
              <div className="transition-transform duration-200 group-hover:-translate-y-1">
                <BookCover
                  slug={book.slug}
                  title={book.title}
                  level={book.level}
                  series={book.series_title}
                  coverPath={coverFor(book)}
                />
              </div>
              <p
                className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug text-foreground group-hover:text-primary"
                dir="auto"
                lang={book.language}
              >
                {book.title}
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {tl('catalog.minutes', { n: readingMinutes(book.word_count) })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
