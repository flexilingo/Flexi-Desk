import { Headphones } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { PODCAST_TABS, TAB_LABEL, podcastTabPath, type PodcastTab } from '../utils/podcastTabs';

/**
 * The website's podcasts page head: the dashboard page header, then the Browse / Saved / Saved
 * episodes / History tab strip (an underline strip, terra on the open tab). "My feeds" is desk's own
 * tab for subscriptions kept on this computer.
 */
export function PodcastPageHeader({ active }: { active: PodcastTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Headphones}
        title={t('podcastUi:hubPageTitle')}
        subtitle={t('podcastUi:hubPageSubtitle')}
        className="mb-0"
      />
      <div role="tablist" className="flex overflow-x-auto border-b border-border">
        {PODCAST_TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => !isActive && navigate(podcastTabPath(tab))}
              className={cn(
                '-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-caption hover:text-muted-foreground',
              )}
            >
              {t(TAB_LABEL[tab])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
