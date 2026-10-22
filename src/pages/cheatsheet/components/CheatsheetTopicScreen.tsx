import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { dirFor, FALLBACK_EXPLAIN_LOCALE, sameScript } from '../lib/types';
import { indexWithFallback, localesWithTopic, topicWithFallback } from '../lib/client';
import { cheatsheet } from '../lib/service';
import { useResource } from '../lib/useResource';
import { vocabCards } from '../lib/vocab';
import { BACK_LINK } from '../ui';
import { CheatsheetMarkdown } from './CheatsheetMarkdown';
import CheatsheetBrowser from './CheatsheetBrowser';
import CheatsheetSearch from './CheatsheetSearch';
import CheatsheetSectionNav from './CheatsheetSectionNav';
import CheatsheetRelated from './CheatsheetRelated';
import CheatsheetToc from './CheatsheetToc';
import ScrollToMatch from './ScrollToMatch';
import VocabToDeck from './VocabToDeck';
import TopicNotTranslated from './TopicNotTranslated';
import { ResourceGate, csPath, useCsLocale, useExplainLocale } from './shared';

/**
 * The page's columns from `lg` up: the topic rail, the reading column, and from
 * `xl` the "on this page" list.
 */
const PAGE_GRID =
  'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[15rem_minmax(0,1fr)_12rem]';

type Loaded =
  | {
      kind: 'topic';
      topic: NonNullable<Awaited<ReturnType<typeof topicWithFallback>>['topic']>;
      own: boolean;
      navLocale: string;
      topics: Awaited<ReturnType<typeof indexWithFallback>>['data'];
    }
  | { kind: 'missing'; availableIn: string[] };

/**
 * One cheatsheet topic: its hero, the topic rail, the page and its contents. The
 * reader's own language first, English until it is written (`own` says which).
 */
export default function CheatsheetTopicScreen({ lang }: { lang: string }) {
  const { slug = '' } = useParams();
  const { t, locale, dir } = useCsLocale();
  const explain = useExplainLocale();

  const resource = useResource<Loaded>(async () => {
    const { topic, own } = await topicWithFallback(cheatsheet, lang, explain, slug);
    if (!topic) {
      // A slug that exists in some other locale is a translation gap; one that exists
      // nowhere is a made-up URL.
      return { kind: 'missing', availableIn: await localesWithTopic(cheatsheet, lang, slug) };
    }
    // The rail and search follow the locale's own index once it has one, so a single
    // untranslated page does not turn the whole sidebar English.
    const nav = await indexWithFallback(cheatsheet, lang, explain);
    return { kind: 'topic', topic, own, navLocale: nav.locale, topics: nav.data };
  }, [lang, explain, slug]);

  return (
    <ResourceGate resource={resource}>
      {(data) => {
        if (data.kind === 'missing') {
          return data.availableIn.length === 0 ? (
            <div className="mx-auto max-w-xl py-16 text-center text-muted-foreground">
              <p className="mb-4">{t('errors.pageNotFound')}</p>
              <Link to={csPath(lang)} className={BACK_LINK}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                {t('landing.eyebrow')}
              </Link>
            </div>
          ) : (
            <TopicNotTranslated lang={lang} slug={slug} availableIn={data.availableIn} />
          );
        }
        return (
          <TopicBody
            key={`${data.topic.slug}:${explain}`}
            data={data}
            lang={lang}
            locale={locale}
            dir={dir}
            explain={explain}
          />
        );
      }}
    </ResourceGate>
  );
}

function TopicBody({
  data,
  lang,
  locale,
  dir,
  explain,
}: {
  data: Extract<Loaded, { kind: 'topic' }>;
  lang: string;
  locale: string;
  dir: 'ltr' | 'rtl';
  explain: string;
}) {
  const { t } = useCsLocale();
  const { topic, own, navLocale, topics: summaries } = data;
  // The language the page body is written in: not the reader's when English stands in.
  const bodyLocale = own ? explain : FALLBACK_EXPLAIN_LOCALE;
  // Read off the page's own tables, so the deck can never drift from what is shown.
  const cards = useMemo(() => vocabCards(topic), [topic]);
  const related = topic.related
    .map((s) => summaries.find((x) => x.slug === s))
    .filter((x): x is (typeof summaries)[number] => Boolean(x));

  return (
    <div dir={dir}>
      <section className="border-b border-border pb-6 sm:pb-4">
        <div className="flex items-center justify-between gap-3">
          <Link to={csPath(lang)} className={BACK_LINK}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            {t('landing.eyebrow')}
          </Link>
          <div className="flex items-center gap-2">
            <div className="sm:hidden">
              <CheatsheetSearch
                variant="icon"
                topics={summaries}
                lang={lang}
                locale={locale}
                contentLocale={navLocale}
              />
            </div>
            <CheatsheetBrowser
              variant="drawer"
              topics={summaries}
              lang={lang}
              locale={locale}
              activeSlug={topic.slug}
            />
          </div>
        </div>

        <header
          dir={dirFor(bodyLocale)}
          lang={bodyLocale === locale ? undefined : bodyLocale}
          className="mt-4 max-w-3xl sm:mt-6"
        >
          <h1 className="text-[1.75rem] font-extrabold leading-tight text-foreground sm:text-4xl">
            {topic.title}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {topic.subtitle && <span>{topic.subtitle}</span>}
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.6875rem] font-semibold leading-none text-primary">
              {topic.level}
            </span>
          </p>
        </header>

        <div className="mt-6 hidden max-w-xl sm:block">
          <CheatsheetSearch
            topics={summaries}
            lang={lang}
            locale={locale}
            contentLocale={navLocale}
          />
        </div>
      </section>

      <div className="pb-10 pt-5 sm:pt-8">
        <div className={PAGE_GRID}>
          <CheatsheetBrowser
            variant="rail"
            topics={summaries}
            lang={lang}
            locale={locale}
            activeSlug={topic.slug}
          />

          <article className="min-w-0">
            <div dir={dirFor(bodyLocale)} lang={bodyLocale === locale ? undefined : bodyLocale}>
              <VocabToDeck cards={cards} title={topic.title} lang={lang} />
              <CheatsheetSectionNav dir={dirFor(bodyLocale)} />
              <ScrollToMatch ready={topic.slug} />
              <CheatsheetMarkdown
                body={topic.body}
                lang={lang}
                codeOnly={sameScript(lang, bodyLocale)}
              />
            </div>
            <CheatsheetRelated topics={related} lang={lang} />
          </article>

          <aside className="hidden xl:block">
            <CheatsheetToc dir={dirFor(bodyLocale)} />
          </aside>
        </div>
      </div>
    </div>
  );
}
