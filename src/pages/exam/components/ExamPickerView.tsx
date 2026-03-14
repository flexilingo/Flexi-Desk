import { GraduationCap, ChevronRight, History, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useExamStore } from '../stores/examStore';
import { EXAM_TYPE_LABELS, EXAM_TYPE_DESCRIPTIONS, examScoreColor } from '../types';
import type { ExamType, ExamHistory } from '../types';

const EXAM_TYPES: ExamType[] = [
  'ielts',
  'toefl',
  'delf',
  'goethe',
  'dele',
  'hsk',
  'jlpt',
  'custom',
];

const EXAM_ICONS: Record<ExamType, string> = {
  ielts: 'EN',
  toefl: 'EN',
  delf: 'FR',
  goethe: 'DE',
  dele: 'ES',
  hsk: 'ZH',
  jlpt: 'JP',
  custom: '?',
};

export function ExamPickerView() {
  const { history, setView, fetchSessions } = useExamStore();

  const historyMap = history.reduce<Record<string, ExamHistory>>((acc, h) => {
    acc[h.examType] = h;
    return acc;
  }, {});

  const handleSelectExam = (examType: ExamType) => {
    fetchSessions(examType);
    setView('sessions');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Exam Simulator</CardTitle>
              <CardDescription>Practice mock exams with AI-powered scoring</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* History summary */}
        {history.length > 0 && (
          <div className="flex items-center gap-4 rounded-lg border border-border p-4">
            <History className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {history.reduce((sum, h) => sum + h.totalAttempts, 0)} exams taken
              </p>
              <p className="text-xs text-muted-foreground">
                Best scores across {history.length} exam type{history.length !== 1 ? 's' : ''}
              </p>
            </div>
            {history.some((h) => h.bestBand) && (
              <div className="flex items-center gap-1">
                <Trophy className="h-4 w-4 text-[#C58C6E]" />
                <span className="text-sm font-medium text-foreground">
                  {history.find((h) => h.bestBand)?.bestBand}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Exam type grid */}
        <div className="grid grid-cols-2 gap-3">
          {EXAM_TYPES.map((type) => {
            const hist = historyMap[type];
            return (
              <button
                key={type}
                onClick={() => handleSelectExam(type)}
                className="group flex items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                  {EXAM_ICONS[type]}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{EXAM_TYPE_LABELS[type]}</p>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {EXAM_TYPE_DESCRIPTIONS[type]}
                  </p>
                  {hist && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {hist.totalAttempts} attempt{hist.totalAttempts !== 1 ? 's' : ''}
                      </span>
                      <span className={`font-medium ${examScoreColor(hist.bestScore)}`}>
                        Best: {hist.bestScore.toFixed(0)}%
                      </span>
                      {hist.bestBand && <Badge className="text-xs">{hist.bestBand}</Badge>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
