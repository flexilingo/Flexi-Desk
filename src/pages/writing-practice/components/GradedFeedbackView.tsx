import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookA,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Lightbulb,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatTime, getMaxScore } from '../lib/session';
import type { ErrorHighlight, WritingSession } from '../lib/types';

type T = TFunction<'writingPractice'>;

function scoreText(score: number, examType: string) {
  return examType.startsWith('ielts') ? score.toFixed(1) : String(Math.round(score));
}

export function GradedFeedbackView({ session }: { session: WritingSession }) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('writingPractice');
  const [showRewritten, setShowRewritten] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const maxScore = getMaxScore(session.exam_type);
  const feedback = session.feedback;
  const errorCount = feedback?.error_highlights?.length || 0;
  const suggestionsCount = feedback?.suggestions?.length || 0;
  const meta = feedback?.grading_meta;
  const own = meta?.origin === 'device' || meta?.origin === 'own_key';
  const advanced = meta?.quality === 'advanced';
  const vocab = feedback?.vocabulary_analysis;

  const badgeKey = own ? 'own' : advanced ? 'pro' : 'mini';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/writing-practice')}
          className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t('backToList')}
        </button>
        <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-[3px] text-[11.5px] font-semibold text-success">
          <CheckCircle className="h-3 w-3" />
          {t('status.graded')}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="bg-gradient-to-br from-accent/[0.06] to-success/[0.06] p-6 md:p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start md:gap-8">
            <ScoreGauge
              score={session.overall_score || 0}
              maxScore={maxScore}
              examType={session.exam_type}
            />
            <div className="min-w-0 flex-1 space-y-3 text-center sm:text-start">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="inline-flex items-center rounded-lg bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground">
                    {t(`examTypes.${session.exam_type}`)}
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                          advanced || own
                            ? 'bg-success/15 text-success hover:bg-success/25'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        {(advanced || own) && <Sparkles className="h-3 w-3" />}
                        {t(`feedback.badge.${badgeKey}`)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 text-sm" side="bottom" align="start">
                      <div className="space-y-2">
                        <p className="text-[13px] font-bold text-foreground">
                          {t(`feedback.badgeTitle.${badgeKey}`)}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t(`feedback.badgeBody.${badgeKey}`, { model: meta?.model ?? '' })}
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {meta?.double_graded && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-primary-light/10 px-2.5 py-1 text-[11.5px] font-semibold text-primary-light">
                      <ShieldCheck className="h-3 w-3" />
                      {t('feedback.doubleChecked')}
                    </span>
                  )}
                </div>
                <h1 className="break-words text-lg font-extrabold leading-tight tracking-tight text-foreground sm:text-xl">
                  {session.prompt?.topic || t(`examTypes.${session.exam_type}`)}
                </h1>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground sm:justify-start">
                <span className="flex items-center gap-1">
                  <PenLine className="h-3 w-3" />
                  {session.word_count} {t('history.wordsWritten')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(session.time_spent_seconds || 0)}
                </span>
                {session.graded_at && (
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    {new Date(session.graded_at).toLocaleDateString(i18n.language)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="-mt-2 text-center text-[11px] text-muted-foreground/80">
        {t('feedback.scoreDisclaimer')}
      </p>

      {session.criteria_scores && (
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="mb-4 text-[15px] font-bold text-foreground">{t('feedback.criteria')}</h2>
          <div className="space-y-3">
            {Object.entries(session.criteria_scores).map(([name, score]) => (
              <CriteriaBar
                key={name}
                name={name}
                score={score}
                maxScore={maxScore}
                examType={session.exam_type}
              />
            ))}
          </div>
        </div>
      )}

      {vocab && (
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="mb-4 inline-flex items-center gap-2 text-[15px] font-bold text-foreground">
            <BookA className="h-4 w-4 text-accent" />
            {t('feedback.vocabularyAnalysis')}
          </h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground">
              {t('feedback.estimatedCEFR')}: {vocab.estimated_cefr}
            </span>
            <span className="inline-flex items-center rounded-lg bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent">
              {t('feedback.lexicalDiversity')}: {(vocab.lexical_diversity * 100).toFixed(0)}%
            </span>
          </div>
          {vocab.advanced_words?.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-accent/70">
                {t('feedback.advancedWords')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {vocab.advanced_words.map((word, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md bg-success/15 px-2 py-[3px] text-[11.5px] font-semibold text-success"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
          {vocab.suggested_upgrades?.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-accent/70">
                {t('feedback.suggestedUpgrades')}
              </p>
              <div className="space-y-1.5">
                {vocab.suggested_upgrades.map((u, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="text-muted-foreground">{u.original}</span>
                    <ArrowRight className="h-3 w-3 text-accent rtl:rotate-180" />
                    <span className="font-bold text-success">{u.upgrade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {feedback?.summary && (
        <div className="rounded-xl border border-s-[3px] border-border border-s-accent bg-card p-5">
          <p className="text-[13px] leading-relaxed text-foreground/85">{feedback.summary}</p>
        </div>
      )}

      {feedback && (
        <Tabs defaultValue="strengths" className="w-full">
          <TabsList className="h-11 w-full">
            <TabsTrigger value="strengths" className="flex-1">
              <CheckCircle />
              {t('feedback.strengths')}
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex-1">
              <XCircle />
              {t('feedback.errors')}
              {errorCount > 0 && (
                <span className="rounded-full bg-error/15 px-1.5 py-px text-[10px] tabular-nums text-error">
                  {errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex-1">
              <Lightbulb />
              {t('feedback.suggestions')}
              {suggestionsCount > 0 && (
                <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10px] tabular-nums text-accent/80">
                  {suggestionsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="strengths" className="mt-4 space-y-4">
            {feedback.strengths?.length > 0 && (
              <FeedbackSection
                tone="success"
                title={t('feedback.strengths')}
                items={feedback.strengths}
                Bullet={CheckCircle}
              />
            )}
            {feedback.weaknesses?.length > 0 && (
              <FeedbackSection
                tone="warning"
                title={t('feedback.weaknesses')}
                items={feedback.weaknesses}
                Bullet={AlertTriangle}
              />
            )}
          </TabsContent>

          <TabsContent value="errors" className="mt-4">
            {feedback.error_highlights?.length > 0 ? (
              <div className="space-y-3">
                {feedback.error_highlights.map((e, i) => (
                  <ErrorCard key={i} error={e} t={t} />
                ))}
              </div>
            ) : (
              <EmptyPanel icon={CheckCircle} tone="text-success" text={t('feedback.noErrors')} />
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="mt-4">
            {feedback.suggestions?.length > 0 ? (
              <FeedbackSection
                tone="primary"
                title={t('feedback.suggestions')}
                items={feedback.suggestions}
                Bullet={Lightbulb}
              />
            ) : (
              <EmptyPanel
                icon={Lightbulb}
                tone="text-muted-foreground"
                text={t('feedback.noSuggestions')}
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      {session.ai_rewritten_version && (
        <Collapsible
          open={showRewritten}
          onToggle={() => setShowRewritten(!showRewritten)}
          icon={Sparkles}
          iconBox="bg-success/15"
          iconTone="text-success"
          title={t('feedback.rewritten')}
        >
          <p className="mb-2 text-[11.5px] text-muted-foreground">
            {t('feedback.rewrittenDescription')}
          </p>
          <div className="whitespace-pre-wrap rounded-xl border border-success/25 bg-success/[0.08] p-5 text-[13.5px] leading-relaxed text-foreground">
            {session.ai_rewritten_version}
          </div>
        </Collapsible>
      )}

      {session.essay_text && (
        <Collapsible
          open={showOriginal}
          onToggle={() => setShowOriginal(!showOriginal)}
          icon={FileText}
          iconBox="bg-muted"
          iconTone="text-muted-foreground"
          title={t('feedback.original')}
        >
          <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-5 text-[13.5px] leading-relaxed text-foreground/85">
            {session.essay_text}
          </div>
        </Collapsible>
      )}

      <div>
        <Button variant="default" onClick={() => navigate('/writing-practice')}>
          <RotateCcw />
          {t('newSession')}
        </Button>
      </div>
    </div>
  );
}

function Collapsible({
  open,
  onToggle,
  icon: Icon,
  iconBox,
  iconTone,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: LucideIcon;
  iconBox: string;
  iconTone: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start transition-colors hover:bg-accent/[0.04]"
      >
        <span className="flex items-center gap-2.5">
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBox)}>
            <Icon className={cn('h-4 w-4', iconTone)} />
          </span>
          <span className="text-[13.5px] font-bold text-foreground">{title}</span>
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function EmptyPanel({ icon: Icon, tone, text }: { icon: LucideIcon; tone: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card py-10 text-center">
      <Icon className={cn('mx-auto mb-2 h-8 w-8', tone)} />
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

function ScoreGauge({
  score,
  maxScore,
  examType,
}: {
  score: number;
  maxScore: number;
  examType: string;
}) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const stroke =
    percentage >= 70 ? 'stroke-success' : percentage >= 40 ? 'stroke-accent' : 'stroke-error';
  const text =
    percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-accent/80' : 'text-error';
  return (
    <div
      className="relative h-36 w-36 shrink-0"
      role="img"
      aria-label={`${scoreText(score, examType)} / ${maxScore}`}
    >
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" className="stroke-muted" strokeWidth="8" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          className={cn('transition-all duration-1000 ease-out', stroke)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-[34px] font-extrabold tabular-nums', text)}>
          {scoreText(score, examType)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">/ {maxScore}</span>
      </div>
    </div>
  );
}

function CriteriaBar({
  name,
  score,
  maxScore,
  examType,
}: {
  name: string;
  score: number;
  maxScore: number;
  examType: string;
}) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const bar =
    percentage >= 70
      ? '[&::-webkit-progress-value]:bg-success [&::-moz-progress-bar]:bg-success'
      : percentage >= 40
        ? '[&::-webkit-progress-value]:bg-accent/70 [&::-moz-progress-bar]:bg-accent/70'
        : '[&::-webkit-progress-value]:bg-error [&::-moz-progress-bar]:bg-error';
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        <span className="text-[13px] font-bold tabular-nums">
          {scoreText(score, examType)}
          <span className="font-normal text-muted-foreground">/{maxScore}</span>
        </span>
      </div>
      <progress
        max={100}
        value={percentage}
        aria-label={label}
        className={cn(
          'block h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted',
          bar,
        )}
      />
    </div>
  );
}

const SECTION = {
  success: {
    border: 'border-success/40',
    text: 'text-success',
    bg: 'bg-success/[0.08]',
    bullet: 'bg-success/15 text-success',
  },
  warning: {
    border: 'border-warning/40',
    text: 'text-accent/80',
    bg: 'bg-warning/[0.06]',
    bullet: 'bg-warning/25 text-accent/80',
  },
  primary: {
    border: 'border-accent/25',
    text: 'text-accent',
    bg: 'bg-accent/[0.04]',
    bullet: 'bg-accent/15 text-accent',
  },
} as const;

function FeedbackSection({
  tone,
  title,
  items,
  Bullet,
}: {
  tone: keyof typeof SECTION;
  title: string;
  items: string[];
  Bullet: LucideIcon;
}) {
  const s = SECTION[tone];
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', s.border)}>
      <div className={cn('px-5 py-3', s.bg)}>
        <h3 className={cn('text-[13px] font-bold', s.text)}>{title}</h3>
      </div>
      <ul className="space-y-2.5 p-5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] text-foreground/85">
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                s.bullet,
              )}
            >
              <Bullet className="h-2.5 w-2.5" />
            </span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ERROR_STYLE: Record<string, { border: string; bg: string; badge: string }> = {
  grammar: { border: 'border-error/30', bg: 'bg-error/5', badge: 'bg-error/15 text-error' },
  vocabulary: {
    border: 'border-warning/40',
    bg: 'bg-warning/[0.06]',
    badge: 'bg-warning/15 text-accent/80',
  },
  spelling: {
    border: 'border-accent/25',
    bg: 'bg-accent/[0.04]',
    badge: 'bg-accent/15 text-accent',
  },
  punctuation: {
    border: 'border-primary-light/25',
    bg: 'bg-primary-light/[0.04]',
    badge: 'bg-primary-light/15 text-primary-light',
  },
};

function ErrorCard({ error, t }: { error: ErrorHighlight; t: T }) {
  const style = ERROR_STYLE[error.type] ?? ERROR_STYLE.grammar;
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', style.border)}>
      <div className={cn('border-b px-4 py-2.5', style.bg, style.border)}>
        <span
          className={cn(
            'inline-flex items-center rounded-md px-2 py-[3px] text-[10.5px] font-semibold',
            style.badge,
          )}
        >
          {t(`feedback.errorTypes.${error.type}`, {
            defaultValue: t('feedback.errorTypes.grammar'),
          })}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0 text-error" />
          <span className="text-[13px] text-error line-through">{error.text}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="text-[13px] font-semibold text-success">{error.correction}</span>
        </div>
        {error.explanation && (
          <p className="mt-2 ps-5 text-xs leading-relaxed text-muted-foreground">
            {error.explanation}
          </p>
        )}
      </div>
    </div>
  );
}
