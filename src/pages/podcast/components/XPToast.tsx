import { useEffect, useRef } from 'react';

interface XPBreakdown {
  time?: number;
  words?: number;
  clicks?: number;
}

interface XPToastProps {
  visible: boolean;
  earned: number;
  breakdown?: XPBreakdown;
  onHide: () => void;
}

export function XPToast({ visible, earned, breakdown, onHide }: XPToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(onHide, 3000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, onHide]);

  if (!visible || earned <= 0) return null;

  return (
    <div className="absolute top-4 right-4 z-[10000] bg-card border border-success/30 rounded-xl shadow-xl p-3 flex items-center gap-3 animate-in slide-in-from-right fade-in duration-300">
      <div className="px-2.5 py-1 rounded-lg bg-success/20 text-success font-bold text-sm">
        +{earned} XP
      </div>
      {breakdown && (
        <div className="flex gap-2 text-xs text-muted-foreground">
          {breakdown.time ? <span title="Study time">⏱ {breakdown.time}</span> : null}
          {breakdown.words ? <span title="Words explored">📝 {breakdown.words}</span> : null}
          {breakdown.clicks ? <span title="Interactions">👆 {breakdown.clicks}</span> : null}
        </div>
      )}
    </div>
  );
}
