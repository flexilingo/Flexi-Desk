import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play, Sparkles, X } from 'lucide-react';
import { useSpeechState } from '@/lib/speech';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { listenEstimate } from '../text/listen-sequence';
import { useListenStore } from './listenStore';
import { useListenKeys } from './use-listen-keys';
import type { ReaderListen } from './useReaderListen';

/** Set once the reader has closed the «new: listen while you read» note (or started listening). */
export const LISTEN_HINT_KEY = 'library_listen_hint_seen';

/**
 * The way into listening, where reading starts: at the top of the page, a filled play button
 * that cannot be mistaken for a label, «Listen to this page», how much there is to hear, and the
 * key that starts it. While the player bar reads this book it says where it is, with pause.
 */
export function ListenStrip({ listen, text }: { listen: ReaderListen; text: string }) {
  const { t, i18n } = useTranslation('readingLibrary');
  const { t: tp } = useTranslation('podcastUi');
  const speech = useSpeechState();
  // Space belongs to the bar while it holds any book; on a quiet page it starts this one.
  const barBusy = useListenStore((s) => !!s.source);
  const num = new Intl.NumberFormat(i18n.language);
  const estimate = useMemo(() => listenEstimate(text), [text]);

  const [hintSeen, setHintSeen] = useState(true);
  useEffect(() => {
    let live = true;
    getSetting(LISTEN_HINT_KEY)
      .then((raw) => live && setHintSeen(raw === '1'))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const seeHint = () => {
    setHintSeen(true);
    void setSetting(LISTEN_HINT_KEY, '1').catch(() => {});
  };

  const start = () => {
    if (!hintSeen) seeHint();
    listen.start(0);
  };
  useListenKeys(listen.ready && !barBusy, { playPause: start }, ['playPause']);

  const position = listen.position;
  const playing = listen.active && listen.status !== 'paused';
  const waiting = listen.status === 'loading' || (listen.status === 'playing' && speech.loading);

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
        <button
          type="button"
          onClick={listen.active ? listen.playPause : start}
          disabled={!listen.active && !listen.ready}
          aria-label={playing ? tp('np.pause') : t('listen.stripTitle')}
          title={playing ? tp('np.pause') : t('listen.playTitle')}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {listen.active && waiting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ms-0.5 h-4 w-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {position ? (
            <p className="text-sm font-bold text-foreground">
              {t(playing ? 'listen.stripPlaying' : 'listen.stripPaused', {
                n: num.format(position.n),
                total: num.format(position.total),
              })}
            </p>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground">{t('listen.stripTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('listen.stripMeta', {
                  count: estimate.sentences,
                  minutes: num.format(estimate.minutes),
                })}
                {listen.place ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={listen.continueFromPlace}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {t('listen.stripContinue', {
                        page: num.format(listen.place.page),
                        n: num.format(listen.place.sentence + 1),
                      })}
                    </button>
                  </>
                ) : null}
              </p>
            </>
          )}
        </div>

        {!listen.active && !barBusy && (
          <kbd className="hidden shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-xs sm:inline-block">
            {t('listen.space')}
          </kbd>
        )}
      </div>

      {!hintSeen && !listen.active && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent/10 px-3 py-2 text-[13px] leading-snug">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-foreground">
            <span className="font-semibold">{t('listen.hintNew')}</span>{' '}
            <span className="text-muted-foreground">{t('listen.hintBody')}</span>
          </p>
          <button
            type="button"
            onClick={seeHint}
            aria-label={t('series.close')}
            title={t('series.close')}
            className="-me-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
