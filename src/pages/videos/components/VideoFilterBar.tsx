import {
  Clock,
  Globe,
  GraduationCap,
  Hourglass,
  LayoutGrid,
  Lock,
  Search,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DURATION_CEILINGS,
  DEFAULT_VIDEO_VIEW,
  MIN_VIDEOS_PER_LANGUAGE,
  VIDEO_VIEW_KEYS,
  nativeLanguageName,
  type CatalogState,
  type VideoViewKey,
} from '../lib/videoFilters';
import type { CefrLabel, VideoFiltersResponse } from '../lib/videosApi';
import { CEFR_BG } from '../lib/levelStyles';
import {
  FilterChips,
  FilterDropdown,
  LevelPills,
  SearchBox,
  type Chip,
  type DropdownOption,
} from './FilterControls';

const VIEW_ICON = { newest: Sparkles, shortest: Timer, longest: Hourglass } as const;

interface Props {
  state: CatalogState;
  onChange: (patch: Partial<CatalogState>) => void;
  filters?: VideoFiltersResponse;
  /** How many videos match everything chosen; undefined while counting or while a search shows two lanes. */
  resultCount?: number;
  searching?: boolean;
}

/**
 * One row, three zones: search · level pills · the dropdown box (language, view, category, topic,
 * length), then Clear all. Every count is faceted — counted under the other filters in the bar — and
 * a choice that would empty the list is left out. Under the bar, each active filter is a chip you can
 * remove, so a stack of filters that found nothing is never a mystery.
 */
export function VideoFilterBar({ state, onChange, filters, resultCount, searching }: Props) {
  const { t } = useTranslation('videos');
  const { q, cefr, topic, duration, language, category, view } = state;
  const hasAny = Boolean(q || cefr || topic || duration || language || category);
  const inSearch = Boolean(q);

  const clearAll = () =>
    onChange({
      q: '',
      cefr: undefined,
      topic: undefined,
      duration: undefined,
      language: undefined,
      category: undefined,
      page: 1,
    });

  const levelCounts = filters?.levels.some((l) => l.count > 0)
    ? Object.fromEntries(filters.levels.map((l) => [l.level, l.count]))
    : undefined;

  const catalogueLanguages = (filters?.languages ?? []).filter(
    (l) => (l.catalogue_count ?? l.count) >= MIN_VIDEOS_PER_LANGUAGE,
  );
  const languageOptions: DropdownOption[] = catalogueLanguages
    .filter((l) => l.count > 0 || l.code === language)
    .sort((a, b) => b.count - a.count)
    .map((l) => ({ id: l.code, label: nativeLanguageName(l.code), count: l.count }));

  const categoryLabel = (c: string) => t(`categories.${c}`, { defaultValue: c });
  const categoryOptions: DropdownOption[] = (filters?.categories ?? [])
    .filter((c) => c.count > 0 || c.category === category)
    .map((c) => ({
      id: c.category,
      label: categoryLabel(c.category),
      // Music is listed even when signed out, with a lock, so the section can invite a sign-in.
      icon: c.locked ? <Lock className="h-3.5 w-3.5 text-accent" /> : undefined,
      count: c.count,
    }));

  const topicOptions: DropdownOption[] = (filters?.tags ?? [])
    .filter((x) => x.count > 0 || x.tag === topic)
    .map((x) => ({ id: x.tag, label: x.tag, count: x.count }));

  const durationOptions: DropdownOption[] = DURATION_CEILINGS.map((minutes) => ({
    id: String(minutes),
    label: t('podcasts.filterDurationUnder', { minutes }),
  }));

  const viewOptions: DropdownOption[] = VIDEO_VIEW_KEYS.map((k) => {
    const Icon = VIEW_ICON[k];
    return { id: k, label: t(`views.${k}`), icon: <Icon className="h-3.5 w-3.5" /> };
  });

  const chips: Chip[] = [];
  if (cefr) {
    chips.push({
      key: 'cefr',
      label: cefr,
      icon: <span className={`h-1.5 w-1.5 rounded-full ${CEFR_BG[cefr as CefrLabel]}`} />,
      onRemove: () => onChange({ cefr: undefined, page: 1 }),
    });
  }
  if (topic)
    chips.push({
      key: 'topic',
      label: topic,
      onRemove: () => onChange({ topic: undefined, page: 1 }),
    });
  if (language)
    chips.push({
      key: 'language',
      label: nativeLanguageName(language),
      onRemove: () => onChange({ language: undefined, page: 1 }),
    });
  if (category)
    chips.push({
      key: 'category',
      label: categoryLabel(category),
      onRemove: () => onChange({ category: undefined, page: 1 }),
    });
  if (duration) {
    chips.push({
      key: 'duration',
      label: t('podcasts.filterDurationUnder', { minutes: duration }),
      onRemove: () => onChange({ duration: undefined, page: 1 }),
    });
  }
  if (q) {
    chips.push({
      key: 'q',
      label: `“${q}”`,
      icon: <Search className="h-3 w-3 opacity-70" />,
      onRemove: () => onChange({ q: '', page: 1 }),
    });
  }

  const summary =
    resultCount == null
      ? undefined
      : resultCount === 0
        ? t('matchCountNone')
        : t('matchCount', { count: resultCount });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={q}
          onCommit={(v) => onChange({ q: v, page: 1 })}
          placeholder={t('searchPlaceholder')}
          busy={searching}
          className="w-full sm:w-60 lg:w-72"
        />
        <LevelPills
          value={cefr}
          counts={levelCounts}
          onChange={(v) => onChange({ cefr: v, page: 1 })}
        />
        {catalogueLanguages.length > 1 && (
          <FilterDropdown
            label={t('podcasts.filterByLanguage')}
            value={language ?? ''}
            options={languageOptions}
            allLabel={t('podcasts.filterAllLanguages')}
            onChange={(v) => onChange({ language: v || undefined, page: 1 })}
            icon={<Globe className="h-3.5 w-3.5 opacity-70" />}
          />
        )}
        {/* A search replaces the sections with results, and then there is no view to switch. */}
        {!inSearch && (
          <FilterDropdown
            label={t('podcasts.filterView')}
            value={view}
            options={viewOptions}
            onChange={(v) => onChange({ view: (v || DEFAULT_VIDEO_VIEW) as VideoViewKey, page: 1 })}
            icon={(() => {
              const Icon = VIEW_ICON[view];
              return <Icon className="h-3.5 w-3.5 opacity-70" />;
            })()}
          />
        )}
        {(filters?.categories.length ?? 0) > 0 && (
          <FilterDropdown
            label={t('filters.category')}
            value={category ?? ''}
            options={categoryOptions}
            allLabel={t('filters.allCategories')}
            onChange={(v) => onChange({ category: v || undefined, page: 1 })}
            icon={<LayoutGrid className="h-3.5 w-3.5 opacity-70" />}
          />
        )}
        <FilterDropdown
          label={t('podcasts.filterTopic')}
          value={topic ?? ''}
          options={topicOptions}
          allLabel={t('podcasts.filterAllTopics')}
          onChange={(v) => onChange({ topic: v || undefined, page: 1 })}
          icon={<GraduationCap className="h-3.5 w-3.5 opacity-70" />}
        />
        <FilterDropdown
          label={t('podcasts.filterDuration')}
          value={duration ? String(duration) : ''}
          options={durationOptions}
          allLabel={t('podcasts.filterAnyDuration')}
          onChange={(v) => onChange({ duration: v ? Number(v) : undefined, page: 1 })}
          icon={<Clock className="h-3.5 w-3.5 opacity-70" />}
        />
        {hasAny && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <X className="h-4 w-4" />
            {t('podcasts.clearAllFilters')}
          </Button>
        )}
      </div>
      <FilterChips chips={chips} summary={summary} />
    </div>
  );
}
