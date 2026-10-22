import { InlineError } from '@/components/common/InlineError';
import { isAiSetupError } from '@/lib/aiSource';
import { AiSetupCard } from './AiSetupCard';

interface Props {
  /** The raw error from an AI call (or null). */
  message: string | null;
  /** Runs after the user's AI was set up here: the action that failed continues. */
  onReady: () => void;
  onDismiss?: () => void;
}

/** An AI failure: the setup card when the user's own AI is not ready, a plain inline error otherwise. */
export function AiErrorOrSetup({ message, onReady, onDismiss }: Props) {
  if (message && isAiSetupError(message)) return <AiSetupCard compact onReady={onReady} />;
  return <InlineError message={message} onDismiss={onDismiss} />;
}
