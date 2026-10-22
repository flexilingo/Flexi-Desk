import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { FALLBACK_EXPLAIN_LOCALE } from '../lib/types';
import { cheatsheet } from '../lib/service';
import { useResource } from '../lib/useResource';
import { BACK_LINK } from '../ui';
import VerbIndex from './VerbIndex';
import CheatsheetComingSoon from './CheatsheetComingSoon';
import { ResourceGate, csPath, useCsLocale, useExplainLocale } from './shared';

/**
 * Every verb the cheatsheet conjugates. A locale whose verbs are not glossed yet
 * reads the English meanings until its own are published; the verbs with no
 * meaning at all are listed after them by name.
 */
export default function VerbIndexScreen({ lang }: { lang: string }) {
  const { t, dir } = useCsLocale();
  const explain = useExplainLocale();

  const resource = useResource(async () => {
    const own = (await cheatsheet.getVerbList(lang, explain))?.data ?? [];
    const verbLocale =
      own.length || explain === FALLBACK_EXPLAIN_LOCALE ? explain : FALLBACK_EXPLAIN_LOCALE;
    const verbs =
      verbLocale === explain ? own : ((await cheatsheet.getVerbList(lang, verbLocale))?.data ?? []);
    if (verbs.length === 0)
      return {
        verbs,
        more: [] as string[],
        available: (await cheatsheet.getCoverage(lang)).map((c) => c.locale),
      };
    // Every other verb we conjugate, by lemma alone. If this call fails the page still lists the glossed ones.
    const glossed = new Set(verbs.map((v) => v.lemma));
    const all = await cheatsheet
      .getVerbList(lang, verbLocale, true)
      .then((r) => r?.data ?? [])
      .catch(() => []);
    return {
      verbs,
      more: all.map((v) => v.lemma).filter((l) => !glossed.has(l)),
      available: [] as string[],
    };
  }, [lang, explain]);

  return (
    <ResourceGate resource={resource}>
      {({ verbs, more, available }) =>
        verbs.length === 0 ? (
          <CheatsheetComingSoon lang={lang} availableIn={available} />
        ) : (
          <div dir={dir}>
            <section className="border-b border-border pb-6">
              <Link to={csPath(lang)} className={BACK_LINK}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                {t('landing.eyebrow')}
              </Link>
              <header className="mt-4 max-w-3xl sm:mt-6">
                <h1 className="text-[1.75rem] font-extrabold leading-tight text-foreground sm:text-4xl">
                  {t('verbs.title')}
                </h1>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {t('verbs.tagline', {
                    count: (verbs.length + more.length).toLocaleString(
                      explain === 'fa' ? 'fa-IR' : explain,
                    ),
                  })}
                </p>
              </header>
            </section>
            <div className="pb-10 pt-5 sm:pt-8">
              <VerbIndex verbs={verbs} more={more} lang={lang} locale={explain} />
            </div>
          </div>
        )
      }
    </ResourceGate>
  );
}
