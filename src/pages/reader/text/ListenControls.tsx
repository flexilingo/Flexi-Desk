import { useTranslation } from 'react-i18next';
import { Headphones, Loader2, Pause, Play } from 'lucide-react';
import { useSpeechState } from '@/lib/speech';
import { ReaderToolbarItem } from './ReaderToolbar';
import type { ReaderListen } from '../listen/useReaderListen';

/**
 * «Listen» on the reader's bar. It opens the player bar at the foot of the window (the same bar
 * a podcast uses); while the bar reads this book it is the play / pause switch. Where listening
 * was left earlier in this book, it offers to continue there.
 */
export function ListenControls({ listen }: { listen: ReaderListen }) {
  const { t, i18n } = useTranslation('readingLibrary');
  const speech = useSpeechState();
  const num = new Intl.NumberFormat(i18n.language);

  if (listen.active) {
    const waiting = listen.status === 'loading' || (listen.status === 'playing' && speech.loading);
    return (
      <ReaderToolbarItem
        icon={waiting ? Loader2 : listen.status === 'playing' ? Pause : Play}
        busy={waiting}
        label={t('listen.listening')}
        title={t('listen.playTitle')}
        onClick={listen.playPause}
        active
      />
    );
  }

  if (listen.place) {
    const place = listen.place;
    return (
      <ReaderToolbarItem
        icon={Headphones}
        label={t('listen.continue')}
        title={t('listen.continueTitle', {
          page: num.format(place.page),
          n: num.format(place.sentence + 1),
        })}
        onClick={listen.continueFromPlace}
      />
    );
  }

  return (
    <ReaderToolbarItem
      icon={Headphones}
      label={t('listen.start')}
      title={t('listen.startTitle')}
      onClick={() => listen.start(0)}
      disabled={!listen.ready}
    />
  );
}
