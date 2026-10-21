import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import type { SectionResult, ListeningContent, ReadingContent } from '../types';
import { LookupText } from '../components/session/WordLookup';
import { CLB_WIDTH, clbTextColor, clbBarColor } from './shared';

interface McqResultTabProps {
  result: SectionResult;
  examContent: ListeningContent | ReadingContent | null | undefined;
  yourAnswerLabel: string;
}

export function McqResultTab({ result, examContent, yourAnswerLabel }: McqResultTabProps) {
  const { t } = useTranslation('celpip');
  const [activePart, setActivePart] = useState(0);
  const userAnswers = (result.answers || {}) as Record<string, number>;

  // Correctness is keyed by the answer's array position (`part_{pi}_q_{qi}`),
  // matching exactly how the exam engine records selections.
  let correctCount = 0;
  let totalCount = 0;
  if (examContent) {
    for (let pi = 0; pi < examContent.parts.length; pi++) {
      const part = examContent.parts[pi];
      for (let qi = 0; qi < part.questions.length; qi++) {
        totalCount++;
        const key = `part_${pi}_q_${qi}`;
        const userChoice = userAnswers[key];
        if (userChoice !== undefined && userChoice === part.questions[qi].correct_index) {
          correctCount++;
        }
      }
    }
  }
  const accuracyPct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Score summary */}
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
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {correctCount} / {totalCount}
            </span>
            <span className="text-muted-foreground tabular-nums">{accuracyPct}%</span>
          </div>
          <div className="h-2.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${clbBarColor(result.clb_score)} ${
                result.clb_score != null ? (CLB_WIDTH[result.clb_score] ?? 'w-0') : 'w-0'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Part sub-tabs — one part visible at a time so long sections stay scannable */}
      {examContent && examContent.parts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {examContent.parts.map((part, pi) => {
            const partCorrect = part.questions.filter((q, qi) => {
              const key = `part_${pi}_q_${qi}`;
              return userAnswers[key] === q.correct_index;
            }).length;
            const allCorrect = partCorrect === part.questions.length;
            const isActive = activePart === pi;
            return (
              <button
                key={pi}
                onClick={() => setActivePart(pi)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {t('part')} {pi + 1}
                <span
                  className={`text-[10.5px] tabular-nums font-bold px-1.5 py-[1px] rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : allCorrect
                        ? 'bg-success/15 text-success'
                        : 'bg-error/10 text-error'
                  }`}
                >
                  {partCorrect}/{part.questions.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {examContent?.parts.map((part, pi) => {
        if (pi !== activePart) return null;
        const partCorrect = part.questions.filter((q, qi) => {
          const key = `part_${pi}_q_${qi}`;
          return userAnswers[key] === q.correct_index;
        }).length;
        return (
          <div key={pi} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-[10.5px] font-bold uppercase tracking-[.12em] text-accent">
                {t('part')} {pi + 1}
              </h3>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                · {partCorrect}/{part.questions.length}
              </span>
              <span className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2.5">
              {part.questions.map((q, qi) => {
                const key = `part_${pi}_q_${qi}`;
                const userChoice = userAnswers[key];
                const answered = userChoice !== undefined;
                const correct = answered && userChoice === q.correct_index;
                return (
                  <div
                    key={qi}
                    className={`rounded-[12px] border-l-[3px] p-4 transition-shadow ${
                      correct
                        ? 'bg-success/[0.05] border-l-success border border-success/20'
                        : 'bg-error/[0.04] border-l-error border border-error/20'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                          correct ? 'bg-success/20 text-success' : 'bg-error/15 text-error'
                        }`}
                      >
                        {correct ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <p className="text-[13.5px] text-foreground leading-relaxed flex-1">
                        <span className="font-bold text-muted-foreground me-1.5 tabular-nums">
                          {qi + 1}.
                        </span>
                        <LookupText text={q.question} />
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {q.options.map((opt, oi) => {
                        const isCorrect = oi === q.correct_index;
                        const isUserWrong = answered && oi === userChoice && !correct;
                        return (
                          <div
                            key={oi}
                            className={`text-[12px] px-3 py-2 rounded-[8px] flex items-center gap-2 ${
                              isCorrect
                                ? 'bg-success/[0.10] text-success font-semibold border border-success/30'
                                : isUserWrong
                                  ? 'bg-error/10 text-error border border-error/30'
                                  : 'text-muted-foreground bg-muted border border-border'
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                                isCorrect
                                  ? 'bg-success text-white'
                                  : isUserWrong
                                    ? 'bg-error text-white'
                                    : 'bg-border text-muted-foreground'
                              }`}
                            >
                              {isCorrect ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : isUserWrong ? (
                                <XCircle className="w-3 h-3" />
                              ) : (
                                <Circle className="w-2.5 h-2.5" />
                              )}
                            </span>
                            <span className="flex-1 min-w-0">
                              <LookupText text={opt} />
                            </span>
                            {isUserWrong && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold opacity-70">
                                {yourAnswerLabel}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
