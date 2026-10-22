import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WritingExamType, WritingPrompt } from '../lib/types';

export function PromptCard({
  prompt,
  examType,
}: {
  prompt: WritingPrompt;
  examType: WritingExamType;
}) {
  const { t } = useTranslation('writingPractice');
  const [open, setOpen] = useState(true);

  const supplementary = (prompt.supplementary_data ?? {}) as Record<string, string>;
  const readingPassage = supplementary.reading_passage;
  const lectureSummary = supplementary.lecture_summary;
  const chartDescription = supplementary.chart_description;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start transition-colors hover:bg-accent/[0.04]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent/10">
            <BookOpen className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-accent/70">
              {t(`examTypes.${examType}`)}
            </span>
            <span className="block truncate text-sm font-bold text-foreground">{prompt.topic}</span>
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
              {prompt.prompt_text}
            </p>
          </div>
          {readingPassage && (
            <SupplementaryBlock
              tone="muted"
              label={t('prompt.readingPassage')}
              content={readingPassage}
            />
          )}
          {lectureSummary && (
            <SupplementaryBlock
              tone="success"
              label={t('prompt.lectureSummary')}
              content={lectureSummary}
            />
          )}
          {chartDescription && (
            <SupplementaryBlock
              tone="primary"
              label={t('prompt.chartDescription')}
              content={chartDescription}
            />
          )}
        </div>
      )}
    </div>
  );
}

const BLOCK = {
  muted: { box: 'bg-muted/50 border-border', label: 'text-primary-light' },
  success: { box: 'bg-success/[0.08] border-success/25', label: 'text-success' },
  primary: { box: 'bg-accent/[0.06] border-accent/[0.18]', label: 'text-accent' },
} as const;

function SupplementaryBlock({
  tone,
  label,
  content,
}: {
  tone: keyof typeof BLOCK;
  label: string;
  content: string;
}) {
  return (
    <div className={cn('rounded-xl border p-4', BLOCK[tone].box)}>
      <p className={cn('mb-1.5 text-[10px] font-bold uppercase tracking-wider', BLOCK[tone].label)}>
        {label}
      </p>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
        {content}
      </p>
    </div>
  );
}
