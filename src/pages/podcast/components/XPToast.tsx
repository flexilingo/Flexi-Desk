import { Clock, Pencil, Pointer } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('podcastUi');
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
        {t('xpToast.earned', { earned })}
      </div>
      {breakdown && (
        <div className="flex gap-2 text-xs text-muted-foreground">
          {breakdown.time ? (
            <span title={t('xpToast.studyTime')} className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {breakdown.time}
            </span>
          ) : null}
          {breakdown.words ? (
            <span title={t('xpToast.wordsExplored')} className="inline-flex items-center gap-1">
              <Pencil className="h-3 w-3" /> {breakdown.words}
            </span>
          ) : null}
          {breakdown.clicks ? (
            <span title={t('xpToast.interactions')} className="inline-flex items-center gap-1">
              <Pointer className="h-3 w-3" /> {breakdown.clicks}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
