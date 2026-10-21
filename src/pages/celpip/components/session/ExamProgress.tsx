import { useTranslation } from 'react-i18next';
import { ExamSettingsPopover } from './ExamSettingsPopover';
import { Check, LogOut } from 'lucide-react';

interface SectionPillStyle {
  label: string;
  active: string;
  done: string;
  pending: string;
  line: string;
}

// Literal token classes only (per the design rules the scanner can't see
// concatenated strings). L=success, R=accent, W=primary, S=warning.
const SECTION_STYLES: SectionPillStyle[] = [
  {
    label: 'L',
    active: 'bg-success text-white shadow-sm',
    done: 'bg-success/20 text-success',
    pending: 'bg-muted text-muted-foreground',
    line: 'bg-success/40',
  },
  {
    label: 'R',
    active: 'bg-accent text-white shadow-sm',
    done: 'bg-accent/20 text-accent',
    pending: 'bg-muted text-muted-foreground',
    line: 'bg-accent/40',
  },
  {
    label: 'W',
    active: 'bg-primary text-primary-foreground shadow-sm',
    done: 'bg-primary/20 text-primary',
    pending: 'bg-muted text-muted-foreground',
    line: 'bg-primary/40',
  },
  {
    label: 'S',
    active: 'bg-warning text-white shadow-sm',
    done: 'bg-warning/20 text-warning',
    pending: 'bg-muted text-muted-foreground',
    line: 'bg-warning/40',
  },
];

interface ExamProgressProps {
  currentSection: number;
  totalSections: number;
  sectionStatuses: Array<'pending' | 'scoring' | 'scored' | 'in_progress'>;
  /** End the exam early — completed sections are kept and scored */
  onEndExam?: () => void;
  /**
   * Learning mode only. Text size is always adjustable; tap-to-translate is not
   * offered in a timed exam, so these arrive undefined there.
   */
  translateOn?: boolean;
  onTranslateChange?: (on: boolean) => void;
}

export function ExamProgress({
  currentSection,
  totalSections,
  sectionStatuses,
  onEndExam,
  translateOn,
  onTranslateChange,
}: ExamProgressProps) {
  const { t } = useTranslation('celpip');

  return (
    <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-card border-b border-border">
      {SECTION_STYLES.slice(0, totalSections).map((style, i) => {
        const status = sectionStatuses[i];
        const isActive = i === currentSection;
        const isDone = status === 'scored' || status === 'scoring';
        const pillStyle = isActive ? style.active : isDone ? style.done : style.pending;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[12px] font-bold tabular-nums transition-colors ${pillStyle}`}
            >
              <span>{style.label}</span>
              {isDone && <Check className="w-3 h-3" strokeWidth={3} />}
            </div>
            {i < totalSections - 1 && (
              <div className={`h-px w-5 sm:w-6 ${i < currentSection ? style.line : 'bg-border'}`} />
            )}
          </div>
        );
      })}
      <span className="ms-auto text-[11.5px] text-muted-foreground font-semibold tabular-nums">
        {t('section')} {currentSection + 1} {t('of')} {totalSections}
      </span>
      {/* Text size lives here too — it was mobile-only until now, and a 55-minute
          reading section at 13px is a real accessibility problem. */}
      <ExamSettingsPopover
        learningMode={!!onTranslateChange}
        translateOn={!!translateOn}
        onToggleTranslate={(on) => onTranslateChange?.(on)}
      />
      {onEndExam && (
        <button
          onClick={onEndExam}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-semibold text-error border border-error/30 hover:bg-error/10 transition-colors shrink-0"
        >
          <LogOut className="w-3 h-3" />
          {t('endExamButton')}
        </button>
      )}
    </div>
  );
}
