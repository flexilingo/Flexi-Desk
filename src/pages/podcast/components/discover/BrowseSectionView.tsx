import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Flame,
  Heart,
  GraduationCap,
  Newspaper,
  Palette,
  FlaskConical,
  Globe,
  Cpu,
  Briefcase,
  BookOpen,
  Trophy,
  Music,
  Laugh,
  Baby,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { useDiscoverStore } from '../../stores/discoverStore';
import { PodcastTileGrid } from '../hub/PodcastTileCard';
import { HubPager } from '../hub/HubPager';
import type { CuratedPodcast, PodcastIndexFeed } from '../../types';
import type { LucideIcon } from 'lucide-react';

const PAGE_SIZE = 24;

interface SectionConfig {
  /** Namespace-qualified i18n key of the heading. */
  titleKey: string;
  icon: LucideIcon;
}

const SECTION_MAP: Record<string, SectionConfig> = {
  trending: { titleKey: 'common:podcast.trendingNow', icon: Flame },
  followed: { titleKey: 'podcastUi:myFollowedPodcasts', icon: Heart },
  education: { titleKey: 'common:podcast.catEducation', icon: GraduationCap },
  news: { titleKey: 'common:podcast.catNews', icon: Newspaper },
  arts: { titleKey: 'common:podcast.catArts', icon: Palette },
  science: { titleKey: 'common:podcast.catScience', icon: FlaskConical },
  society: { titleKey: 'common:podcast.catSocietyCulture', icon: Globe },
  technology: { titleKey: 'common:podcast.catTechnology', icon: Cpu },
  business: { titleKey: 'podcastUi:catBusiness', icon: Briefcase },
  history: { titleKey: 'podcastUi:catHistory', icon: BookOpen },
  sports: { titleKey: 'podcastUi:catSports', icon: Trophy },
  music: { titleKey: 'podcastUi:catMusic', icon: Music },
  comedy: { titleKey: 'podcastUi:catComedy', icon: Laugh },
  health: { titleKey: 'podcastUi:catHealthFitness', icon: Heart },
  kids: { titleKey: 'podcastUi:catKidsFamily', icon: Baby },
  'true-crime': { titleKey: 'podcastUi:catTrueCrime', icon: ShieldAlert },
};

export function BrowseSectionView() {
  const {
    browseSectionItems,
    browseSectionTotal,
    browseSectionLoading,
    followedPodcasts,
    fetchBrowseSection,
  } = useDiscoverStore();

  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // A described search ("podcasts for kids in French") lands here with its language.
  const language = searchParams.get('language') ?? undefined;

  const [page, setPage] = useState(1);

  // The section now comes from the URL, not from store state.
  const slug = section ?? '';
  const config = SECTION_MAP[slug];

  // Switching sections keeps this component mounted (only the param changes), so
  // the page has to be reset explicitly — `setBrowseSection` used to do it.
  useEffect(() => {
    setPage(1);
  }, [slug]);

  useEffect(() => {
    if (slug) {
      fetchBrowseSection(slug, page, language);
    }
  }, [slug, page, language, fetchBrowseSection]);

  // A click opens the podcast's own page; it never subscribes the whole feed just to look at it.
  const handleCloudPodcastClick = (feedId: number) => navigate(`/podcast/show/${feedId}`);

  if (!config) return null;

  const SectionIcon = config.icon;

  // For followed section, paginate client-side
  const isFollowed = slug === 'followed';
  const displayItems = isFollowed
    ? followedPodcasts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : browseSectionItems;
  const total = isFollowed ? followedPodcasts.length : browseSectionTotal;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isLoading = browseSectionLoading;
  const hasItems = displayItems.length > 0;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/podcast')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('podcastUi:backToDiscover')}
      </button>

      {/* Page header */}
      <div className="flex items-center gap-2">
        <SectionIcon className="w-6 h-6 text-accent" />
        <h1 className="text-xl font-bold text-foreground">{t(config.titleKey)}</h1>
      </div>

      {/* Content */}
      {isLoading && !hasItems ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
            <span className="text-muted-foreground">{t('podcastUi:loading')}</span>
          </div>
        </div>
      ) : !hasItems ? (
        <div className="text-center py-20">
          <SectionIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('podcastUi:noResults')}</p>
        </div>
      ) : (
        <>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('podcastUi:matchCountPodcasts', { count: total })}
            </p>
          )}

          <PodcastTileGrid
            podcasts={displayItems as (CuratedPodcast | PodcastIndexFeed)[]}
            onOpen={handleCloudPodcastClick}
          />

          <HubPager
            page={page}
            totalPages={totalPages}
            totalCount={total}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
