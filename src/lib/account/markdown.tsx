import { Fragment, type ReactNode } from 'react';

/**
 * A small, safe Markdown renderer for community topics and comments: headings, bold,
 * italic, inline code, code blocks, links, quotes, bullet and numbered lists. It builds
 * React elements only (no HTML is ever injected), and only http(s) links are links.
 */

type Inline = ReactNode;

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function safeHref(href: string): string | null {
  return /^https?:\/\//i.test(href.trim()) ? href.trim() : null;
}

export function renderInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const key = `i${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={key}>{renderInline(tok.slice(2, -2))}</strong>);
    else if (tok.startsWith('`'))
      out.push(
        <code
          key={key}
          className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.85em] text-foreground"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(mm[2]);
      out.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent hover:underline"
          >
            {mm[1]}
          </a>
        ) : (
          mm[1]
        ),
      );
    } else out.push(<em key={key}>{renderInline(tok.slice(1, -1))}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^[-*]\s+/, ''));
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\d+\.\s+/, ''));
      blocks.push({ type: 'ol', items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|>|[-*]\s|\d+\.\s|```)/.test(lines[i])
    )
      para.push(lines[i++]);
    blocks.push({ type: 'p', text: para.join('\n') });
  }
  return blocks;
}

export function Markdown({ content, className = '' }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);
  return (
    <div
      dir="auto"
      className={`flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground ${className}`}
    >
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <p
                key={i}
                className={`font-extrabold text-foreground ${b.level === 1 ? 'text-xl' : b.level === 2 ? 'text-lg' : 'text-base'}`}
              >
                {renderInline(b.text)}
              </p>
            );
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs text-foreground"
              >
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="rounded-e-lg border-s-4 border-accent/40 bg-muted px-3 py-2 italic"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={i} className="list-disc ps-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="list-decimal ps-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i} className="whitespace-pre-line">
                {b.text.split('\n').map((l, j, arr) => (
                  <Fragment key={j}>
                    {renderInline(l)}
                    {j < arr.length - 1 ? '\n' : null}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
