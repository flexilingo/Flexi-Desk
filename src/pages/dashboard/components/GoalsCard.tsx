import { useState } from 'react';
import { Target, Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useDashboardStore } from '../stores/dashboardStore';
import { GOAL_TYPE_LABELS, GOAL_TYPE_UNITS } from '../types';
import type { Goal, GoalType, GoalPeriod } from '../types';

const GOAL_TYPES: GoalType[] = ['daily_minutes', 'daily_words', 'daily_reviews', 'weekly_sessions'];

export function GoalsCard() {
  const { goals, createGoal, deleteGoal } = useDashboardStore();
  const [showForm, setShowForm] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('daily_minutes');
  const [target, setTarget] = useState('30');
  const [period, setPeriod] = useState<GoalPeriod>('daily');

  const handleCreate = async () => {
    const val = parseInt(target);
    if (!val || val <= 0) return;
    await createGoal(goalType, val, period);
    setShowForm(false);
    setTarget('30');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Goals</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {GOAL_TYPES.map((gt) => (
                <option key={gt} value={gt}>
                  {GOAL_TYPE_LABELS[gt]}
                </option>
              ))}
            </select>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
              className="w-16 text-xs"
              placeholder="Target"
            />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
              className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <Button size="sm" onClick={handleCreate} className="h-7 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}

        {goals.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            No goals set. Add one to track your progress.
          </p>
        ) : (
          goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} onDelete={() => deleteGoal(goal.id)} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function GoalRow({ goal, onDelete }: { goal: Goal; onDelete: () => void }) {
  const progress =
    goal.targetValue > 0 ? Math.min((goal.currentValue / goal.targetValue) * 100, 100) : 0;
  const isComplete = progress >= 100;
  const unit = GOAL_TYPE_UNITS[goal.goalType];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isComplete ? 'bg-[#8BB7A3]/20' : 'bg-muted'}`}
      >
        {isComplete ? (
          <Check className="h-3.5 w-3.5 text-[#8BB7A3]" />
        ) : (
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground truncate">
            {GOAL_TYPE_LABELS[goal.goalType]}
          </span>
          <span className="text-muted-foreground">
            {goal.currentValue}/{goal.targetValue} {unit}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isComplete ? 'bg-[#8BB7A3]' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-error transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
