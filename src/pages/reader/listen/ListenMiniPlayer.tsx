import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { FREE_LISTEN_EPISODES } from './listen-access';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, Crown, Headphones, Keyboard, Repeat1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeechState } from '@/lib/speech';
import { WordDialog } from '@/components/WordDialog';
import { SignInDialog } from '@/components/auth/SignInDialog';
import {
  MINI_ICON_ACTIVE,
  MINI_ICON_BUTTON,
  MiniPlayerBar,
} from '@/pages/podcast/components/mini/MiniPlayerBar';
import { cleanWord, tokenize } from '@/components/lookup/tokenize';
import { bookReadPath, coverUrl } from '../library/format';
import { useListenStore } from './listenStore';
import { useListenKeys } from './use-listen-keys';
import { useWordFollow } from './use-word-follow';

/**
 * The player bar while a library book is read aloud — the same bar as a podcast's, in its
 * «sentence» mode: previous / next sentence, where it is («7 of 42 · page 1 of 11»), speed,
 * repeat-this-sentence, the sentence being read above it (its words open the word dialog) —
 * left out while the book's own page is open, where the text is right there — and the way
 * back to the book. Space, ← → and R work from anywhere but a text box or a dialog.
 */
export function ListenMiniPlayer() {
  const { t, i18n } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const navigate = useNavigate();
  const source = useListenStore((s) => s.source);
  const page = useListenStore((s) => s.page);
  const pageCount = useListenStore((s) => s.pageCount);
  const sentences = useListenStore((s) => s.sentences);
  const index = useListenStore((s) => s.index);
  const status = useListenStore((s) => s.status);
  const rate = useListenStore((s) => s.rate);
  const volume = useListenStore((s) => s.volume);
  const repeat = useListenStore((s) => s.repeat);
  const invite = useListenStore((s) => s.invite);
  const problem = useListenStore((s) => s.problem);
  // The book's own page is open: its text is right there, so the bar leaves out the sentence line.
  const readerHere = useListenStore((s) => !!s.source && s.readerOpen === s.source.bookId);
  const act = useListenStore.getState();
  const speech = useSpeechState();
  const [word, setWord] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  useListenKeys(!!source && !word && !signInOpen, {
    playPause: act.playPause,
    prev: act.prev,
    next: act.next,
    repeat: act.toggleRepeat,
  });

  useWordFollow(!!source, !!source && status === 'playing');

  if (!source) return null;
  const sentence = sentences[index];
  const count = sentences.length;
  const num = new Intl.NumberFormat(i18n.language);
  const loading = status === 'loading' || (status === 'playing' && speech.loading);

  const line = invite ? (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-border bg-card/95 px-5 py-2.5 backdrop-blur">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {invite === 'pro' ? (
          <Crown className="h-4 w-4 shrink-0 text-accent" />
        ) : (
          <Headphones className="h-4 w-4 shrink-0 text-primary" />
        )}
        {invite === 'pro' ? t('listen.proTitle') : t('listen.signInTitle')}
      </p>
      {invite === 'pro' ? (
        <button
          type="button"
          onClick={() => void openUrl(subscriptionUrl(i18n.language))}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          <Crown className="h-3.5 w-3.5" />
          {t('listen.proCta')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSignInOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          {t('listen.signInCta')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      )}
    </div>
  ) : problem ? (
    <div className="flex items-center justify-center gap-2 border-t border-border bg-card/95 px-5 py-2.5 text-sm text-error backdrop-blur">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {problem === 'silent' ? t('listen.noVoice') : t('public.pageError')}
    </div>
  ) : sentence && !readerHere ? (
    <ListenSentenceLine
      key={`${page}:${index}`}
      text={sentence.text}
      language={source.language}
      onWord={(w) => {
        act.pause();
        setWord(w);
      }}
    />
  ) : null;

  return (
    <>
      <MiniPlayerBar
        title={source.title}
        showName={source.subtitle}
        image={source.coverPath ? coverUrl(source.coverPath) : null}
        isPlaying={status !== 'paused'}
        isLoading={loading}
        currentTime={count ? index + 1 : 0}
        duration={count}
        volume={volume}
        onPlayPause={act.playPause}
        onSkip={(s) => (s < 0 ? act.prev() : act.next())}
        onSeek={(time) => act.jump(Math.min(count - 1, Math.floor(time)))}
        onVolumeChange={act.setVolume}
        onExpand={() => navigate(bookReadPath(source.bookId, page))}
        expandLabel={tDesk('book.backToBook')}
        onExit={act.close}
        playLabel={t('listen.playTitle')}
        lineSteps={{
          onPrev: act.prev,
          onNext: act.next,
          prevLabel: t('listen.prevTitle'),
          nextLabel: t('listen.nextTitle'),
        }}
        position={
          <span className="ms-2 whitespace-nowrap text-xs tabular-nums text-caption">
            {count ? (
              <>
                <span className="font-semibold text-foreground">
                  {t('listen.position', {
                    n: num.format(index + 1),
                    total: num.format(count),
                    page: num.format(page),
                    pages: num.format(pageCount),
                  })}
                </span>
              </>
            ) : null}
          </span>
        }
        extraControls={
          <>
            <button
              type="button"
              onClick={act.cycleRate}
              title={t('listen.speed')}
              aria-label={`${t('listen.speed')} ${rate}×`}
              className={cn(
                MINI_ICON_BUTTON,
                'w-auto min-w-9 px-1.5 text-xs font-bold tabular-nums',
              )}
            >
              {num.format(rate)}×
            </button>
            <button
              type="button"
              onClick={act.toggleRepeat}
              aria-pressed={repeat}
              title={t('listen.repeat')}
              aria-label={t('listen.repeat')}
              className={repeat ? MINI_ICON_ACTIVE : MINI_ICON_BUTTON}
            >
              <Repeat1 className="h-4 w-4" />
            </button>
            <span
              className={cn(MINI_ICON_BUTTON, 'cursor-help')}
              title={t('listen.shortcuts')}
              aria-label={t('listen.shortcuts')}
              role="img"
            >
              <Keyboard className="h-4 w-4" />
            </span>
          </>
        }
        subtitleLine={line}
      />
      <WordDialog
        word={word ?? ''}
        open={!!word}
        onOpenChange={(open) => !open && setWord(null)}
        sourceLang={source.language}
        sentenceContext={sentence?.text}
      />
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description={t('listen.signInBody', { n: FREE_LISTEN_EPISODES })}
      />
    </>
  );
}

/**
 * The sentence being read, above the bar, in the page's own words (the same split as the page,
 * so the word being said is the same n-th word in both places). Each word opens the word dialog.
 */
function ListenSentenceLine({
  text,
  language,
  onWord,
}: {
  text: string;
  language: string;
  onWord: (word: string) => void;
}) {
  let n = 0;
  return (
    <div className="relative border-t border-border bg-card/95 backdrop-blur">
      <div className="overflow-x-auto px-5 py-2">
        <p
          data-listen-line=""
          lang={language}
          dir="auto"
          className="text-center text-base leading-relaxed text-foreground"
        >
          {tokenize(text).map((token, i) =>
            token.word ? (
              <button
                key={i}
                type="button"
                data-listen-word={n++}
                onClick={() => cleanWord(token.text).length > 1 && onWord(cleanWord(token.text))}
                className="inline cursor-pointer rounded-[4px] transition-colors decoration-terra-400 underline-offset-2 hover:text-accent hover:underline"
              >
                {token.text}
              </button>
            ) : (
              <span key={i}>{token.text}</span>
            ),
          )}
        </p>
      </div>
    </div>
  );
}
