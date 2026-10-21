import { SkipForward } from 'lucide-react';

interface DevSkipButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

// DEV ONLY — floating helper for end-to-end flow testing of the exam pipeline.
// Each section wires it to fast-forward its current sub-stage (audio, timers,
// questions, tasks). Renders nothing in production builds. Vite exposes the dev
// flag as `import.meta.env.DEV` (front gated on `process.env.NODE_ENV`).
export function DevSkipButton({ label, onClick, disabled }: DevSkipButtonProps) {
  if (!import.meta.env.DEV) return null;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[10001] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] bg-warning hover:bg-warning/90 text-white text-[13px] font-semibold border-2 border-dashed border-white/60 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <SkipForward className="w-4 h-4" />
      DEV: {label}
    </button>
  );
}
