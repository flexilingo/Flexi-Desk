import { useRef, useState } from 'react';
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/lib/account/markdown';
import { useAccountT } from '../components/AccountBits';

/**
 * Formatting buttons, not syntax lessons: people select a word and press Bold, as in
 * every editor they know. The text is stored as Markdown.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxLength = 5000,
  rows = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  const { t } = useAccountT();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (
    build: (
      sel: string,
      before: string,
      after: string,
    ) => { text: string; from: number; to: number },
  ) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const r = build(value.slice(s, e), value.slice(0, s), value.slice(e));
    if (r.text.length > maxLength) return;
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.from, r.to);
    });
  };
  const wrap = (m: string, sample: string) =>
    apply((sel, b, a) => {
      const body = sel || sample;
      return {
        text: b + m + body + m + a,
        from: b.length + m.length,
        to: b.length + m.length + body.length,
      };
    });
  const prefix = (p: (i: number) => string) =>
    apply((sel, b, a) => {
      const lineStart = b.lastIndexOf('\n') + 1;
      const head = b.slice(0, lineStart);
      const block = b.slice(lineStart) + sel + a.split('\n')[0];
      const rest = a.slice(a.split('\n')[0].length);
      const out = block
        .split('\n')
        .map((l, i) => p(i) + l)
        .join('\n');
      return { text: head + out + rest, from: head.length, to: head.length + out.length };
    });
  const link = () =>
    apply((sel, b, a) => {
      const label = sel || t('community.toolbar.linkText');
      const text = `${b}[${label}](https://)${a}`;
      const at = b.length + label.length + 3 + 8;
      return { text, from: at, to: at };
    });

  const tools = [
    { k: 'bold', Icon: Bold, run: () => wrap('**', t('community.toolbar.boldText')) },
    { k: 'italic', Icon: Italic, run: () => wrap('*', t('community.toolbar.italicText')) },
    { k: 'heading', Icon: Heading2, run: () => prefix(() => '## ') },
    { k: 'bulletList', Icon: List, run: () => prefix(() => '- ') },
    { k: 'numberedList', Icon: ListOrdered, run: () => prefix((i) => `${i + 1}. `) },
    { k: 'quote', Icon: Quote, run: () => prefix(() => '> ') },
    { k: 'code', Icon: Code, run: () => wrap('`', t('community.toolbar.codeText')) },
    { k: 'link', Icon: Link2, run: link },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {(['write', 'preview'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === k ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
            >
              {t(`community.${k}`)}
            </button>
          ))}
        </div>
        {tab === 'write' && (
          <div className="flex flex-wrap gap-0.5">
            {tools.map(({ k, Icon, run }) => (
              <Button
                key={k}
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={run}
                aria-label={t(`community.toolbar.${k}`)}
                title={t(`community.toolbar.${k}`)}
              >
                <Icon />
              </Button>
            ))}
          </div>
        )}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          dir="auto"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      ) : (
        <div className="min-h-[8rem] rounded-md border border-input bg-card px-3 py-2">
          {value.trim() ? (
            <Markdown content={value} />
          ) : (
            <p className="text-sm text-caption">{t('community.nothingToPreview')}</p>
          )}
        </div>
      )}
      <p className="text-[11px] text-caption">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
