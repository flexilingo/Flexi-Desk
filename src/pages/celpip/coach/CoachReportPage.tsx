import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Compass,
  Languages,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { WordLookupProvider } from '../components/session/WordLookup';
import { getExamProfile } from '../examProfiles';
import type { CoachSkill } from './coachTypes';
import { useCoachReport, useCoachReportList, useMarkCoachRead } from './useCoach';
import { CoachHeader } from './components/CoachHeader';
import { CoachOverview } from './components/CoachOverview';
import { CoachPlanTab } from './components/CoachPlanTab';
import { SkillDeepDive } from './components/SkillDeepDive';
import { CoachReportHistory } from './components/CoachReportHistory';
import { GatedBanner, LockedSection } from './components/LockedSection';
import { PANEL, SKILLS, SKILL_TONE } from './components/shared';

// Literal classes - the content scanner cannot follow a concatenation.
const TAB_ACTIVE: Record<string, string> = {
  overview: 'border-primary',
  plan: 'border-primary',
  listening: 'border-success',
  reading: 'border-accent',
  writing: 'border-primary',
  speaking: 'border-warning',
};

/**
 * The full coach report: a header that says what it was written from, then tabs -
 * Overview, one per skill that has data, and the Plan. The body is prose in the
 * learner's own language (maybe right-to-left); every English artifact inside it
 * carries its own dir="ltr". The reports are written on the server; desk only
 * reads them. Marking read fires once the report has rendered.
 */
export function CoachReportPage() {
  const { t } = useTranslation('exam');
  const { t: tc, i18n } = useTranslation('celpip');
  const { examType = 'celpip', reportId } = useParams<{ examType: string; reportId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const email = useAuthStore((s) => s.session?.email);

  const { data, isLoading, errorCode, patch } = useCoachReport(examType, reportId);
  const { data: history } = useCoachReportList(examType);
  const hasHistory = (history?.reports?.length ?? 0) >= 2;

  const row = data?.report;
  // Pro readers may have the same report in a second language; `alt` is only ever
  // present when the server decided they are entitled to it.
  const alt = row?.report_alt ?? null;
  const altLocale = row?.report_alt_locale ?? null;
  const [showAlt, setShowAlt] = useState(false);
  const body = showAlt && alt ? alt : row?.report;
  const gated = Boolean(data?.gated);
  const canUpsell = data?.can_upsell !== false;
  const teaser = data?.teaser ?? {};
  const gatedSections = data?.gated_sections ?? [];
  const isLocked = (s: string) => gated && gatedSections.includes(s as never);

  useMarkCoachRead(row, (id, readAt) =>
    patch((d) => (d.report.id === id ? { ...d, report: { ...d.report, read_at: readAt } } : d)),
  );

  const skillsWithData = useMemo(() => SKILLS.filter((s) => Boolean(body?.skills?.[s])), [body]);
  const tabs = useMemo(() => ['overview', ...skillsWithData, 'plan'] as string[], [skillsWithData]);
  // Derived, not stored: a ?tab= for a skill this learner has no data for falls back to overview.
  const wanted = searchParams.get('tab') || 'overview';
  const tab = tabs.includes(wanted) ? wanted : 'overview';
  const selectTab = (next: string) => setSearchParams({ tab: next }, { replace: true });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (errorCode || !row || !body) {
    // The usual cause of a miss on an explicit id: the link came from an email for a
    // different account. Naming the account they are on makes the fix obvious.
    const wrongAccount = errorCode === 'COACH_REPORT_NOT_ON_THIS_ACCOUNT';
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
        <div className={`${PANEL} mx-auto max-w-xl p-6 text-center`}>
          <Compass className="mx-auto h-6 w-6 text-caption" />
          <p className="mt-3 text-[13px] font-semibold text-foreground">
            {tc(`errors.${errorCode ?? 'UNKNOWN_ERROR'}`, {
              defaultValue: tc('errors.UNKNOWN_ERROR'),
            })}
          </p>
          {wrongAccount && email && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {t('coach.signedInAs', { email })}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="outline" size="md">
              <Link to={`/exam/${examType}`}>{t('coach.backToExam')}</Link>
            </Button>
            {wrongAccount && (
              <Button asChild variant="accent" size="md">
                <Link to="/settings">{t('coach.switchAccount')}</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const dir = body.language?.dir === 'rtl' ? 'rtl' : 'ltr';
  const locale = i18n.language;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-5 md:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 sm:gap-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/exam/${examType}`}>
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {t('coach.backToExam')}
            </Link>
          </Button>
          <h1 className="text-[18px] font-bold text-foreground">{t('coach.pageTitle')}</h1>
        </div>

        {/* Every quoted passage is tap-to-translate: the report is full of words this learner did not know. */}
        <WordLookupProvider contentLang={getExamProfile(examType).contentLang}>
          <div dir={dir}>
            <div
              className={`grid items-start gap-4 sm:gap-5 ${hasHistory ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'}`}
            >
              <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
                <CoachHeader row={row} body={body} />

                {alt && altLocale && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Languages className="h-3.5 w-3.5 text-caption" />
                    {[
                      { on: false, code: row.report_locale ?? locale.split('-')[0] },
                      { on: true, code: altLocale },
                    ].map(({ on, code }) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setShowAlt(on)}
                        aria-pressed={showAlt === on}
                        className={`inline-flex items-center rounded-[7px] px-3 py-1 text-[12px] font-semibold transition-colors ${
                          showAlt === on
                            ? 'bg-primary/15 text-primary'
                            : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t(`coach.lang.${code}`)}
                      </button>
                    ))}
                  </div>
                )}

                <div className={`${PANEL} overflow-hidden`}>
                  <div className="flex overflow-x-auto border-b border-border">
                    {tabs.map((key) => {
                      const active = tab === key;
                      const tone = SKILLS.includes(key as CoachSkill)
                        ? SKILL_TONE[key as CoachSkill]
                        : null;
                      const Icon = tone?.icon ?? (key === 'plan' ? CalendarDays : LayoutGrid);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => selectTab(key)}
                          aria-current={active ? 'true' : undefined}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
                            active
                              ? `${TAB_ACTIVE[key] ?? 'border-primary'} text-foreground`
                              : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${active && tone ? tone.text : ''}`} />
                          {key === 'overview'
                            ? t('coach.tabOverview')
                            : key === 'plan'
                              ? t('coach.tabPlan')
                              : t(key)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {gated && <GatedBanner canUpsell={canUpsell} />}

                {tab === 'overview' && (
                  <>
                    <CoachOverview body={body} />
                    {isLocked('top_blockers') && (
                      <LockedSection
                        titleKey="coach.locked.blockersTitle"
                        detail={t('coach.locked.blockersBody', {
                          count: teaser.hidden_blockers ?? 0,
                        })}
                        canUpsell={canUpsell}
                      />
                    )}
                  </>
                )}
                {tab === 'plan' && (
                  <>
                    <CoachPlanTab body={body} />
                    {isLocked('action_plan_14_day') && (
                      <LockedSection
                        titleKey="coach.locked.planTitle"
                        detail={t('coach.locked.planBody', {
                          hidden: teaser.plan_days_hidden ?? 0,
                          total: teaser.plan_days_total ?? 14,
                        })}
                        canUpsell={canUpsell}
                      />
                    )}
                    {isLocked('grammar_syllabus') && (
                      <LockedSection
                        titleKey="coach.locked.grammarTitle"
                        detail={t('coach.locked.grammarBody', { count: teaser.grammar_items ?? 0 })}
                        canUpsell={canUpsell}
                      />
                    )}
                    {isLocked('vocabulary') && (
                      <LockedSection
                        titleKey="coach.locked.vocabTitle"
                        detail={t('coach.locked.vocabBody', {
                          count: teaser.vocabulary_words ?? 0,
                        })}
                        canUpsell={canUpsell}
                      />
                    )}
                  </>
                )}
                {SKILLS.includes(tab as CoachSkill) && body.skills?.[tab as CoachSkill] && (
                  <>
                    <SkillDeepDive
                      skill={tab as CoachSkill}
                      data={body.skills[tab as CoachSkill]!}
                      examType={examType}
                    />
                    {isLocked('skills') && (
                      <LockedSection
                        titleKey="coach.locked.skillsTitle"
                        detail={t('coach.locked.skillsBody', {
                          patterns: teaser.hidden_patterns ?? 0,
                          skills: teaser.hidden_skills ?? 0,
                        })}
                        canUpsell={canUpsell}
                      />
                    )}
                  </>
                )}

                {(data?.prev_id || data?.next_id) && (
                  <div className="flex items-center justify-between gap-3">
                    {data.prev_id ? (
                      <Button asChild variant="outline" size="md">
                        <Link to={`/exam/${examType}/coach/${data.prev_id}`}>
                          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                          {t('coach.previousReport')}
                        </Link>
                      </Button>
                    ) : (
                      <span />
                    )}
                    {data.next_id && (
                      <Button asChild variant="outline" size="md">
                        <Link to={`/exam/${examType}/coach/${data.next_id}`}>
                          {t('coach.nextReport')}
                          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {hasHistory && (
                <aside className="xl:sticky xl:top-6">
                  <CoachReportHistory examType={examType} currentId={row.id} />
                </aside>
              )}
            </div>
          </div>
        </WordLookupProvider>
      </div>
    </div>
  );
}
