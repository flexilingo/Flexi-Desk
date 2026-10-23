import { useTranslation } from 'react-i18next';
import { Headphones, Loader2, Pause, Play, Square } from 'lucide-react';
import { useSpeechState } from '@/lib/speech';
import { ReaderToolbarItem } from './ReaderToolbar';
import type { PageListen } from './usePageListen';

/** The «Listen» player on the reader's bar: Listen, then Pause / Resume and Stop. */
export function ListenControls({ listen }: { listen: PageListen }) {
  const { t } = useTranslation('readingLibrary');
  const speech = useSpeechState();

  if (listen.status === 'idle') {
    return (
      <ReaderToolbarItem
        icon={Headphones}
        label={t('listen.start')}
        title={t('listen.startTitle')}
        onClick={listen.start}
        disabled={!listen.available}
      />
    );
  }

  // The first piece is still being fetched or chosen: the pause button says so.
  const waiting = listen.status === 'playing' && speech.loading;
  return (
    <>
      {listen.status === 'playing' ? (
        <ReaderToolbarItem
          icon={waiting ? Loader2 : Pause}
          busy={waiting}
          label={t('listen.pause')}
          onClick={listen.pause}
          active
        />
      ) : (
        <ReaderToolbarItem icon={Play} label={t('listen.resume')} onClick={listen.resume} active />
      )}
      <ReaderToolbarItem icon={Square} label={t('listen.stop')} onClick={listen.stop} />
    </>
  );
}
