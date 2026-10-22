import { Link } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { CARD } from '../ui';
import { csPath, languageLabel, useCsLocale } from './shared';

/**
 * A topic that exists, but not in this locale (nor in English). A translation gap,
 * not a missing page: it says so and links to the languages it IS in.
 */
export default function TopicNotTranslated({
  lang,
  slug,
  availableIn,
}: {
  lang: string;
  slug: string;
  availableIn: string[];
}) {
  const { t, locale, dir } = useCsLocale();
  return (
    <div className="px-4 py-10 sm:py-16" dir={dir}>
      <div className={`${CARD} mx-auto max-w-xl px-5 py-7 text-center sm:p-8`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[9px] bg-warning/15">
          <Languages className="h-6 w-6 text-warning" />
        </div>
        <h1 className="text-[1.5rem] font-extrabold leading-tight text-foreground sm:text-2xl">
          {t('notTranslated.title')}
        </h1>
        <p className="mt-3 text-muted-foreground">{t('notTranslated.body')}</p>
        {availableIn.length > 0 && (
          <>
            <p className="mt-6 text-sm font-semibold text-primary">
              {t('notTranslated.availableIn')}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {availableIn.map((l) => (
                <Link
                  key={l}
                  to={`${csPath(lang, slug)}?explain=${l}`}
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {languageLabel(l, locale)}
                </Link>
              ))}
            </div>
          </>
        )}
        <div className="mt-8 border-t border-border pt-6">
          <Link
            to={csPath(lang)}
            className="inline-flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-sm font-semibold text-primary hover:text-accent"
          >
            {t('allTopics')}
          </Link>
        </div>
      </div>
    </div>
  );
}
