import { Fragment } from 'react';
import { TargetPhrase } from '@/pages/cheatsheet/components/CheatsheetMarkdown';
import { splitTargetRuns } from '@/pages/cheatsheet/lib/targetRuns';

/**
 * Explanations are written in the learner's language, with the practised language
 * inside them. In a language written in another script (Persian, Arabic, Chinese...)
 * the Latin runs ARE the practised language: they open the word dialog and can be
 * heard. In a language that shares the script (English, French...) every word would
 * look like a run, so there only the author's own marks decide — prose stays plain.
 */
export const latinProse = (locale: string) => !['fa', 'ar', 'zh', 'hi'].includes(locale);

/** A string that is entirely in the practised language: tappable, one voice for all of it. */
export function TargetText({
  text,
  lang,
  className,
}: {
  text: string;
  lang: string;
  className?: string;
}) {
  return <TargetPhrase text={text} lang={lang} className={className} />;
}

/** Prose with the practised language inside it. Plain when the prose shares the script. */
export function Prose({ text, lang, locale }: { text: string; lang: string; locale: string }) {
  if (latinProse(locale)) return <>{text}</>;
  return (
    <>
      {splitTargetRuns(text).map((s, i) =>
        s.target ? (
          <TargetPhrase key={i} text={s.text} lang={lang} />
        ) : s.ipa ? (
          <span key={i} dir="ltr" className="whitespace-nowrap text-[0.86em] text-caption">
            {s.text}
          </span>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
