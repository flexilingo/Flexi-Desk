import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ExternalLink, Loader2, Send } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  GITHUB_ISSUES_URL,
  MESSAGE_MAX,
  SUBJECT_MAX,
  reportProblem,
  type ReportProblem,
  type ReportType,
  REPORT_TYPES,
} from './reportBug';

/**
 * "Report a bug" inside the app (the website's feedback form): it posts to the
 * same `/submit-feedback` the site uses, so a learner never needs a GitHub
 * account. Stays open with the error on failure; closes only once it is sent.
 */
export function ReportBugDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const session = useAuthStore((s) => s.session);
  const signedIn = !!session;

  const [type, setType] = useState<ReportType>('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<ReportProblem>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Fresh form every time it opens (render-adjust, no effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setType('bug');
      setSubject('');
      setMessage('');
      setEmail('');
      setProblem(null);
      setError(null);
      setSent(false);
    }
  }

  const send = async () => {
    const issue = reportProblem({ subject, message, email, signedIn });
    setProblem(issue);
    setError(null);
    if (issue) return;
    setSending(true);
    try {
      const version = await getVersion().catch(() => 'unknown');
      await supabaseCall('POST', '/submit-feedback', {
        subject: subject.trim(),
        message: message.trim(),
        type,
        ...(signedIn ? {} : { email: email.trim() }),
        platform: 'desktop',
        page_url: window.location.hash || window.location.pathname,
        user_agent: `FlexiDesk/${version} ${navigator.userAgent}`,
      });
      setSent(true);
    } catch {
      setError(t('reportBug.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const field =
    'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:border-accent/60 focus-visible:outline-none';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!sending) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('reportBug.title')}</DialogTitle>
          <DialogDescription>{t('reportBug.description')}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-start gap-3" role="status" data-testid="report-sent">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Check className="h-4 w-4 text-success" />
              {t('reportBug.sent')}
            </p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('reportBug.close')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={t('reportBug.type')}
            >
              {REPORT_TYPES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={type === k}
                  onClick={() => setType(k)}
                  className={cn(
                    'inline-flex items-center rounded-[8px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                    type === k
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`reportBug.types.${k}`)}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">{t('reportBug.subject')}</span>
              <input
                className={field}
                value={subject}
                maxLength={SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('reportBug.subjectPlaceholder')}
              />
              {problem === 'subject' && (
                <span className="text-[12px] text-error">{t('reportBug.subjectInvalid')}</span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">{t('reportBug.message')}</span>
              <textarea
                className={cn(field, 'min-h-[120px] resize-y')}
                value={message}
                maxLength={MESSAGE_MAX}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('reportBug.messagePlaceholder')}
              />
              {problem === 'message' && (
                <span className="text-[12px] text-error">{t('reportBug.messageInvalid')}</span>
              )}
            </label>

            {!signedIn && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">{t('reportBug.email')}</span>
                <input
                  type="email"
                  dir="ltr"
                  className={field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <span className="text-[11.5px] text-muted-foreground">
                  {t('reportBug.emailHint')}
                </span>
                {problem === 'email' && (
                  <span className="text-[12px] text-error">{t('reportBug.emailInvalid')}</span>
                )}
              </label>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[9px] border border-error/40 bg-error/10 px-3 py-2 text-[12.5px] text-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => void openUrl(GITHUB_ISSUES_URL)}
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t('reportBug.github')}
              </button>
              <Button onClick={() => void send()} disabled={sending}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('reportBug.send')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
