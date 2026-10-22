import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type TopicSummary, splitTitle } from '../lib/types';
import { CARD, CARD_TITLE } from '../ui';
import { csPath, useCsLocale } from './shared';

/** Enough to choose from without the list becoming the page's longest part. */
const FIRST = 4;

/** Where to go next, as rows: the subject, and under it the hook in a quieter voice. */
export default function CheatsheetRelated({
  topics,
  lang,
}: {
  topics: Pick<TopicSummary, 'slug' | 'title'>[];
  lang: string;
}) {
  const { t, dir } = useCsLocale();
  const [all, setAll] = useState(false);
  if (topics.length === 0) return null;
  const shown = all ? topics : topics.slice(0, FIRST);
  const hidden = topics.length - shown.length;

  return (
    <section dir={dir} className={`${CARD} mt-3 sm:mt-4`}>
      <h2 className={`${CARD_TITLE} px-4 pb-2 pt-5 sm:px-6`}>{t('related')}</h2>
      <ul className="divide-y divide-border border-t border-border">
        {shown.map((r) => {
          const { lead, tail } = splitTitle(r.title);
          return (
            <li key={r.slug}>
              <Link
                to={csPath(lang, r.slug)}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-foreground">
                    {lead}
                  </span>
                  {tail && (
                    <span className="block truncate text-[0.8125rem] text-caption">{tail}</span>
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-caption rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-accent"
          >
            {t('relatedMore', { count: hidden })}
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
