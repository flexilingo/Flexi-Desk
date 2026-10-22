import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseCloudError } from '@/lib/cloudError';
import { cheatsheet } from '../lib/service';
import { CheatsheetUnavailableError } from '../lib/client';
import { csPath, useCsLocale } from './shared';

/**
 * "«googler» isn't in our list yet — conjugate it."
 *
 * The catalogue holds every verb the conjugator has a template for, but French
 * keeps making new ones (googler, scroller, liker). A verb a reader asks for is
 * built there and then, and they land on its page. The backend decides whether
 * the word really is a verb; this only asks and reports. Needs a connection.
 */
export default function ConjugateOnDemand({
  word,
  lang,
  compact = false,
}: {
  word: string;
  lang: string;
  /** Inside the search dropdown, rather than as a card of its own. */
  compact?: boolean;
}) {
  const { t, i18n } = useCsLocale();
  const navigate = useNavigate();
  // Tied to the word it was about, so typing another word clears a stale error.
  const [state, setState] = useState<{ word: string; busy: boolean; error: string | null }>({
    word: '',
    busy: false,
    error: null,
  });
  const busy = state.word === word && state.busy;
  const error = state.word === word ? state.error : null;

  const build = async () => {
    if (busy) return;
    setState({ word, busy: true, error: null });
    try {
      const lemma = await cheatsheet.conjugate(lang, word);
      // Stays busy while the page loads — the reader already has their answer.
      navigate(csPath(lang, 'verbes', lemma));
    } catch (err) {
      const code =
        err instanceof CheatsheetUnavailableError
          ? 'CONJUGATION_UNAVAILABLE'
          : parseCloudError(err).code || 'CONJUGATION_UNAVAILABLE';
      setState({ word, busy: false, error: code });
    }
  };

  const key = error && `verbs.onDemand.errors.${error}`;
  const message =
    error &&
    (i18n.exists(`cheatsheet:${key}`)
      ? t(key as string, { word })
      : t('verbs.onDemand.errors.UNKNOWN_ERROR'));

  return (
    <div
      className={
        compact ? 'px-4 py-3.5' : 'rounded-[9px] border border-border bg-muted/50 px-4 py-3.5'
      }
    >
      <p className="text-[15px] text-muted-foreground">
        <Trans
          i18nKey="verbs.onDemand.missing"
          ns="cheatsheet"
          values={{ word }}
          components={{ v: <bdi className="font-semibold text-foreground" /> }}
        />
      </p>
      <Button
        variant="accent"
        size="sm"
        className="mt-2.5"
        loading={busy}
        onClick={() => void build()}
      >
        <Sparkles />
        <span>
          {busy ? (
            t('verbs.onDemand.building')
          ) : (
            <Trans
              i18nKey="verbs.onDemand.build"
              ns="cheatsheet"
              values={{ word }}
              components={{ v: <bdi /> }}
            />
          )}
        </span>
      </Button>
      {message && <p className="mt-2 text-sm text-error">{message}</p>}
    </div>
  );
}
