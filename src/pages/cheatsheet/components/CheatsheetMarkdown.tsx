import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLookup } from '@/components/lookup/lookup-context';
import { SpeakButton } from '@/components/lookup/SpeakButton';
import { cleanWord, tokenize } from '@/components/lookup/tokenize';
import { cn } from '@/lib/utils';
import { parseBlocks, parseInline, sectionise, type Block, type Inline } from '../lib/markdown';
import { splitTargetRuns } from '../lib/targetRuns';

/**
 * A page body, rendered so that every scrap of the target language in it can be
 * tapped (opens the word dialog) and heard (one play button per phrase).
 *
 * What counts as target language follows the website: text in backticks always;
 * and, when the page is explained in a language written in another script
 * (Persian, Arabic, Chinese…), every Latin run too. When the explanation shares
 * the target's script (English explaining French) only the backticks are trusted,
 * or every English word would grow a play button.
 */

type Ctx = { lang: string; codeOnly: boolean };

const IPA_CLASS = 'whitespace-nowrap font-normal text-[0.86em] text-caption';

/** One target-language phrase: its words open the dialog, one button reads it. */
export function TargetPhrase({
  text,
  lang,
  className,
}: {
  text: string;
  lang: string;
  className?: string;
}) {
  const lookup = useLookup();
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <bdi className={cn('[unicode-bidi:isolate]', className)} dir="ltr" lang={lang}>
      {tokens.map((tok, i) =>
        tok.word && lookup ? (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => lookup(cleanWord(tok.text), text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                lookup(cleanWord(tok.text), text);
              }
            }}
            className="cursor-pointer rounded-[4px] transition-colors hover:bg-accent/15 hover:text-accent"
          >
            {tok.text}
          </span>
        ) : (
          <Fragment key={i}>{tok.text}</Fragment>
        ),
      )}
      <SpeakButton
        text={text}
        lang={lang}
        title={text}
        className="ms-1 inline-flex h-5 w-5 translate-y-[3px] items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-accent/10 hover:text-accent"
        iconClassName="h-3 w-3"
      />
    </bdi>
  );
}

function PlainText({ text, ctx }: { text: string; ctx: Ctx }) {
  // Transcriptions are always styled; Latin runs are phrases only when the script differs.
  const segments = useMemo(() => splitTargetRuns(text), [text]);
  return (
    <>
      {segments.map((s, i) =>
        s.ipa ? (
          <span key={i} className={IPA_CLASS} dir="ltr">
            {s.text}
          </span>
        ) : s.target && !ctx.codeOnly ? (
          <TargetPhrase key={i} text={s.text} lang={ctx.lang} />
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

export function InlineNodes({ nodes, ctx }: { nodes: Inline[]; ctx: Ctx }): ReactNode {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.k) {
          case 'text':
            return <PlainText key={i} text={n.text} ctx={ctx} />;
          case 'code': {
            // A backticked transcription is a transcription, not a phrase.
            const t = n.text.trim();
            if (/^\/[^/]+\/$/.test(t))
              return (
                <span key={i} className={IPA_CLASS} dir="ltr">
                  {t}
                </span>
              );
            return <TargetPhrase key={i} text={n.text} lang={ctx.lang} className="font-medium" />;
          }
          case 'br':
            return <br key={i} />;
          case 'strong':
            return (
              <strong key={i} className="font-semibold text-foreground">
                <InlineNodes nodes={n.children} ctx={ctx} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <InlineNodes nodes={n.children} ctx={ctx} />
              </em>
            );
          case 'del':
            return (
              <del key={i}>
                <InlineNodes nodes={n.children} ctx={ctx} />
              </del>
            );
          case 'mark':
            return (
              <mark key={i} className="rounded bg-warning/30 px-0.5 text-foreground">
                <InlineNodes nodes={n.children} ctx={ctx} />
              </mark>
            );
          case 'link': {
            const internal = /^(?:https?:\/\/[^/]+)?(\/cheatsheet\/[^\s]*)$/.exec(n.href);
            const body = <InlineNodes nodes={n.children} ctx={{ ...ctx, codeOnly: true }} />;
            return internal ? (
              <Link
                key={i}
                to={internal[1]}
                className="text-accent underline-offset-2 hover:underline"
              >
                {body}
              </Link>
            ) : (
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {body}
              </a>
            );
          }
        }
      })}
    </>
  );
}

const inline = (text: string, ctx: Ctx) => <InlineNodes nodes={parseInline(text)} ctx={ctx} />;

/** A cell listing several backticked examples gets one example per line (see rehypeReference). */
const splitExamples = (cell: string) =>
  (cell.match(/`/g) ?? []).length >= 4 && /\s+·\s+/.test(cell)
    ? cell.split(/\s+·\s+/).join('<br>')
    : cell;

function BlockView({ block, ctx }: { block: Block; ctx: Ctx }): ReactNode {
  switch (block.k) {
    case 'heading': {
      const cls =
        block.level <= 3
          ? 'mt-5 text-base font-bold text-foreground'
          : 'mt-4 text-[0.9375rem] font-semibold text-foreground';
      const Tag = (block.level <= 2 ? 'h3' : `h${Math.min(block.level, 6)}`) as 'h3';
      return <Tag className={cls}>{inline(block.text, ctx)}</Tag>;
    }
    case 'p':
      return (
        <p className="my-3 leading-[1.85] text-foreground/90">
          {inline(block.text.replace(/\n/g, ' '), ctx)}
        </p>
      );
    case 'quote':
      return (
        <blockquote className="my-4 border-s-[3px] border-accent/50 bg-muted/50 px-4 py-1 text-foreground/90 [&>p:first-child]:mt-3">
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} ctx={ctx} />
          ))}
        </blockquote>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={cn(
            'my-3 space-y-1.5 ps-6 leading-[1.8]',
            block.ordered ? 'list-decimal' : 'list-disc',
            'marker:text-caption',
          )}
        >
          {block.items.map((it, i) => (
            <li key={i}>
              {inline(it.text.replace(/\n/g, ' '), ctx)}
              {it.children.map((b, j) => (
                <BlockView key={j} block={b} ctx={ctx} />
              ))}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[0.9375rem]">
            <thead className="bg-muted/70">
              <tr>
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-border px-3 py-2 text-start align-bottom text-[0.8125rem] font-semibold text-muted-foreground"
                  >
                    {inline(h, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, r) => (
                <tr key={r} className="align-top">
                  {block.head.map((_, c) => (
                    <td key={c} className="px-3 py-2 leading-[1.7]">
                      {inline(splitExamples(row[c] ?? ''), ctx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'code':
      return (
        <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm" dir="ltr">
          {block.text}
        </pre>
      );
    case 'hr':
      return <hr className="my-5 border-border" />;
  }
}

export function CheatsheetMarkdown({
  body,
  lang,
  codeOnly,
  className,
}: {
  body: string;
  lang: string;
  /** True when the explanation is in the same script as the language taught. */
  codeOnly: boolean;
  className?: string;
}) {
  const { lead, sections } = useMemo(() => sectionise(parseBlocks(body)), [body]);
  const ctx: Ctx = { lang, codeOnly };
  return (
    <div className={cn('cheatsheet-body', className)}>
      {lead.map((b, i) => (
        <BlockView key={i} block={b} ctx={ctx} />
      ))}
      {sections.map((s) => (
        <section
          key={s.id}
          id={s.id}
          data-section={s.title}
          className="mb-3 scroll-mt-28 overflow-hidden rounded-[9px] border border-border bg-card px-4 pb-3 pt-4 sm:mb-4 sm:px-6"
        >
          <h2 className="text-[1.125rem] font-bold leading-snug tracking-[-0.01em] text-foreground rtl:tracking-normal sm:text-[1.375rem]">
            {inline(s.title, { ...ctx, codeOnly: true })}
          </h2>
          {s.blocks.map((b, i) => (
            <BlockView key={i} block={b} ctx={ctx} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** A short snippet of French (an example, a collocation) with the same tap/speak behaviour. */
export function TargetLine({ text, lang }: { text: string; lang: string }) {
  return <TargetPhrase text={text} lang={lang} />;
}

/** Markdown inline text (tips) rendered with the same rules. */
export function InlineMarkdown({
  text,
  lang,
  codeOnly,
}: {
  text: string;
  lang: string;
  codeOnly: boolean;
}) {
  return inline(text, { lang, codeOnly });
}
