import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { OcrState } from '../ocr/controller';

/**
 * What is happening to a scanned book's words, in one small pill over the pages.
 *
 * A scan has no words of its own, so for a moment after it opens nothing on it
 * can be tapped. Saying so — and counting the pages as they become tappable —
 * is the difference between "this is working" and "this is broken".
 *
 * DESK: the words are read on this computer for everyone, so there is no
 * plan hint here. The first time a language is used its reading data is
 * downloaded once, and the pill says so while it comes.
 */
export function PdfTextLayerStatus({ state, onRetry }: { state: OcrState; onRetry: () => void }) {
  const { t } = useTranslation('reader');
  const { t: tDesk, i18n } = useTranslation('readerDesk');

  const shell =
    'pointer-events-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-md';

  const languageName = (() => {
    try {
      return (
        new Intl.DisplayNames([i18n.language], { type: 'language' }).of(state.language.iso) ??
        state.language.iso
      );
    } catch {
      return state.language.iso;
    }
  })();

  let body: ReactNode = null;
  if (state.status === 'failed') {
    const key = `errors.${state.errorCode ?? 'OCR_FAILED'}`;
    body = (
      <div className={shell} role="alert">
        <span className="text-error">
          {i18n.exists(key, { ns: 'readerDesk' }) ? tDesk(key) : tDesk('errors.OCR_FAILED')}
        </span>
        <button
          type="button"
          onClick={onRetry}
          disabled={state.retrying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 font-semibold text-primary transition-colors hover:bg-muted disabled:opacity-60"
        >
          {state.retrying && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('pdf.ocr.retry')}
        </button>
      </div>
    );
  } else if (state.status === 'running' || state.status === 'pending') {
    const downloading = state.phase === 'download';
    body = (
      <div className={shell} role="status" data-ocr-phase={state.phase}>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        {downloading ? (
          <span className="font-semibold text-primary">
            {tDesk('ocr.downloading', {
              language: languageName,
              percent: Math.round(state.downloadProgress * 100),
            })}
          </span>
        ) : (
          <>
            <span className="font-semibold text-primary">{t('pdf.ocr.making')}</span>
            {state.total ? (
              <span className="tabular-nums text-muted-foreground">
                {t('pdf.ocr.progress', {
                  done: Math.min(state.done, state.total),
                  total: state.total,
                })}
              </span>
            ) : null}
          </>
        )}
        {state.language.fallback && (
          <span className="text-muted-foreground">{tDesk('ocr.languageFallback')}</span>
        )}
      </div>
    );
  }

  if (!body) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      {body}
    </div>
  );
}
