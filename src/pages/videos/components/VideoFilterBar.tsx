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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocaleBadge } from '@/components/WordDialog/LocaleBadge';
import {
  DURATION_CEILINGS,
  DEFAULT_VIDEO_VIEW,
  MIN_VIDEOS_PER_LANGUAGE,
  VIDEO_VIEW_KEYS,
  nativeLanguageName,
  parseCefr,
  type CatalogState,
  type VideoViewKey,
} from '../lib/videoFilters';
import type { VideoFiltersResponse } from '../lib/videosApi';
import {
  FilterChips,
  FilterClearAll,
  FilterDropdown,
  FilterGroup,
  FilterPills,
  FilterSelect,
  SearchBox,
  levelPillOptions,
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
    .map((l) => ({
      id: l.code,
      label: nativeLanguageName(l.code),
      icon: <LocaleBadge code={l.code} size={18} />,
      count: l.count,
    }));

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

  // Under a level filter with nothing at any level the row would shrink to "All" — keep it whole.
  const levelOptions = levelPillOptions(t, { counts: levelCounts, selected: cefr }).map((o) => ({
    ...o,
    count: undefined,
  }));
  const selectedLevel = levelOptions.find((o) => o.id === cefr);

  const chips: Chip[] = [];
  if (selectedLevel) {
    chips.push({
      key: 'cefr',
      label: `${selectedLevel.label} · ${selectedLevel.sublabel}`,
      icon: <span className={`h-1.5 w-1.5 rounded-full ${selectedLevel.dotClass}`} />,
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
      icon: <LocaleBadge code={language} size={18} />,
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
          className="w-full sm:w-56 lg:w-72"
        />
        {/* Level — the primary filter, in the main row between the search and the dropdowns. */}
        <FilterPills
          value={cefr ?? ''}
          options={levelOptions}
          onChange={(id) => onChange({ cefr: parseCefr(id), page: 1 })}
          sublabelMode="active"
        />
        {catalogueLanguages.length > 1 && (
          <FilterGroup>
            <FilterDropdown
              label={t('podcasts.filterByLanguage')}
              value={language ?? ''}
              options={languageOptions}
              allLabel={t('podcasts.filterAllLanguages')}
              clearLabel={t('podcasts.clearFilters')}
              onChange={(v) => onChange({ language: v || undefined, page: 1 })}
              icon={<Globe className="h-3.5 w-3.5 opacity-70" />}
            />
          </FilterGroup>
        )}
        <FilterGroup>
          {/* A search replaces the sections with results, and then there is no view to switch. */}
          {!inSearch && (
            <>
              <FilterSelect
                label={t('podcasts.filterView')}
                value={view}
                defaultValue={DEFAULT_VIDEO_VIEW}
                options={viewOptions}
                onChange={(v) => onChange({ view: v as VideoViewKey, page: 1 })}
              />
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            </>
          )}
          {(filters?.categories.length ?? 0) > 0 && (
            <FilterDropdown
              label={t('filters.category')}
              value={category ?? ''}
              options={categoryOptions}
              allLabel={t('filters.allCategories')}
              clearLabel={t('podcasts.clearFilters')}
              onChange={(v) => onChange({ category: v || undefined, page: 1 })}
              icon={<LayoutGrid className="h-3.5 w-3.5 opacity-70" />}
            />
          )}
          <FilterDropdown
            label={t('podcasts.filterTopic')}
            value={topic ?? ''}
            options={topicOptions}
            allLabel={t('podcasts.filterAllTopics')}
            clearLabel={t('podcasts.clearFilters')}
            onChange={(v) => onChange({ topic: v || undefined, page: 1 })}
            icon={<GraduationCap className="h-3.5 w-3.5 opacity-70" />}
          />
          <FilterDropdown
            label={t('podcasts.filterDuration')}
            value={duration ? String(duration) : ''}
            options={durationOptions}
            allLabel={t('podcasts.filterAnyDuration')}
            clearLabel={t('podcasts.clearFilters')}
            onChange={(v) => onChange({ duration: v ? Number(v) : undefined, page: 1 })}
            icon={<Clock className="h-3.5 w-3.5 opacity-70" />}
          />
        </FilterGroup>
        <FilterClearAll show={hasAny} onClear={clearAll} label={t('podcasts.clearAllFilters')} />
      </div>
      <FilterChips chips={chips} summary={summary} />
    </div>
  );
}
