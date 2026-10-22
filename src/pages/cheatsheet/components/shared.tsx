import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import type { Resource } from '../lib/useResource';
import { dirFor } from '../lib/types';

/** The UI language, without a region: the cheatsheet's "explain locale". */
export function useCsLocale() {
  const { t, i18n } = useTranslation('cheatsheet');
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];
  return { t, locale, dir: dirFor(locale), i18n };
}

/** Name of a language in the reader's own language. */
export function languageLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * The language the pages are EXPLAINED in. The website puts it in the URL's locale;
 * the desk's URL has none, so it is the UI language unless `?explain=xx` picks
 * another (the "available now in" links of a page not translated yet).
 */
export function useExplainLocale(): string {
  const { locale } = useCsLocale();
  const [params] = useSearchParams();
  const forced = params.get('explain');
  return forced && /^[a-z]{2}$/.test(forced) ? forced : locale;
}

export const csPath = (...parts: string[]) =>
  ['/cheatsheet', ...parts.map((p) => encodeURIComponent(p))].join('/');

export const CsLink = Link;

/** A pulsing placeholder while a page loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-3 px-1 py-6" aria-busy="true">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-muted/60" />
      ))}
    </div>
  );
}

/**
 * Loading and failure of a resource, with the retry. `children` runs once there
 * is data. Offline gets its own words: nothing stored and no connection.
 */
export function ResourceGate<T>({
  resource,
  children,
}: {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation('cheatsheet');
  if (resource.data !== undefined) return <>{children(resource.data)}</>;
  if (resource.loading) return <PageSkeleton />;
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10">
      <InlineError
        message={resource.error === 'offline' ? t('offline.unavailable') : t('errors.loadFailed')}
      />
      <Button variant="outline" onClick={resource.reload}>
        {resource.error === 'offline' && <WifiOff />}
        {t('errors.retry')}
      </Button>
    </div>
  );
}

/** Whether the computer is online, live. */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** The strip that says the page is the saved copy. Renders nothing while online. */
export function OfflineBanner() {
  const { t } = useTranslation('cheatsheet');
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-warning" />
      {t('offline.banner')}
    </p>
  );
}
