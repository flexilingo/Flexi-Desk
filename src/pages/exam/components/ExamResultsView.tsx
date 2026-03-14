import { ArrowLeft, BarChart3, Clock, CheckCircle2, XCircle, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useExamStore } from '../stores/examStore';
import {
  EXAM_TYPE_LABELS,
  QUESTION_TYPE_LABELS,
  formatExamElapsed,
  examScoreColor,
  examScoreBg,
} from '../types';

export function ExamResultsView() {
  const { activeSession, questions, goBack } = useExamStore();

  if (!activeSession) return null;

  const answered = questions.filter((q) => q.userAnswer != null);
  const correct = questions.filter((q) => q.isCorrect === true);
  const incorrect = questions.filter((q) => q.isCorrect === false);
  const totalScore = answered.reduce((sum, q) => sum + (q.score ?? 0), 0);
  const maxScore = answered.reduce((sum, q) => sum + q.maxScore, 0);
  const accuracy = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  // Group by section
  const sections: Record<number, typeof questions> = {};
  questions.forEach((q) => {
    if (!sections[q.sectionIndex]) sections[q.sectionIndex] = [];
    sections[q.sectionIndex].push(q);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate">{activeSession.title}</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <Badge variant="secondary" className="text-xs">
                  {EXAM_TYPE_LABELS[activeSession.examType]}
                </Badge>
                <span>{activeSession.language.toUpperCase()}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatExamElapsed(activeSession.elapsedSeconds)}
                </span>
              </div>
            </div>
            {activeSession.bandScore && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground">Band</span>
                <span className="text-2xl font-bold text-foreground">
                  {activeSession.bandScore}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Score overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Results Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className={`flex flex-col items-center rounded-lg p-4 ${examScoreBg(accuracy)}`}>
              <span className={`text-2xl font-bold ${examScoreColor(accuracy)}`}>
                {accuracy.toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground mt-1">Score</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-border p-4">
              <span className="text-2xl font-bold text-foreground">{answered.length}</span>
              <span className="text-xs text-muted-foreground mt-1">Answered</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-border p-4">
              <span className="text-2xl font-bold text-[#8BB7A3]">{correct.length}</span>
              <span className="text-xs text-muted-foreground mt-1">Correct</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-border p-4">
              <span className="text-2xl font-bold text-error">{incorrect.length}</span>
              <span className="text-xs text-muted-foreground mt-1">Incorrect</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Question review */}
      {Object.entries(sections).map(([sectionIdx, sectionQuestions]) => (
        <Card key={sectionIdx}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">
                Section {Number(sectionIdx) + 1}
                <span className="ml-2 text-muted-foreground font-normal">
                  ({sectionQuestions.filter((q) => q.isCorrect === true).length}/
                  {sectionQuestions.length} correct)
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionQuestions.map((q, i) => (
              <div
                key={q.id}
                className={`rounded-lg border p-3 ${
                  q.isCorrect === true
                    ? 'border-[#8BB7A3]/30 bg-[#8BB7A3]/5'
                    : q.isCorrect === false
                      ? 'border-error/30 bg-error/5'
                      : 'border-border'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {q.isCorrect === true ? (
                      <CheckCircle2 className="h-4 w-4 text-[#8BB7A3]" />
                    ) : q.isCorrect === false ? (
                      <XCircle className="h-4 w-4 text-error" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Q{i + 1}</span>
                      <Badge variant="secondary" className="text-xs">
                        {QUESTION_TYPE_LABELS[q.questionType]}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground">{q.prompt}</p>
                    {q.userAnswer && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Your answer: </span>
                        <span
                          className={
                            q.isCorrect === false ? 'text-error line-through' : 'text-foreground'
                          }
                        >
                          {q.userAnswer}
                        </span>
                      </p>
                    )}
                    {q.isCorrect === false && q.correctAnswer && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Correct: </span>
                        <span className="text-[#8BB7A3] font-medium">{q.correctAnswer}</span>
                      </p>
                    )}
                    {q.feedback && (
                      <p className="text-xs text-muted-foreground italic">{q.feedback}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
