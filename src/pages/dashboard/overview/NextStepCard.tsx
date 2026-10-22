import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, GraduationCap, Headphones, Layers, Library, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { examName, examFamily, SHORT_PRACTICE, type ExamKey, type Skill } from './exam';
import {
  BookFallback,
  DeckStackArt,
  IconArt,
  LoadingButton,
  OverviewCard,
  RemoteImage,
  isolate,
} from './parts';
import { startExamPractice } from './services';
import type { NextStep } from './model';
import { useStartStudy } from './useStartStudy';
import type { OverviewData } from './useOverviewData';

const chipClass =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60';

/**
 * The one thing to do now (the page's only filled button) and, under it, the
 * two things after it as quiet chips. The steps are ranked in model.ts.
 */
export function NextStepCard({ data, quiet = false }: { data: OverviewData; quiet?: boolean }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'home.next' });
  const { t: tSkills } = useTranslation('dashboard', { keyPrefix: 'examWeek.skills' });
  const navigate = useNavigate();
  const { startStudy, starting, startError } = useStartStudy();
  const [practising, setPractising] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  const [hero, ...after] = data.steps;
  if (!hero) return null;
  // While an exam panel above is asking its question, that panel holds the
  // screen's one filled button and this one steps back.
  const cta = quiet ? 'outline' : 'default';
  const skillName = (exam: ExamKey, skill: Skill) => tSkills(`${examFamily(exam)}.${skill}`);

  const practise = async (exam: ExamKey, skill: Skill) => {
    if (practising) return;
    setPractising(true);
    setPracticeError(null);
    try {
      const result = await startExamPractice({
        exam_type: exam,
        sections: { [skill]: SHORT_PRACTICE[examFamily(exam)][skill] },
      });
      navigate(`/celpip/session/${result.session_id}`);
    } catch {
      setPractising(false);
      setPracticeError(t('error'));
    }
  };

  let eyebrow: string;
  let title: string;
  let why: string;
  let action: ReactNode;
  let art: ReactNode;

  switch (hero.kind) {
    case 'practice':
      eyebrow = t('eyebrowExam', { exam: data.exam?.name ?? examName(hero.exam) });
      title = t('practice.title', { skill: skillName(hero.exam, hero.skill) });
      why = hero.tried ? t('practice.whyLowest') : t('practice.whyUntried');
      action = (
        <LoadingButton
          size="lg"
          variant={cta}
          loading={practising}
          onClick={() => practise(hero.exam, hero.skill)}
        >
          {!practising && <Play className="h-4 w-4" />}
          {t('practice.cta')}
        </LoadingButton>
      );
      art = <IconArt kind="exam" />;
      break;
    case 'review':
      eyebrow = t('eyebrowMinutes', { count: hero.minutes });
      title = t('review.title', { count: hero.due });
      why = t('review.why');
      action = (
        <LoadingButton
          size="lg"
          variant={cta}
          loading={starting === 'all'}
          onClick={() => startStudy()}
        >
          {starting !== 'all' && <Play className="h-4 w-4" />}
          {t('review.cta')}
        </LoadingButton>
      );
      art = <DeckStackArt label={hero.due > 999 ? '999+' : hero.due.toLocaleString()} />;
      break;
    case 'episode':
      eyebrow = t('eyebrowMinutesLeft', { count: hero.minutesLeft });
      title = t('episode.title', { title: isolate(hero.episode.title) });
      why = t('episode.why');
      action = (
        <Button size="lg" variant={cta} asChild className="inline-flex">
          <Link to={hero.href}>
            <Play className="h-4 w-4" />
            {t('episode.cta')}
          </Link>
        </Button>
      );
      art = (
        <div className="h-[150px] w-[150px] shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          <RemoteImage
            src={hero.episode.image_url}
            fallback={<IconArt kind="listen" size={150} />}
          />
        </div>
      );
      break;
    case 'book': {
      const { item } = hero;
      eyebrow = t('eyebrowReading');
      title = t('book.title', { title: isolate(item.title) });
      why = item.pageCount
        ? t('book.page', { page: item.page, total: item.pageCount })
        : t('book.pageOnly', { page: item.page });
      action = (
        <Button size="lg" variant={cta} asChild className="inline-flex">
          <Link to={item.href}>
            <BookOpen className="h-4 w-4" />
            {t('book.cta')}
          </Link>
        </Button>
      );
      art = item.cover ? (
        <div className="h-[150px] w-[112px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          <RemoteImage src={item.cover.path} fallback={<BookFallback />} />
        </div>
      ) : (
        <IconArt kind="listen" />
      );
      break;
    }
    default:
      eyebrow = t('eyebrowFirst');
      title = t('start.title');
      why = t('start.why');
      action = (
        <Button size="lg" variant={cta} asChild className="inline-flex">
          <Link to="/podcast">
            <Headphones className="h-4 w-4" />
            {t('start.cta')}
          </Link>
        </Button>
      );
      art = <IconArt kind="listen" />;
  }

  const chipFor = (step: NextStep) => {
    switch (step.kind) {
      case 'practice':
        return (
          <button
            key="practice"
            type="button"
            className={chipClass}
            onClick={() => practise(step.exam, step.skill)}
            disabled={practising}
          >
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {t('chip.practice', { skill: skillName(step.exam, step.skill) })}
            </span>
          </button>
        );
      case 'review':
        return (
          <button
            key="review"
            type="button"
            className={chipClass}
            onClick={() => startStudy()}
            disabled={starting !== null}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('chip.review', { count: step.due })}</span>
          </button>
        );
      case 'episode':
        return (
          <Link key={`ep-${step.episode.id}`} to={step.href} className={chipClass}>
            <Headphones className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {t('chip.episode', { title: isolate(step.episode.title), count: step.minutesLeft })}
            </span>
          </Link>
        );
      case 'book':
        return (
          <Link key={step.item.id} to={step.item.href} className={chipClass}>
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('chip.book', { title: isolate(step.item.title) })}</span>
          </Link>
        );
      case 'library':
        return (
          <Link key="library" to="/reader/library" className={chipClass}>
            <Library className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('chip.library')}</span>
          </Link>
        );
      case 'examHub':
        return (
          <Link key="exam" to="/celpip" className={chipClass}>
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t('chip.exam')}</span>
          </Link>
        );
      default:
        return null;
    }
  };

  return (
    <OverviewCard
      labelledBy="next-step-title"
      className="flex min-h-[300px] items-center gap-6 p-5 sm:p-6"
    >
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Clock className="h-3.5 w-3.5" />
          {eyebrow}
        </span>
        <h2
          id="next-step-title"
          className="mt-1.5 text-xl font-bold leading-snug text-foreground sm:text-2xl"
        >
          {title}
        </h2>
        <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">{why}</p>
        <div className="mt-4">{action}</div>
        {(startError || practiceError) && (
          <div className="mt-3">
            <InlineError message={(practiceError ?? startError) as string} />
          </div>
        )}
        {after.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{t('after')}</span>
            {after.map(chipFor)}
          </div>
        )}
      </div>
      <div className="hidden sm:block">{art}</div>
    </OverviewCard>
  );
}
