import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Below this the text fits in two lines anyway, so it gets no button. */
const SHORT = 180;

/**
 * A summary held to two (or three) lines until asked for more — the website's library
 * summary, the text marked up in its own language.
 */
export function ClampedSummary({
  text,
  lang,
  lines = 2,
  className,
}: {
  text: string;
  lang: string;
  lines?: 2 | 3;
  className?: string;
}) {
  const { t } = useTranslation('podcastUi');
  const [open, setOpen] = useState(false);
  const long = text.length > SHORT;

  return (
    <div className={className}>
      <p
        lang={lang}
        dir="auto"
        className={cn(
          'text-[14.5px] leading-relaxed text-muted-foreground',
          long && !open && (lines === 3 ? 'line-clamp-3' : 'line-clamp-2'),
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-1 text-[13px] font-semibold text-primary hover:underline"
        >
          {open ? t('show.showLess') : t('show.showMore')}
        </button>
      )}
    </div>
  );
}
