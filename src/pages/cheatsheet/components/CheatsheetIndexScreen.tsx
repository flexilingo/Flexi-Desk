import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Layers, Repeat, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCount, splitTitle, type TopicSummary } from '../lib/types';
import { indexWithFallback } from '../lib/client';
import { cheatsheet } from '../lib/service';
import { useResource } from '../lib/useResource';
import { CARD, CARD_TITLE, LEVEL_PILL } from '../ui';
import CheatsheetBrowser from './CheatsheetBrowser';
import CheatsheetSearch from './CheatsheetSearch';
import CheatsheetComingSoon from './CheatsheetComingSoon';
import OfflineCard from './OfflineCard';
import { ResourceGate, csPath, useCsLocale, useExplainLocale } from './shared';

/**
 * Hand-picked entry points: the pages that answer the questions a learner actually
 * gets stuck on, a better first impression than an alphabetical wall of links.
 */
const START_HERE = [
  'faux-amis',
  'avoir-expressions',
  'passe-compose-avoir',
  'pronoms-cod',
  'subjonctif-declencheurs',
  'nombres',
] as const;
const EXAM_PICKS = ['consignes-examen', 'mots-frequents-oral', 'chiffres-a-loreille'] as const;

/**
 * The cheatsheet's front page: the pitch, the search, the hand-picked lists and the
 * whole index. A locale not yet translated reads the English version in its own chrome.
 */
export default function CheatsheetIndexScreen({ lang }: { lang: string }) {
  const { t, locale, dir } = useCsLocale();
  const explain = useExplainLocale();
  const index = useResource(() => indexWithFallback(cheatsheet, lang, explain), [lang, explain]);
  const stats = useResource(
    async () => (await cheatsheet.getStats(lang, index.data?.locale ?? explain)) ?? undefined,
    [lang, index.data?.locale, explain],
  );
  const coverage = useResource(() => cheatsheet.getCoverage(lang), [lang]);

  return (
    <ResourceGate resource={index}>
      {({ locale: contentLocale, data: topics }) => {
        if (topics.length === 0) {
          return (
            <CheatsheetComingSoon
              lang={lang}
              availableIn={(coverage.data ?? []).map((c) => c.locale)}
            />
          );
        }
        const byId = new Map(topics.map((x) => [x.slug, x]));
        const pick = (slugs: readonly string[]) =>
          slugs.map((s) => byId.get(s)).filter((x): x is TopicSummary => Boolean(x));
        const fa = (n: number) => formatCount(n, locale);
        const figures = [
          { value: topics.length, label: t('landing.statTopics') },
          ...(stats.data
            ? [
                { value: stats.data.verbs, label: t('landing.statVerbs') },
                { value: stats.data.examples, label: t('landing.statExamples') },
              ]
            : []),
        ];
        return (
          <div dir={dir}>
            <section className="border-b border-border pb-6 pt-1 sm:pb-8">
              <p className="mb-3 text-sm font-bold tracking-wide text-accent">
                {t('landing.eyebrow')}
              </p>
              <h1 className="max-w-3xl text-[1.75rem] font-extrabold leading-tight text-foreground sm:text-4xl">
                {t('landing.h1')}
              </h1>
              <dl className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-caption sm:text-[0.9375rem]">
                {figures.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-baseline gap-1 after:ms-1 after:text-border after:content-['·']"
                  >
                    <dt className="font-semibold text-foreground">{fa(s.value)}</dt>
                    <dd>{s.label}</dd>
                  </div>
                ))}
                <div>
                  <dt className="font-semibold text-primary">{t('landing.statFree')}</dt>
                </div>
              </dl>
              {contentLocale !== locale && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t('landing.leadFallback')}
                </p>
              )}
              <div className="mt-5 max-w-xl sm:mt-6">
                <CheatsheetSearch
                  topics={topics}
                  lang={lang}
                  locale={locale}
                  contentLocale={contentLocale}
                />
              </div>
              <div className="-mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                <Button variant="accent" asChild>
                  <a
                    href="#topics"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById('topics')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {t('landing.cta')}
                    <ArrowRight className="rtl:rotate-180" />
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={csPath(lang, 'verbes')}>
                    <Repeat />
                    {t('landing.ctaVerbs')}
                  </Link>
                </Button>
              </div>
            </section>

            <div className="space-y-3 pb-10 pt-5 sm:space-y-4 sm:pt-8">
              <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                <PickList title={t('landing.popularTitle')} topics={pick(START_HERE)} lang={lang} />
                <PickList title={t('landing.examTitle')} topics={pick(EXAM_PICKS)} lang={lang} />
              </div>

              <h2
                id="topics"
                className={`${CARD_TITLE} scroll-mt-4 pt-5 sm:pt-6 sm:text-[1.375rem]`}
              >
                {t('landing.browseAll', { count: fa(topics.length) })}
              </h2>
              <CheatsheetBrowser variant="index" topics={topics} lang={lang} locale={locale} />

              <OfflineCard lang={lang} locale={contentLocale} />

              <div className={`${CARD} grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0`}>
                {[
                  { Icon: Volume2, title: t('title'), body: t('tagline') },
                  { Icon: Layers, title: t('landing.deckTitle'), body: t('landing.deckNote') },
                ].map(({ Icon, title, body }, i) => (
                  <div
                    key={title}
                    className={`flex gap-3 px-4 py-4 sm:px-6 sm:py-5 ${i ? 'sm:border-s sm:border-border' : ''}`}
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground">{title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                        {body}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }}
    </ResourceGate>
  );
}

/** A short hand-picked list: one card, a row per topic. */
function PickList({
  title,
  topics,
  lang,
}: {
  title: string;
  topics: TopicSummary[];
  lang: string;
}) {
  if (!topics.length) return null;
  return (
    <section className={CARD}>
      <h2 className={`${CARD_TITLE} px-4 pb-3 pt-5 sm:px-6`}>{title}</h2>
      <ul className="divide-y divide-border border-t border-border">
        {topics.map((x) => {
          const { lead, tail } = splitTitle(x.title);
          return (
            <li key={x.slug}>
              <Link
                to={csPath(lang, x.slug)}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-foreground">
                    {lead}
                  </span>
                  {(tail || x.subtitle) && (
                    <span className="block truncate text-[0.8125rem] text-caption">
                      {tail || x.subtitle}
                    </span>
                  )}
                </span>
                {x.level && <span className={LEVEL_PILL}>{x.level}</span>}
                <ChevronRight className="h-4 w-4 shrink-0 text-caption rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
