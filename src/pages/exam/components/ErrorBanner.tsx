import { AlertCircle, X } from 'lucide-react';
import { useExamStore } from '../stores/examStore';

export function ErrorBanner() {
  const { error, clearError } = useExamStore();
  if (!error) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
      <p className="flex-1 text-sm text-error">{error}</p>
      <button
        onClick={clearError}
        className="shrink-0 rounded-sm p-0.5 text-error/60 hover:text-error transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
