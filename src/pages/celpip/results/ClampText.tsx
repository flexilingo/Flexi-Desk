import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

// Literal classes — the content scanner needs them whole.
const CLAMP = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
} as const;

interface ClampTextProps {
  lines: keyof typeof CLAMP;
  children: ReactNode;
  className?: string;
  lang?: string;
  /** Direction of the text; defaults to the text's own ("auto"). French passes "ltr". */
  dir?: 'ltr' | 'rtl' | 'auto';
}

/**
 * Long text cut to a few lines with a fade and a "Show more" toggle. On a phone
 * a transcript, four criterion comments and a model answer opened in full made
 * one task three screens long. The toggle only appears when the text really is
 * longer than the clamp.
 */
export function ClampText({ lines, children, className = '', lang, dir = 'auto' }: ClampTextProps) {
  const { t } = useTranslation('exam');
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, children]);

  const clamped = !open && overflows;

  return (
    <div>
      <div
        ref={ref}
        lang={lang}
        // The text is often English inside a right-to-left page: let it take
        // its own direction, so it aligns and punctuates correctly.
        dir={dir}
        className={`${className} ${open ? '' : CLAMP[lines]} ${
          clamped ? '[mask-image:linear-gradient(to_bottom,black_50%,transparent)]' : ''
        }`}
      >
        {children}
      </div>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          {open ? t('results.showLess') : t('results.showMore')}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}
