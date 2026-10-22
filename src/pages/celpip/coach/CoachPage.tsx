import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCoachReport } from './useCoach';
import { PANEL } from './components/shared';

/**
 * /exam/celpip/coach -> the newest report. A stable address that needs no id; a
 * replace, not a push, so Back returns to where the learner came from.
 */
export function CoachPage() {
  const { t } = useTranslation('exam');
  const navigate = useNavigate();
  const { examType = 'celpip' } = useParams<{ examType: string }>();
  const { data, isLoading } = useCoachReport(examType);
  const reportId = data?.report?.id;

  useEffect(() => {
    if (reportId) navigate(`/exam/${examType}/coach/${reportId}`, { replace: true });
  }, [reportId, navigate, examType]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      {isLoading || reportId ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <div className={`${PANEL} max-w-md p-6 text-center`}>
          <Compass className="mx-auto h-6 w-6 text-caption" />
          <h1 className="mt-3 text-[14px] font-bold text-foreground">{t('coach.pendingTitle')}</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {t('coach.noReportYet')}
          </p>
          <div className="mt-4">
            <Button asChild variant="accent" size="md">
              <Link to={`/exam/${examType}`}>{t('coach.backToExam')}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
