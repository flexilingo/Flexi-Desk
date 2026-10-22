import {
  Clock,
  Drama,
  Globe,
  GraduationCap,
  Landmark,
  MessageCircle,
  Microscope,
  Newspaper,
  Search,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { LocaleBadge } from '@/components/WordDialog/LocaleBadge';
import {
  FilterBar,
  FilterChips,
  FilterClearAll,
  FilterDropdown,
  FilterGroup,
  FilterPills,
  FilterSearch,
  FilterSelect,
  type FilterChip,
  type FilterOption,
} from '@/components/ui/filters';
import type { CefrLevel, TopicCategory } from '../../types';
import {
  DEFAULT_HUB_VIEW,
  DURATION_CEILINGS,
  HUB_VIEWS,
  PODCAST_LANGUAGES,
  VIEW_LABEL_KEY,
  type HubView,
} from '../../utils/hubParams';

// Each level keeps its own colour: carried by the pill when active, and by the always-visible dot when idle.
const CEFR_ACTIVE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1/20 text-cefr-a1 shadow-xs',
  A2: 'bg-cefr-a2/20 text-cefr-a2 shadow-xs',
  B1: 'bg-cefr-b1/25 text-cefr-b1 shadow-xs',
  B2: 'bg-cefr-b2/20 text-cefr-b2 shadow-xs',
  C1: 'bg-cefr-c1/20 text-cefr-c1 shadow-xs',
  C2: 'bg-cefr-c2/20 text-cefr-c2 shadow-xs',
};
const CEFR_DOT: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};
const CEFR_LEVELS: { level: CefrLevel; labelKey: string }[] = [
  { level: 'A1', labelKey: 'podcast.cefrBeginner' },
  { level: 'A2', labelKey: 'podcast.cefrElementary' },
  { level: 'B1', labelKey: 'podcast.cefrIntermediate' },
  { level: 'B2', labelKey: 'podcastUi:cefrUpperIntermediate' },
  { level: 'C1', labelKey: 'podcast.cefrAdvanced' },
  { level: 'C2', labelKey: 'podcast.cefrProficiency' },
];

// Each topic keeps its own coloured line icon so the menu reads as a lively set rather than a grey strip.
const TOPICS: { topic: TopicCategory; icon: LucideIcon; color: string; labelKey: string }[] = [
  {
    topic: 'education',
    icon: GraduationCap,
    color: 'text-accent',
    labelKey: 'podcast.topicEducation',
  },
  { topic: 'news', icon: Newspaper, color: 'text-primary-light', labelKey: 'podcast.topicNews' },
  { topic: 'science', icon: Microscope, color: 'text-success', labelKey: 'podcast.topicScience' },
  {
    topic: 'storytelling',
    icon: Drama,
    color: 'text-warning',
    labelKey: 'podcast.topicStorytelling',
  },
  {
    topic: 'conversation',
    icon: MessageCircle,
    color: 'text-accent/70',
    labelKey: 'podcast.topicConversation',
  },
  {
    topic: 'culture',
    icon: Landmark,
    color: 'text-primary-light',
    labelKey: 'podcast.topicCulture',
  },
];

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isSearching?: boolean;
  selectedCefr: CefrLevel | undefined;
  onCefrChange: (level: CefrLevel | undefined) => void;
  selectedTopic: TopicCategory | undefined;
  onTopicChange: (topic: TopicCategory | undefined) => void;
  selectedLanguage: string | undefined;
  onLanguageChange: (lang: string | undefined) => void;
  /** Episode-length ceiling in minutes (10 / 20 / 30 / 60). */
  selectedDuration?: number;
  onDurationChange?: (minutes: number | undefined) => void;
  /** Off on the podcast views, where an episode length means nothing. */
  showDuration?: boolean;
  /** Omitted while a search is active: a search replaces the view with results. */
  view?: HubView;
  onViewChange?: (view: HubView) => void;
  /** How many results the active view holds under these filters; undefined while counting. */
  resultCount?: number;
  resultKind?: 'episodes' | 'podcasts';
}

/**
 * The hub's single filter bar, as on the website: search, level pills (the word shows on the level
 * you picked), language in a box of its own, then view / topic / length, one Clear all, and under it
 * one removable chip per active filter with the match count.
 */
export function PodcastFilterPills({
  searchQuery,
  onSearchChange,
  isSearching = false,
  selectedCefr,
  onCefrChange,
  selectedTopic,
  onTopicChange,
  selectedLanguage,
  onLanguageChange,
  selectedDuration,
  onDurationChange,
  showDuration = true,
  view,
  onViewChange,
  resultCount,
  resultKind = 'episodes',
}: Props) {
  const { t } = useTranslation('common');
  const { t: tp } = useTranslation('podcastUi');
  const durationEnabled = showDuration && !!onDurationChange;

  // One reset for the whole bar, search included. The view is left alone: it says what you are
  // reading, not what you filtered. Duration counts only while its control is on screen.
  const hasAny =
    !!searchQuery ||
    !!selectedCefr ||
    !!selectedTopic ||
    !!selectedLanguage ||
    (durationEnabled && !!selectedDuration);
  const clearAll = () => {
    onSearchChange('');
    onCefrChange(undefined);
    onTopicChange(undefined);
    onLanguageChange(undefined);
    onDurationChange?.(undefined);
  };

  const viewOptions: FilterOption[] = HUB_VIEWS.map((v) => ({
    id: v,
    label: tp(VIEW_LABEL_KEY[v]),
  }));
  const topicOptions: FilterOption[] = TOPICS.map(({ topic, icon: Icon, color, labelKey }) => ({
    id: topic,
    label: t(labelKey),
    icon: <Icon className={`h-4 w-4 ${color}`} />,
  }));
  const languageOptions: FilterOption[] = PODCAST_LANGUAGES.map(({ code, label }) => ({
    id: code,
    label,
    icon: <LocaleBadge code={code} size={18} />,
  }));
  const durationOptions: FilterOption[] = DURATION_CEILINGS.map((minutes) => ({
    id: String(minutes),
    label: tp('filterDurationUnder', { minutes }),
  }));
  const levelOptions = [
    { id: '', label: t('podcast.filterAllLevels') },
    ...CEFR_LEVELS.map(({ level, labelKey }) => ({
      id: level,
      label: level,
      sublabel: t(labelKey),
      dotClass: CEFR_DOT[level],
      activeClass: CEFR_ACTIVE[level],
    })),
  ];

  const chips: FilterChip[] = [];
  const chosenLevel = CEFR_LEVELS.find(({ level }) => level === selectedCefr);
  if (chosenLevel) {
    chips.push({
      key: 'cefr',
      label: `${chosenLevel.level} · ${t(chosenLevel.labelKey)}`,
      icon: <span className={`h-1.5 w-1.5 rounded-full ${CEFR_DOT[chosenLevel.level]}`} />,
      onRemove: () => onCefrChange(undefined),
    });
  }
  const chosenTopic = TOPICS.find(({ topic }) => topic === selectedTopic);
  if (chosenTopic) {
    chips.push({
      key: 'topic',
      label: t(chosenTopic.labelKey),
      onRemove: () => onTopicChange(undefined),
    });
  }
  if (selectedLanguage) {
    chips.push({
      key: 'language',
      label:
        PODCAST_LANGUAGES.find((l) => l.code === selectedLanguage)?.label ??
        selectedLanguage.toUpperCase(),
      icon: <LocaleBadge code={selectedLanguage} size={18} />,
      onRemove: () => onLanguageChange(undefined),
    });
  }
  if (durationEnabled && selectedDuration) {
    chips.push({
      key: 'duration',
      label: tp('filterDurationUnder', { minutes: selectedDuration }),
      onRemove: () => onDurationChange?.(undefined),
    });
  }
  if (searchQuery) {
    chips.push({
      key: 'q',
      label: `“${searchQuery}”`,
      icon: <Search className="h-3 w-3 opacity-70" />,
      onRemove: () => onSearchChange(''),
    });
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterSearch
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={t('podcast.searchPlaceholder')}
          isFetching={isSearching}
          clearLabel={tp('clearSearch')}
          className="w-full sm:w-56 lg:w-72"
        />

        {/* Level: the primary filter, inline. Only the code shows; the word appears on the chosen one. */}
        <FilterPills
          value={selectedCefr ?? ''}
          options={levelOptions}
          onChange={(id) => onCefrChange((id || undefined) as CefrLevel | undefined)}
          sublabelMode="active"
        />

        {/* Language right after the level, in a box of its own. */}
        <FilterGroup clearable={false}>
          <FilterDropdown
            label={tp('filterByLanguage')}
            value={selectedLanguage ?? ''}
            options={languageOptions}
            onChange={(v) => onLanguageChange(v || undefined)}
            allLabel={t('podcast.filterAllLanguages')}
            clearLabel={tp('clearFilters')}
            icon={<Globe className="h-3.5 w-3.5 opacity-70" />}
          />
        </FilterGroup>

        <FilterGroup clearable={false}>
          {view && onViewChange && (
            <>
              <FilterSelect
                label={tp('filterView')}
                value={view}
                defaultValue={DEFAULT_HUB_VIEW}
                options={viewOptions}
                onChange={(v) => onViewChange(v as HubView)}
              />
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            </>
          )}
          <FilterDropdown
            label={tp('filterTopic')}
            value={selectedTopic ?? ''}
            options={topicOptions}
            onChange={(v) => onTopicChange((v || undefined) as TopicCategory | undefined)}
            allLabel={tp('filterAllTopics')}
            clearLabel={tp('clearFilters')}
            icon={<GraduationCap className="h-3.5 w-3.5 opacity-70" />}
          />
          {/* Length: only on the episode views; a podcast has no single length. */}
          {durationEnabled && (
            <FilterDropdown
              label={tp('filterDuration')}
              value={selectedDuration ? String(selectedDuration) : ''}
              options={durationOptions}
              onChange={(v) => onDurationChange?.(v ? Number(v) : undefined)}
              allLabel={tp('filterAnyDuration')}
              clearLabel={tp('clearFilters')}
              icon={<Clock className="h-3.5 w-3.5 opacity-70" />}
            />
          )}
        </FilterGroup>

        <FilterClearAll show={hasAny} onClear={clearAll} label={tp('clearAllFilters')} />
      </FilterBar>

      <FilterChips
        chips={chips}
        summary={
          resultCount != null
            ? tp(resultKind === 'podcasts' ? 'matchCountPodcasts' : 'matchCountEpisodes', {
                count: resultCount,
              })
            : undefined
        }
        removeLabel={(name) => tp('removeFilter', { name })}
      />
    </div>
  );
}
