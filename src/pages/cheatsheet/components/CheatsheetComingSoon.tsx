import { Link } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { CARD } from '../ui';
import { csPath, languageLabel, useCsLocale } from './shared';
import RequestLanguageButton from './RequestLanguageButton';

/**
 * Shown when the cheatsheet has no content at all for this language. Not a dead
 * end: the vote says which language to write next, and the links go to the
 * languages it IS in.
 */
export default function CheatsheetComingSoon({
  lang,
  availableIn,
}: {
  lang: string;
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
          {t('comingSoon.title')}
        </h1>
        <p className="mt-3 leading-[1.9] text-muted-foreground">{t('comingSoon.body')}</p>
        <div className="mt-6 flex justify-center">
          <RequestLanguageButton lang={lang} locale={locale} />
        </div>
        {availableIn.length > 0 && (
          <div className="mt-8 border-t border-border pt-6">
            <p className="text-sm font-semibold text-primary">{t('comingSoon.availableIn')}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {availableIn.map((l) => (
                <Link
                  key={l}
                  to={`${csPath(lang)}?explain=${l}`}
                  className="inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:border-accent/40 hover:text-accent"
                >
                  {languageLabel(l, locale)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
