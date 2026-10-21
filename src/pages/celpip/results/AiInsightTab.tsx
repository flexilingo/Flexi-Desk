import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, MessageSquare, FileText, BookOpenCheck } from 'lucide-react';
import type { SectionResult, AiTaskFeedback } from '../types';
import { LookupText } from '../components/session/WordLookup';
import { CLB_WIDTH, clbTextColor, clbBarColor } from './shared';

interface AiInsightTabProps {
  result: SectionResult;
  taskLabel: string;
}

export function AiInsightTab({ result, taskLabel }: AiInsightTabProps) {
  const { t } = useTranslation('celpip');
  const [activeTask, setActiveTask] = useState(0);
  const tasks: AiTaskFeedback[] = result.ai_feedback?.tasks ?? [];
  const isSpeak = result.section_type === 'speaking';
  const userAnswers = (result.answers || {}) as Record<string, string>;
  const userTranscripts = (result.transcripts || {}) as Record<string, string>;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-[13px]">{t('scoringInProgress')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section CLB bar */}
      <div className="flex items-center gap-4 p-4 bg-muted border border-border rounded-[12px]">
        <div className="text-center min-w-[68px]">
          <div
            className={`text-[28px] font-extrabold tabular-nums leading-none ${clbTextColor(result.clb_score)}`}
          >
            {result.clb_score ?? '–'}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mt-0.5">
            CLB
          </div>
        </div>
        <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${clbBarColor(result.clb_score)} ${
              result.clb_score != null ? (CLB_WIDTH[result.clb_score] ?? 'w-0') : 'w-0'
            }`}
          />
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-semibold bg-accent/10 text-accent border border-accent/25 shrink-0">
          <Sparkles className="w-3 h-3" />
          {t('aiInsight')}
        </span>
      </div>

      {/* Task sub-tabs — speaking has 8 tasks; one at a time keeps this scannable */}
      {tasks.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {tasks.map((task, i) => {
            const taskIdx = task.task_index ?? i;
            const isActive = activeTask === i;
            return (
              <button
                key={taskIdx}
                onClick={() => setActiveTask(i)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {taskLabel} {taskIdx + 1}
                <span
                  className={`text-[10.5px] tabular-nums font-bold px-1.5 py-[1px] rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : task.clb_score >= 7
                        ? 'bg-success/15 text-success'
                        : task.clb_score >= 5
                          ? 'bg-warning/15 text-warning'
                          : 'bg-error/10 text-error'
                  }`}
                >
                  {task.clb_score}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tasks.map((task, i) => {
        if (i !== activeTask) return null;
        const taskIdx = task.task_index ?? i;
        const userText = isSpeak
          ? (task.transcript ?? userTranscripts[`task_${taskIdx}`] ?? '')
          : (userAnswers[`task_${taskIdx}`] ?? '');
        const overallComment = task.overall_comment ?? task.comment ?? '';
        const criteriaEntries = Object.entries(task.criteria);

        return (
          <div
            key={taskIdx}
            className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm"
          >
            <div className="px-5 py-3.5 bg-muted border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-foreground">
                {taskLabel} {taskIdx + 1}
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[12px] font-extrabold tabular-nums ${
                  task.clb_score >= 9
                    ? 'bg-success/15 text-success'
                    : task.clb_score >= 7
                      ? 'bg-primary/15 text-primary'
                      : task.clb_score >= 5
                        ? 'bg-warning/15 text-warning'
                        : 'bg-error/15 text-error'
                }`}
              >
                CLB {task.clb_score}
              </span>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {userText && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[.12em] mb-2 inline-flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    {isSpeak ? t('results.yourResponse') : t('results.whatYouWrote')}
                  </p>
                  <div className="bg-muted border border-border rounded-[10px] px-4 py-3 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                    <LookupText text={userText} />
                  </div>
                </div>
              )}

              {overallComment && (
                <div className="flex gap-3 bg-accent/[0.06] border border-accent/25 rounded-[10px] px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-accent" />
                  </div>
                  <p className="text-[13px] text-foreground leading-relaxed flex-1 self-center">
                    <LookupText text={overallComment} />
                  </p>
                </div>
              )}

              {criteriaEntries.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[.12em]">
                    {t('results.detailedBreakdown')}
                  </p>
                  <div className="flex flex-col gap-3">
                    {criteriaEntries.map(([critKey, crit]) => (
                      <CriterionRow
                        key={critKey}
                        name={critKey}
                        score={crit.score}
                        comment={crit.comment}
                      />
                    ))}
                  </div>
                </div>
              )}

              {task.model_answer && (
                <div>
                  <p className="text-[10px] font-bold text-accent uppercase tracking-[.12em] mb-2 inline-flex items-center gap-1.5">
                    <BookOpenCheck className="w-3 h-3" />
                    {t('results.modelAnswer')}
                  </p>
                  <div className="bg-success/[0.05] border border-success/25 rounded-[10px] px-4 py-3 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                    <LookupText text={task.model_answer} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CriterionRow ──────────────────────────────────────────────────────────────

interface CriterionRowProps {
  name: string;
  score: number;
  comment?: string;
}

function CriterionRow({ name, score, comment }: CriterionRowProps) {
  const label = name.replace(/_/g, ' ');
  return (
    <div className="border border-border rounded-[10px] p-3.5 flex flex-col gap-2 bg-card">
      <div className="flex items-center gap-3">
        <span className="text-[12.5px] font-bold text-foreground capitalize flex-1 min-w-0">
          {label}
        </span>
        <span
          className={`text-[12px] font-extrabold tabular-nums px-2 py-[2px] rounded-[6px] ${
            score >= 9
              ? 'bg-success/15 text-success'
              : score >= 7
                ? 'bg-primary/15 text-primary'
                : score >= 5
                  ? 'bg-warning/15 text-warning'
                  : 'bg-error/15 text-error'
          }`}
        >
          {score}
        </span>
      </div>
      {/* Horizontal scale bar spanning the 12-point CLB scale */}
      <div className="relative h-2 bg-border rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 start-0 rounded-full transition-all duration-500 ${clbBarColor(score)} ${CLB_WIDTH[score] ?? 'w-0'}`}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums px-0.5">
        <span>0</span>
        <span>6</span>
        <span>12</span>
      </div>
      {comment && (
        <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
          <LookupText text={comment} />
        </p>
      )}
    </div>
  );
}
