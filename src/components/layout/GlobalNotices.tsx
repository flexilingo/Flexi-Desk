import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Megaphone, Wifi, WifiOff, X } from 'lucide-react';
import { getAnnouncements } from '@/lib/account/api';
import {
  announcementText,
  dismissAnnouncement,
  dismissedIds,
  pickAnnouncement,
  localeOffer,
  dismissLocale,
  dismissedLocales,
} from '@/lib/account/notices';
import type { PublicAnnouncement } from '@/lib/account/types';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** "No connection" while the computer is offline, then "Back online" for three seconds. */
export function OfflineNotice() {
  const { t } = useTranslation('account');
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [back, setBack] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const on = () => {
      setBack(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBack(false), 3000);
    };
    const off = () => {
      window.clearTimeout(timer);
      setBack(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online && !back) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center"
    >
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold shadow-lg ${online ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'}`}
      >
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {online ? t('connection.backOnline') : t('connection.offline')}
      </div>
    </div>
  );
}

/** The operator's announcement for the dashboard slot, dismissable (remembered). */
export function AnnouncementBanner() {
  const { i18n } = useTranslation('account');
  const signedIn = !!useAuthStore((s) => s.session);
  const [list, setList] = useState<PublicAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => dismissedIds());
  const lang = i18n.language.split('-')[0];

  useEffect(() => {
    let live = true;
    const load = () =>
      getAnnouncements(lang, 'dashboard_banner')
        .then((r) => live && setList(r.announcements ?? []))
        .catch(() => live && setList([]));
    void load();
    const timer = window.setInterval(load, 300_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [lang, signedIn]);

  const a = useMemo(() => pickAnnouncement(list, 'dashboard_banner', dismissed), [list, dismissed]);
  useEffect(() => {
    if (a?.dismiss_type === 'auto' && a.auto_dismiss_seconds > 0) {
      const timer = window.setTimeout(close, a.auto_dismiss_seconds * 1000);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id]);
  if (!a) return null;
  function close() {
    if (a) setDismissed(dismissAnnouncement(a.id));
  }
  const clickable = a.dismiss_type === 'tap_anywhere';
  return (
    <div
      role={clickable ? 'button' : 'region'}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? close : undefined}
      onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && close() : undefined}
      className={`flex items-center gap-3 border-b border-border bg-primary px-4 py-2.5 text-primary-foreground ${clickable ? 'cursor-pointer' : ''}`}
    >
      <Megaphone className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0 flex-1" dir="auto">
        {a.title && <p className="text-[13px] font-bold leading-tight">{a.title}</p>}
        <p className="whitespace-pre-line text-xs opacity-85">{announcementText(a.message)}</p>
      </div>
      {a.dismiss_type === 'button' && a.button_text ? (
        <Button
          size="xs"
          variant="outline"
          className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          onClick={close}
        >
          {a.button_text}
        </Button>
      ) : a.dismiss_type !== 'none' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          aria-label="close"
          className="rounded p-1 hover:bg-primary-foreground/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** "This app is also in your language" - for a computer whose language we have and the app is not using. */
export function LocaleSuggestion() {
  const { i18n } = useTranslation('account');
  const [dismissed, setDismissed] = useState<string[]>(() => dismissedLocales());
  const offer = localeOffer(
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? [...navigator.languages]
        : [navigator.language]
      : [],
    i18n.language,
    dismissed,
  );
  if (!offer) return null;
  return (
    <div
      role="region"
      lang={offer.code}
      dir={offer.dir}
      className="fixed bottom-4 start-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg rtl:translate-x-1/2"
    >
      <Languages className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="text-[13px] text-foreground">{offer.copy.text}</span>
      <Button size="sm" variant="accent" onClick={() => void i18n.changeLanguage(offer.code)}>
        {offer.copy.cta}
      </Button>
      <button
        type="button"
        aria-label={offer.copy.close}
        onClick={() => setDismissed(dismissLocale(offer.code))}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
