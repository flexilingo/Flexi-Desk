import { useState } from 'react';
import { BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { parseCloudError } from '@/lib/cloudError';
import { cheatsheet } from '../lib/service';
import { CheatsheetUnavailableError } from '../lib/client';
import { getVote, saveVote } from '../lib/requestLanguage';
import { useCsLocale } from './shared';

/**
 * One press says "write this language next".
 *
 * The email is optional and only appears after the press is recorded: asking for
 * it up front turns a one-click vote into a signup form, and the vote is the part
 * that decides what gets written. A recorded vote is remembered on this computer.
 */
export default function RequestLanguageButton({ lang, locale }: { lang: string; locale: string }) {
  const { t, i18n } = useCsLocale();
  const [vote, setVote] = useState(() => getVote(lang, locale));
  const [sending, setSending] = useState<'vote' | 'email' | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const message = (err: unknown) => {
    if (err instanceof CheatsheetUnavailableError) return t('errors.OFFLINE');
    const code = parseCloudError(err).code;
    return code && i18n.exists(`cheatsheet:errors.${code}`)
      ? t(`errors.${code}`)
      : t('errors.REQUEST_FAILED');
  };

  async function send(kind: 'vote' | 'email') {
    setSending(kind);
    setError(null);
    try {
      await cheatsheet.requestLanguage(lang, locale, kind === 'email' ? email : undefined);
      setVote(
        saveVote(
          lang,
          locale,
          kind === 'vote' ? { voted: true } : { voted: true, emailSaved: true },
        ),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setSending(null);
    }
  }

  if (!vote.voted) {
    return (
      <div className="flex flex-col items-center">
        <Button variant="accent" loading={sending === 'vote'} onClick={() => void send('vote')}>
          <BellRing />
          {t('comingSoon.cta')}
        </Button>
        {error && <InlineError message={error} className="mt-3" />}
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
        <Check className="h-4 w-4" />
        {t('comingSoon.thanks')}
      </p>
      {vote.emailSaved ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('comingSoon.emailSaved')}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send('email');
          }}
          className="mt-3"
        >
          <p className="mb-2 text-sm text-muted-foreground">{t('comingSoon.emailPrompt')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="max-w-xs"
            />
            <Button type="submit" variant="outline" loading={sending === 'email'}>
              {t('comingSoon.emailCta')}
            </Button>
          </div>
          {error && <InlineError message={error} className="mt-3" />}
        </form>
      )}
    </div>
  );
}
