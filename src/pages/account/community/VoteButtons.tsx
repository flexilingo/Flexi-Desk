import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { voteTopic } from '@/lib/account/api';
import {
  applyVoteResult,
  optimisticVote,
  voteStateOf,
  type VoteState,
} from '@/lib/account/community';
import type { CommunityTopic, VoteType } from '@/lib/account/types';
import { cn } from '@/lib/utils';
import { useAccountT } from '../components/AccountBits';

const UP = 'border-success/40 bg-success/15 text-success';
const DOWN = 'border-error/40 bg-error/10 text-error';
const IDLE = 'border-border bg-muted text-caption hover:bg-muted/70';

export function VoteButtons({
  topic,
  compact = false,
  onNeedSignIn,
}: {
  topic: CommunityTopic;
  compact?: boolean;
  onNeedSignIn?: () => void;
}) {
  const { t, errorText } = useAccountT();
  const signedIn = !!useAuthStore((s) => s.session);
  const [state, setState] = useState<VoteState>(() => voteStateOf(topic));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = async (type: VoteType) => {
    if (!signedIn) {
      onNeedSignIn?.();
      return;
    }
    if (busy) return;
    setError(null);
    const before = state;
    setState(optimisticVote(state, type));
    setBusy(true);
    try {
      setState(applyVoteResult(optimisticVote(before, type), await voteTopic(topic.id, type)));
    } catch (e) {
      setState(before);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const btn = (type: VoteType, Icon: typeof ChevronUp, label: string, count: number) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void press(type);
      }}
      disabled={busy}
      aria-label={compact ? label : `${label} (${count})`}
      aria-pressed={state.vote === type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border text-[13px] font-semibold transition-colors disabled:opacity-60',
        compact ? 'p-2' : 'px-3 py-2',
        state.vote === type ? (type === 'upvote' ? UP : DOWN) : IDLE,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {!compact && <span>{count}</span>}
    </button>
  );

  return (
    <div
      className={cn('flex gap-1', compact ? 'flex-col items-center' : 'flex-col items-start gap-2')}
    >
      {error && (
        <p role="alert" className="text-center text-[11px] font-medium text-error">
          {error}
        </p>
      )}
      <div className={cn('flex items-center', compact ? 'flex-col gap-1' : 'gap-3')}>
        {btn('upvote', ChevronUp, t('community.upvote'), state.up)}
        <span
          className={cn(
            'text-center font-extrabold text-foreground',
            compact ? 'text-[13px]' : 'min-w-[3rem] text-lg',
          )}
        >
          {state.score}
        </span>
        {btn('downvote', ChevronDown, t('community.downvote'), state.down)}
      </div>
    </div>
  );
}
