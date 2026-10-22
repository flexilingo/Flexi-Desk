import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Braces,
  ChevronDown,
  Lightbulb,
  ListTree,
  ScrollText,
  Shuffle,
  SpellCheck,
  Table2,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CheatsheetMarkdown } from '@/pages/cheatsheet/components/CheatsheetMarkdown';
import { cn } from '@/lib/utils';
import { RULE_KIND_ORDER, type PracticeSentence, type Rule, type Token } from '../lib/types';
import { useLabel } from './labels';
import { SentenceText } from './SentenceText';
import { latinProse, Prose, TargetText } from './TargetText';

/**
 * Everything we know about one sentence, shown after the learner has committed to
 * an answer.
 *
 * The order is the order the questions occur to someone looking at a sentence they
 * just got wrong: what shape is this? what is each word doing? why is the verb that
 * form? why is it spelled like that? and only then the rules behind it, in full.
 *
 * Colour: the panel is neutral throughout, and the accent means one thing only —
 * what French changed (the verb ending, the result of an élision, the letter
 * agreement added).
 */
export function SentenceAnalysis({
  sentence,
  rules,
  lang,
  locale,
  verbPages,
}: {
  sentence: PracticeSentence;
  rules: Rule[];
  lang: string;
  /** The language the explanations are written in. */
  locale: string;
  /** Lemmas that have a full conjugation page in the cheatsheet — a link that 404s is worse than none. */
  verbPages?: string[];
}) {
  const { t } = useTranslation('sentences');
  const byKey = new Map(rules.map((r) => [r.key, r]));

  // Every rule this card touches, from all three places one can appear: the sentence, a token, a mechanic.
  const keys = new Set<string>([
    ...(sentence.rule_keys ?? []),
    ...(sentence.analysis.tokens ?? []).flatMap((x) => x.rule_keys ?? []),
    ...(sentence.analysis.mechanics ?? []).flatMap((x) => x.rule_keys ?? []),
  ]);
  const used = [...keys]
    .map((k) => byKey.get(k))
    .filter((r): r is Rule => Boolean(r))
    .sort(
      (a, b) =>
        RULE_KIND_ORDER.indexOf(a.kind as never) - RULE_KIND_ORDER.indexOf(b.kind as never) ||
        a.title.localeCompare(b.title),
    );

  const verbs = (sentence.analysis.tokens ?? []).filter((x) => x.conjugation);
  const agreed = (sentence.analysis.tokens ?? []).filter((x) => x.agreement?.change);
  const beats = sentence.beats ?? [];

  return (
    <div className="space-y-3" data-testid="analysis">
      <Breakdown sentence={sentence} lang={lang} />
      {verbs.length > 0 && <Verbs tokens={verbs} lang={lang} verbPages={verbPages} />}
      {agreed.length > 0 && <Agreements tokens={agreed} lang={lang} />}
      {(sentence.analysis.mechanics ?? []).length > 0 && (
        <Mechanics sentence={sentence} lang={lang} />
      )}
      {beats.length > 0 && (
        <Section title={t('sections.notes')} icon={Lightbulb}>
          <ul className="divide-y divide-border">
            {beats.map((b, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <span
                  dir="ltr"
                  className="me-2 inline-block rounded-md bg-primary/10 px-2 py-0.5 text-base font-semibold text-primary"
                >
                  <TargetText text={b.for} lang={lang} />
                </span>
                <span className="text-base leading-8 text-muted-foreground">
                  <Prose text={b.text} lang={lang} locale={locale} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {used.length > 0 && (
        <Section title={t('sections.rules')} subtitle={t('sections.rulesHint')} icon={ScrollText}>
          <div className="space-y-2">
            {used.map((r) => (
              <RuleBlock key={r.key} rule={r} lang={lang} locale={locale} />
            ))}
          </div>
        </Section>
      )}
      {(sentence.analysis.variants ?? []).length > 1 && (
        <Variants sentence={sentence} lang={lang} />
      )}
    </div>
  );
}

/** One section of the breakdown: a card, with rows inside it separated by dividers — never boxes in boxes. */
function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold leading-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-caption">{subtitle}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const CHIP = 'rounded-full bg-primary/10 px-2 py-0.5 text-sm text-primary';

/**
 * The sentence, taken apart — pattern and words in one section. `is_chunk` is why
 * these are UNITS and not words: `est-ce que` is three written words, one question
 * marker and zero meaning.
 */
function Breakdown({ sentence, lang }: { sentence: PracticeSentence; lang: string }) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  const structure = sentence.analysis.structure;

  return (
    <Section title={t('sections.breakdown')} icon={ListTree}>
      {structure && (
        <div className="mb-3 rounded-md border border-border bg-muted px-3 py-2">
          <span className="block text-sm text-caption">{t('sections.pattern')}</span>
          <span
            dir="ltr"
            className="mt-1 block text-left font-mono text-base font-medium tracking-wide text-foreground"
          >
            {structure.pattern}
          </span>
        </div>
      )}
      <ul className="divide-y divide-border">
        {(sentence.analysis.tokens ?? []).map((tok, i) => (
          <li
            key={i}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
          >
            <span dir="ltr" className="min-w-0 sm:w-[38%]">
              <span className="text-lg font-semibold text-foreground">
                <TargetText text={tok.surface} lang={lang} />
              </span>
              {tok.is_chunk && <span className={cn('ms-1.5', CHIP)}>{t('chunk')}</span>}
              {tok.contrast?.length ? (
                <span className="ms-1.5 text-base text-caption">≠ {tok.contrast.join(' · ')}</span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 text-base text-muted-foreground">
              {sentence.token_glosses?.[tok.surface] || '—'}
            </span>
            <span className="text-sm text-caption">{label('roles', tok.role)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * The verb panel — the one part a conjugation table cannot replace. A table tells
 * you what `habite` is; this tells you where it came from: `habiter` minus `-er` plus
 * `-e`, because the subject is `il`. For an irregular verb there is no split to show
 * and the panel says so rather than inventing one.
 */
function Verbs({
  tokens,
  lang,
  verbPages,
}: {
  tokens: Token[];
  lang: string;
  verbPages?: string[];
}) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  const pages = new Set(verbPages ?? []);
  /** The cheatsheet indexes verbs by their bare infinitive: `se lever` is filed as `lever`. */
  const pageFor = (lemma: string) => {
    if (pages.has(lemma)) return lemma;
    const bare = lemma.replace(/^s[e']\s*/, '');
    return pages.has(bare) ? bare : null;
  };
  return (
    <Section title={t('sections.verb')} icon={Zap}>
      <ul className="divide-y divide-border">
        {tokens.map((tok, i) => {
          const c = tok.conjugation!;
          const page = pageFor(c.infinitive);
          return (
            <li key={i} className="py-4 first:pt-0 last:pb-0">
              <div dir="ltr" className="flex flex-wrap items-baseline gap-2">
                <span className="text-xl font-extrabold text-foreground">
                  <TargetText text={tok.surface} lang={lang} />
                </span>
                <span className="text-caption">←</span>
                <span className="text-base text-muted-foreground">
                  <TargetText text={c.infinitive} lang={lang} />
                </span>
                <span className={CHIP}>{label('families', c.family)}</span>
              </div>

              {c.stem && c.ending ? (
                <p
                  dir="ltr"
                  className="mt-2.5 rounded-md border border-border bg-muted p-2.5 text-lg font-semibold text-foreground"
                >
                  <span className="text-caption">
                    <TargetText text={c.infinitive} lang={lang} />
                  </span>
                  {' → '}
                  <span>{c.stem}</span>
                  {' + '}
                  <span className="font-bold text-accent">{c.ending}</span>
                  {' → '}
                  {/* With a compound tense the line ends at the PARTICIPLE, not at the whole verb. */}
                  <span className="font-bold">
                    <TargetText text={c.participle ?? tok.surface} lang={lang} />
                  </span>
                </p>
              ) : (
                <p className="mt-2.5 text-base leading-7 text-muted-foreground">
                  {t('verb.noStem')}
                </p>
              )}

              <dl className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-base">
                <Fact label={t('verb.mood')} value={label('moods', c.mood)} />
                {c.tense && <Fact label={t('verb.tense')} value={label('tenses', c.tense)} />}
                {c.person && <Fact label={t('verb.person')} value={label('persons', c.person)} />}
                {c.auxiliary && <Fact label={t('verb.auxiliary')} value={c.auxiliary} ltr />}
                {c.agrees_with && <Fact label={t('verb.agreesWith')} value={c.agrees_with} ltr />}
              </dl>

              {c.note_key && (
                <p className="mt-3 border-s-2 border-border ps-3 text-base leading-7 text-muted-foreground">
                  {label('verbNotes', c.note_key)}
                </p>
              )}

              {page && (
                <Link
                  to={`/cheatsheet/${lang}/verbes/${page}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/10"
                >
                  <Table2 className="h-4 w-4" />
                  {t('verb.conjugationTable', { verb: c.infinitive })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Why a word is feminine or plural. `because` names the word that caused it; `audible` says most agreement is silent. */
function Agreements({ tokens, lang }: { tokens: Token[]; lang: string }) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  return (
    <Section title={t('sections.agreement')} icon={Braces}>
      <ul className="divide-y divide-border">
        {tokens.map((tok, i) => {
          const a = tok.agreement!;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2.5 py-3 first:pt-0 last:pb-0">
              <span
                dir="ltr"
                className="rounded-md border border-border bg-muted px-2.5 py-1 text-lg font-semibold text-accent"
              >
                <TargetText text={a.change ?? ''} lang={lang} />
              </span>
              <span className="text-base text-muted-foreground">
                {t('agreementBecause', {
                  form: label('genders', `${a.gender ?? 'm'}${a.number === 'pl' ? '_pl' : ''}`),
                  because: a.because ?? '',
                })}
              </span>
              <span className={CHIP}>
                {a.audible ? t('agreementAudible') : t('agreementSilent')}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** élision, contraction, liaison — the mechanical changes to the written form. */
function Mechanics({ sentence, lang }: { sentence: PracticeSentence; lang: string }) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  return (
    <Section title={t('sections.mechanics')} icon={SpellCheck}>
      <ul className="divide-y divide-border">
        {(sentence.analysis.mechanics ?? []).map((m, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2.5 py-3 first:pt-0 last:pb-0">
            <span className={CHIP}>{label('mechanics', m.type)}</span>
            <span
              dir="ltr"
              className="rounded-md border border-border bg-muted px-2.5 py-1 text-lg font-semibold text-foreground"
            >
              <TargetText text={m.from} lang={lang} /> <span className="text-caption">→</span>{' '}
              <span className="font-bold text-accent">
                <TargetText text={m.to} lang={lang} />
              </span>
            </span>
            {m.trigger && (
              <span dir="ltr" className="text-sm text-caption">
                ({m.trigger})
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * One rule — closed, but complete once opened. The header is a real answer on its
 * own (title plus the one-line version), so six of them read in six seconds and you
 * open the one that surprised you. A disclosure row is as wide as the summary it
 * shows; the "buttons never stretch" rule is about actions competing for a row.
 */
function RuleBlock({ rule, lang, locale }: { rule: Rule; lang: string; locale: string }) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        open ? 'border-primary/40 bg-muted' : 'border-border bg-muted/50',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-start gap-2.5 p-3.5 text-start transition-colors hover:bg-muted"
      >
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            open ? 'bg-primary/20' : 'bg-primary/10',
          )}
        >
          <ChevronDown
            className={cn('h-4 w-4 text-primary transition-transform', open && 'rotate-180')}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-extrabold text-foreground">{rule.title}</span>
            <span className={CHIP}>{label('kinds', rule.kind)}</span>
          </span>
          <span className="mt-1.5 block text-base leading-7 text-muted-foreground">
            {rule.summary}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3.5">
          <CheatsheetMarkdown body={rule.body} lang={lang} codeOnly={latinProse(locale)} />

          {rule.examples?.length > 0 && (
            <ul className="mt-3 divide-y divide-border border-t border-border pt-1">
              {rule.examples.map((ex, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2.5 py-2 text-base">
                  <span dir="ltr" className="font-semibold text-foreground">
                    <SentenceText text={ex.fr} lang={lang} />
                  </span>
                  <span className="text-muted-foreground">{ex.gloss}</span>
                </li>
              ))}
            </ul>
          )}

          {rule.cheatsheet_slug && (
            <Link
              to={`/cheatsheet/${lang}/${rule.cheatsheet_slug}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/10"
            >
              <BookOpen className="h-4 w-4" />
              {t('readMore')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The same meaning at the other registers. For French questions this is not
 * decoration: `Où il habite ?`, `Où est-ce qu'il habite ?` and `Où habite-t-il ?` are
 * one meaning and three social situations. The row the card asked for is marked.
 */
function Variants({ sentence, lang }: { sentence: PracticeSentence; lang: string }) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  return (
    <Section title={t('sections.registers')} subtitle={t('sections.registersHint')} icon={Shuffle}>
      <ul className="divide-y divide-border">
        {(sentence.analysis.variants ?? []).map((v, i) => {
          const isThisCard = v.text === sentence.text;
          return (
            <li key={i} className="flex flex-wrap items-center gap-2.5 py-3 first:pt-0 last:pb-0">
              {isThisCard && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              )}
              <span className={CHIP}>{label('registers', v.register)}</span>
              <span
                dir="ltr"
                className={
                  isThisCard
                    ? 'text-lg font-semibold text-foreground'
                    : 'text-lg text-muted-foreground'
                }
              >
                <SentenceText text={v.text} lang={lang} />
              </span>
              {v.channel && v.channel !== 'both' && (
                <span className="text-sm text-caption">{label('channels', v.channel)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** `label: value`, side by side — one short fact, on one line. */
function Fact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <dt className="text-caption">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className="font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
