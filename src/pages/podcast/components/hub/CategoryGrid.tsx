import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Baby,
  BookOpen,
  Briefcase,
  Cpu,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Laugh,
  Music,
  Newspaper,
  Palette,
  ShieldAlert,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTrending } from '../../services/podcastCloud';

interface CatSlot {
  cat: string;
  slug: string;
  labelKey: string;
  icon: LucideIcon;
}

/** The website's fourteen browse categories, in its order. Labels live in `common` (podcast.cat*). */
const CATEGORIES: CatSlot[] = [
  { cat: 'Education', slug: 'education', labelKey: 'podcast.catEducation', icon: GraduationCap },
  { cat: 'News', slug: 'news', labelKey: 'podcast.catNews', icon: Newspaper },
  { cat: 'Arts', slug: 'arts', labelKey: 'podcast.catArts', icon: Palette },
  { cat: 'Science', slug: 'science', labelKey: 'podcast.catScience', icon: FlaskConical },
  { cat: 'Society-Culture', slug: 'society', labelKey: 'podcast.catSocietyCulture', icon: Globe },
  { cat: 'Technology', slug: 'technology', labelKey: 'podcast.catTechnology', icon: Cpu },
  { cat: 'Business', slug: 'business', labelKey: 'podcastUi:catBusiness', icon: Briefcase },
  { cat: 'History', slug: 'history', labelKey: 'podcastUi:catHistory', icon: BookOpen },
  { cat: 'Sports', slug: 'sports', labelKey: 'podcastUi:catSports', icon: Trophy },
  { cat: 'Music', slug: 'music', labelKey: 'podcastUi:catMusic', icon: Music },
  { cat: 'Comedy', slug: 'comedy', labelKey: 'podcastUi:catComedy', icon: Laugh },
  { cat: 'Health-Fitness', slug: 'health', labelKey: 'podcastUi:catHealthFitness', icon: Heart },
  { cat: 'Kids-Family', slug: 'kids', labelKey: 'podcastUi:catKidsFamily', icon: Baby },
  { cat: 'True-Crime', slug: 'true-crime', labelKey: 'podcastUi:catTrueCrime', icon: ShieldAlert },
];

type CoverState = { loading: boolean; cover: string | null; empty: boolean };

function CategoryCard({ slot }: { slot: CatSlot }) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [state, setState] = useState<CoverState>({ loading: true, cover: null, empty: false });

  // One cover image and an "is this category empty" answer: three feeds are plenty.
  useEffect(() => {
    let cancelled = false;
    getTrending(3, slot.cat)
      .then((res) => {
        if (cancelled) return;
        const feeds = res.feeds ?? [];
        setState({
          loading: false,
          cover: feeds.find((f) => !!f.image)?.image ?? null,
          empty: feeds.length === 0,
        });
      })
      .catch(() => {
        // Offline or failing: the tile is simply absent rather than an error over the hub.
        if (!cancelled) setState({ loading: false, cover: null, empty: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slot.cat]);

  if (!state.loading && state.empty) return null;
  const Icon = slot.icon;

  return (
    <button
      type="button"
      onClick={() => navigate(`/podcast/browse/${slot.slug}`)}
      className="group relative isolate block aspect-[3/2] overflow-hidden rounded-xl text-start transition-shadow duration-200 hover:shadow-md"
    >
      <div
        className={`absolute inset-0 ${state.loading ? 'animate-pulse bg-muted' : 'bg-primary-light'}`}
      >
        {!state.loading && state.cover && (
          <img
            src={state.cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      {!state.loading && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/25" />
          <div className="absolute inset-0 bg-primary-dark/15" />
          <div className="relative z-10 flex h-full flex-col justify-between p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-md">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="text-[12px] font-bold leading-tight text-white drop-shadow-md sm:text-[13px]">
              {t(slot.labelKey)}
            </h3>
          </div>
        </>
      )}
    </button>
  );
}

/** "Browse by Category": fourteen cover tiles that open the category pages. */
export function CategoryGrid() {
  const { t } = useTranslation('podcastUi');
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Globe className="h-4 w-4 text-accent" />
        {t('browseByCategory')}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {CATEGORIES.map((slot) => (
          <CategoryCard key={slot.cat} slot={slot} />
        ))}
      </div>
    </section>
  );
}
