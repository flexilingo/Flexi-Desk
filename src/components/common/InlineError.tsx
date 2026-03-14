import { cn } from '@/lib/utils';
import { AlertCircle, X } from 'lucide-react';

interface InlineErrorProps {
  message: string | null;
  onDismiss?: () => void;
  className?: string;
}

export function InlineError({ message, onDismiss, className }: InlineErrorProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error',
        className,
      )}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-sm p-0.5 hover:bg-error/20 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
