import { Loader2, Sparkles } from 'lucide-react';
import type { InsightSkillState } from '../types';

/**
 * The trailing "Insight" pill in a skill tab's sub-tab bar — sits alongside the
 * Part/Task pills so the AI insight is one click away instead of buried below
 * the answer review. Shows a spinner while its section is still generating and a
 * soft dot when it's ready to view.
 */
export function InsightSubTab({
  label,
  active,
  state,
  onClick,
}: {
  label: string;
  active: boolean;
  state?: InsightSkillState;
  onClick: () => void;
}) {
  const loading = state === 'generating' || state === 'pending';
  const ready = state === 'ready';
  const failed = state === 'error';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border transition-colors ${
        active
          ? 'bg-accent/10 text-accent border-accent'
          : 'bg-card text-muted-foreground border-border hover:border-accent/40 hover:text-foreground'
      }`}
    >
      <Sparkles className={`w-3.5 h-3.5 ${active ? 'text-accent' : 'text-caption'}`} />
      {label}
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin text-caption" />
      ) : ready ? (
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent' : 'bg-success'}`} />
      ) : failed ? (
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
      ) : null}
    </button>
  );
}
