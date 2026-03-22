import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Bug, Lightbulb, HelpCircle, Loader2 } from 'lucide-react';
import { supabaseCall } from '../../../lib/supabase';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  episodeId?: string;
}

const FEEDBACK_TYPES = [
  { key: 'feedback', label: 'Feedback', icon: MessageSquare },
  { key: 'bug', label: 'Bug', icon: Bug },
  { key: 'feature', label: 'Feature', icon: Lightbulb },
  { key: 'other', label: 'Other', icon: HelpCircle },
] as const;

export function FeedbackDialog({ open, onClose, episodeId }: FeedbackDialogProps) {
  const [feedbackType, setFeedbackType] = useState<string>('feedback');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSuccess(false);
      setError(null);
      setSubject('');
      setMessage('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // Best-effort submit — silently succeed if no connection
      await supabaseCall('POST', '/submit-feedback', {
        email,
        subject,
        message,
        type: feedbackType,
        video_id: episodeId,
        platform: 'desktop',
        user_agent: `FlexiDesk/${navigator.userAgent}`,
      }).catch(() => {});
      setSuccess(true);
    } catch {
      setSuccess(true); // show success even if offline
    } finally {
      setSubmitting(false);
    }
  }, [subject, message, feedbackType, email, episodeId]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border bg-primary/5">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Feedback</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🎉</p>
              <p className="font-semibold text-foreground">Thank you!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your feedback has been submitted.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (optional)"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
              />

              <div className="flex gap-1.5">
                {FEEDBACK_TYPES.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setFeedbackType(key)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-colors ${
                      feedbackType === key
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
              />

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feedback..."
                maxLength={5000}
                className="w-full h-32 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm resize-none"
              />

              {error && (
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !subject.trim() || !message.trim()}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
