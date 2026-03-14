import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Loader2, BookOpen, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useWritingStore } from '../stores/writingStore';
import { TASK_TYPE_LABELS } from '../types';
import type { WritingPrompt, WritingTaskType } from '../types';

const TASK_TYPES: WritingTaskType[] = [
  'free',
  'essay',
  'email',
  'ielts_task1',
  'ielts_task2',
  'toefl_integrated',
  'toefl_independent',
  'delf',
  'goethe',
];

export function PromptsView() {
  const {
    prompts,
    isLoadingPrompts,
    isCreating,
    createPrompt,
    deletePrompt,
    startFromPrompt,
    goBack,
  } = useWritingStore();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<WritingTaskType>('essay');
  const [language, setLanguage] = useState('en');
  const [targetWords, setTargetWords] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return;
    await createPrompt({
      taskType,
      language,
      title: title.trim(),
      description: description.trim(),
      targetWords: targetWords ? parseInt(targetWords) : undefined,
      timeLimitMin: timeLimit ? parseInt(timeLimit) : undefined,
    });
    setTitle('');
    setDescription('');
    setTargetWords('');
    setTimeLimit('');
    setShowForm(false);
  };

  const handleStart = async (prompt: WritingPrompt) => {
    setStartingId(prompt.id);
    await startFromPrompt(prompt);
    setStartingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle>Writing Prompts</CardTitle>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            New Prompt
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* New prompt form */}
        {showForm && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prompt title"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write the prompt description / instructions..."
              className="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <div className="flex gap-2">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as WritingTaskType)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {TASK_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {TASK_TYPE_LABELS[tt]}
                  </option>
                ))}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
                <option value="fa">FA</option>
                <option value="ar">AR</option>
              </select>
              <Input
                value={targetWords}
                onChange={(e) => setTargetWords(e.target.value.replace(/\D/g, ''))}
                placeholder="Words"
                className="w-20"
              />
              <Input
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value.replace(/\D/g, ''))}
                placeholder="Min"
                className="w-20"
              />
              <Button onClick={handleCreate} disabled={!title.trim() || !description.trim()}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Prompts list */}
        {isLoadingPrompts ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : prompts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No prompts yet. Create one or they'll appear when available.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="flex items-start gap-3 rounded-lg border border-border p-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{prompt.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{prompt.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {TASK_TYPE_LABELS[prompt.taskType]}
                    </Badge>
                    <span>{prompt.language.toUpperCase()}</span>
                    {prompt.targetWords && <span>{prompt.targetWords} words</span>}
                    {prompt.timeLimitMin && <span>{prompt.timeLimitMin} min</span>}
                    {prompt.cefrLevel && <Badge className="text-xs">{prompt.cefrLevel}</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStart(prompt)}
                    disabled={isCreating && startingId === prompt.id}
                  >
                    {isCreating && startingId === prompt.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Start
                  </Button>
                  {!prompt.isBuiltin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePrompt(prompt.id)}
                      className="text-muted-foreground hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
