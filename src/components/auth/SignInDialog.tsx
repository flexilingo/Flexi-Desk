import { useState } from 'react';
import { Mail, Check, ArrowLeft, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { authErrorText } from './authError';
import { GoogleSignInButton } from './GoogleSignInButton';

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful sign-in, before the dialog closes. */
  onSignedIn?: () => void;
  /** Context line explaining why sign-in is needed (e.g. "Sign in to sync to the cloud."). */
  description?: string;
}

/**
 * In-place email OTP sign-in. Any cloud feature can open this instead of
 * sending the user hunting through Settings. Two steps: email → 6-digit code.
 */
export function SignInDialog({ open, onOpenChange, onSignedIn, description }: SignInDialogProps) {
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('email');
    setEmail('');
    setOtp('');
    setError(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (sending || verifying) return;
    onOpenChange(nextOpen);
    if (!nextOpen) setTimeout(reset, 200);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await sendOtp(email.trim());
      setStep('otp');
      setOtp('');
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await verifyOtp(email.trim(), otp);
      onSignedIn?.();
      onOpenChange(false);
      setTimeout(reset, 200);
    } catch (err) {
      setError(authErrorText(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setOtp('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-primary" />
            Sign in to FlexiLingo
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {description ?? 'Use your FlexiLingo account email. No password needed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {error && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'email' && (
            <GoogleSignInButton
              onSignedIn={() => {
                onSignedIn?.();
                onOpenChange(false);
                setTimeout(reset, 200);
              }}
            />
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Email
                </label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={sending} className="gap-1.5">
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {sending ? 'Sending code...' : 'Send code'}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <div>
                <label
                  htmlFor="signin-otp"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Verification code
                </label>
                <input
                  id="signin-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground text-center tracking-[0.3em] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Use another email
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleSendOtp(e)}
                    disabled={sending}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Resend code'}
                  </button>
                </div>
                <Button type="submit" disabled={verifying} className="gap-1.5">
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {verifying ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
