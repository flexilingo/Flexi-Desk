import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { SpeakButton } from '@/components/lookup/SpeakButton';
import { sameScript } from '../lib/types';
import { indexWithFallback, verbLocaleFor } from '../lib/client';
import { cheatsheet } from '../lib/service';
import { useResource } from '../lib/useResource';
import { BACK_LINK, CARD, CARD_TITLE, LEVEL_PILL } from '../ui';
import { InlineMarkdown, TargetLine } from './CheatsheetMarkdown';
import CheatsheetSearch from './CheatsheetSearch';
import CheatsheetComingSoon from './CheatsheetComingSoon';
import CardRows from './CardRows';
import Ticks from './Ticks';
import VerbConjugation from './VerbConjugation';
import VerbLemma from './VerbLemma';
import VerbPatternTree from './VerbPatternTree';
import { ResourceGate, csPath, useCsLocale, useExplainLocale } from './shared';

/**
 * One verb: its meaning, the pattern map, every tense, examples and tips. A verb
 * the catalogue lacks is a 404 (a made-up URL) unless the whole language has no
 * verbs yet.
 */
export default function VerbScreen({ lang }: { lang: string }) {
  const { verb = '' } = useParams();
  const { t, i18n, locale, dir } = useCsLocale();
  const explain = useExplainLocale();

  const resource = useResource(async () => {
    const verbLocale = await verbLocaleFor(cheatsheet, lang, explain);
    const entry =
      (await cheatsheet.getVerb(lang, verbLocale, decodeURIComponent(verb)))?.data ?? null;
    if (!entry) {
      const none = ((await cheatsheet.getVerbList(lang, verbLocale))?.data.length ?? 0) === 0;
      return {
        entry: null,
        verbLocale,
        topics: [],
        navLocale: verbLocale,
        available: none ? (await cheatsheet.getCoverage(lang)).map((c) => c.locale) : null,
      };
    }
    const nav = await indexWithFallback(cheatsheet, lang, explain);
    return {
      entry,
      verbLocale,
      topics: nav.data,
      navLocale: nav.locale,
      available: null as string[] | null,
    };
  }, [lang, explain, verb]);

  return (
    <ResourceGate resource={resource}>
      {({ entry, verbLocale, topics, navLocale, available }) => {
        if (!entry) {
          return available ? (
            <CheatsheetComingSoon lang={lang} availableIn={available} />
          ) : (
            <div className="mx-auto max-w-xl py-16 text-center text-muted-foreground">
              <p className="mb-4">{t('errors.verbNotFound')}</p>
              <Link to={csPath(lang, 'verbes')} className={BACK_LINK}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                {t('verbs.allVerbs')}
              </Link>
            </div>
          );
        }
        const codeOnly = sameScript(lang, verbLocale);
        // The family is stored as a key so it can be labelled per language.
        const familyKey = `verbs.families.${entry.family}`;
        const familyLabel = i18n.exists(`cheatsheet:${familyKey}`) ? t(familyKey) : '';
        const note =
          entry.examples.length || entry.complement.length || entry.tips.length ? entry : null;
        // Keys, not prose: 'direct' and 'prep:à' are facts about French, stored once and
        // read out of this locale's messages (`nsSeparator: false`: the key holds a colon).
        const complementLabel = entry.complement
          .map((k) =>
            i18n.exists(`cheatsheet:verbs.complements.${k}`)
              ? t(`verbs.complements.${k}`, { nsSeparator: false })
              : k,
          )
          .join(' · ');

        return (
          <div dir={dir}>
            <section className="border-b border-border pb-6">
              <div className="flex items-center justify-between gap-3">
                <Link to={csPath(lang, 'verbes')} className={BACK_LINK}>
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  {t('verbs.allVerbs')}
                </Link>
                <div className="sm:hidden">
                  <CheatsheetSearch
                    variant="icon"
                    topics={topics}
                    lang={lang}
                    locale={locale}
                    contentLocale={navLocale}
                  />
                </div>
              </div>

              <header className="mt-4 max-w-3xl sm:mt-6">
                <div className="flex w-fit items-center gap-3">
                  <h1
                    className="text-[1.75rem] font-extrabold leading-tight text-foreground sm:text-4xl"
                    dir="ltr"
                  >
                    <VerbLemma lemma={entry.lemma} />
                  </h1>
                  <SpeakButton
                    text={entry.lemma}
                    lang={lang}
                    title={entry.lemma}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/85"
                    iconClassName="h-5 w-5"
                  />
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {entry.ipa && (
                    <span className="font-mono text-[0.9375rem] text-caption" dir="ltr">
                      {entry.ipa}
                    </span>
                  )}
                  {entry.gloss && <span>{entry.gloss}</span>}
                  {entry.level && <span className={LEVEL_PILL}>{entry.level}</span>}
                </p>

                {(familyLabel || note) && (
                  <dl className="mt-3 space-y-1 text-[0.9375rem]">
                    {familyLabel && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-semibold text-primary">{t('verbs.family')}</dt>
                        <dd className="text-foreground">
                          <Ticks text={familyLabel} />
                        </dd>
                      </div>
                    )}
                    {note && complementLabel && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-semibold text-primary">
                          {t('verbs.complement')}
                        </dt>
                        <dd className="text-foreground">
                          <span className="font-semibold">
                            <Ticks text={complementLabel} />
                          </span>
                          {note.complement_note && (
                            <span className="text-muted-foreground">
                              {' '}
                              — <Ticks text={note.complement_note} />
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </header>

              <div className="mt-6 hidden max-w-xl sm:block">
                <CheatsheetSearch
                  topics={topics}
                  lang={lang}
                  locale={locale}
                  contentLocale={navLocale}
                />
              </div>
            </section>

            <div className="space-y-3 pb-10 pt-5 sm:space-y-4 sm:pt-8">
              {/* The map first, then the tables: what to remember, then every form. */}
              <VerbPatternTree verb={entry} lang={lang} locale={verbLocale} />
              <VerbConjugation verb={entry} lang={lang} locale={verbLocale} />

              {note && note.examples.length > 0 && (
                <section className={CARD}>
                  <h2 className={`${CARD_TITLE} px-4 pb-2 pt-5 sm:px-6`}>{t('verbs.examples')}</h2>
                  <CardRows
                    rows={note.examples.map((e, i) => (
                      <li key={i} className="px-4 py-3 sm:grid sm:grid-cols-2 sm:gap-6 sm:px-6">
                        <div dir="ltr">
                          <div className="text-[0.9375rem] leading-[1.6] sm:text-base">
                            <TargetLine text={e.fr} lang={lang} />
                          </div>
                          {e.ipa && (
                            <span className="block text-[0.8125rem] text-caption">{e.ipa}</span>
                          )}
                        </div>
                        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground sm:mt-0">
                          {e.gloss}
                        </p>
                      </li>
                    ))}
                  />
                </section>
              )}

              {note?.collocations && note.collocations.length > 0 && (
                <section className={CARD}>
                  <h2 className={`${CARD_TITLE} px-4 pb-2 pt-5 sm:px-6`}>
                    {t('verbs.collocations')}
                  </h2>
                  <CardRows
                    rows={note.collocations.map((c, i) => (
                      <li key={i} className="px-4 py-3 sm:grid sm:grid-cols-2 sm:gap-6 sm:px-6">
                        <div dir="ltr" className="text-[0.9375rem] leading-[1.6] sm:text-base">
                          <TargetLine text={c.fr} lang={lang} />
                        </div>
                        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground sm:mt-0">
                          {c.gloss}
                        </p>
                      </li>
                    ))}
                  />
                </section>
              )}

              {note?.tips && note.tips.length > 0 && (
                <section className={CARD}>
                  <h2 className={`${CARD_TITLE} px-4 pb-2 pt-5 sm:px-6`}>{t('verbs.tips')}</h2>
                  <CardRows
                    rows={note.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="px-4 py-3 text-[0.9375rem] leading-[1.6] sm:px-6 sm:text-base"
                      >
                        <InlineMarkdown text={tip} lang={lang} codeOnly={codeOnly} />
                      </li>
                    ))}
                  />
                </section>
              )}
            </div>
          </div>
        );
      }}
    </ResourceGate>
  );
}
