import {
  Check,
  ChevronDown,
  Clock,
  Drama,
  GraduationCap,
  Globe,
  Landmark,
  Layers,
  Loader2,
  MessageCircle,
  Microscope,
  Newspaper,
  Search,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { CefrLevel, TopicCategory } from '../../types';
import {
  DURATION_CEILINGS,
  HUB_VIEWS,
  PODCAST_LANGUAGES,
  VIEW_LABEL_KEY,
  VALID_CEFR,
  type HubView,
} from '../../utils/hubParams';

/** Only the topics the difficulty pipeline actually tags episodes with. */
const TOPICS: { topic: TopicCategory; icon: LucideIcon; labelKey: string }[] = [
  { topic: 'education', icon: GraduationCap, labelKey: 'podcast.topicEducation' },
  { topic: 'news', icon: Newspaper, labelKey: 'podcast.topicNews' },
  { topic: 'science', icon: Microscope, labelKey: 'podcast.topicScience' },
  { topic: 'storytelling', icon: Drama, labelKey: 'podcast.topicStorytelling' },
  { topic: 'conversation', icon: MessageCircle, labelKey: 'podcast.topicConversation' },
  { topic: 'culture', icon: Landmark, labelKey: 'podcast.topicCulture' },
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
  /** Omitted while a search is active: a search replaces the sections with results. */
  view?: HubView;
  onViewChange?: (view: HubView) => void;
  /** How many results the active view holds under these filters; undefined while counting. */
  resultCount?: number;
  resultKind?: 'episodes' | 'podcasts';
}

/**
 * The hub's single filter bar, as on the website: search, level pills (a second tap keeps the level),
 * language, view, topic and length dropdowns, one Clear all, and under it one removable chip per
 * active filter with the match count.
 */
export function PodcastFilterPills({
  searchQuery,
  onSearchChange,
  isSearching,
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
  const viewEnabled = !!view && !!onViewChange;

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

  const topicLabel = (topic: TopicCategory) =>
    t(TOPICS.find((x) => x.topic === topic)?.labelKey ?? topic);
  const languageLabel = (code: string) =>
    PODCAST_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase();

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (selectedCefr)
    chips.push({ key: 'cefr', label: selectedCefr, onRemove: () => onCefrChange(undefined) });
  if (selectedTopic) {
    chips.push({
      key: 'topic',
      label: topicLabel(selectedTopic),
      onRemove: () => onTopicChange(undefined),
    });
  }
  if (selectedLanguage) {
    chips.push({
      key: 'language',
      label: languageLabel(selectedLanguage),
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
    chips.push({ key: 'q', label: `“${searchQuery}”`, onRemove: () => onSearchChange('') });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        {isSearching ? (
          <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
        ) : (
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('podcast.searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            aria-label={tp('clearSearch')}
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill
          label={t('podcast.filterAllLevels')}
          active={!selectedCefr}
          onClick={() => onCefrChange(undefined)}
        />
        {VALID_CEFR.map((level) => (
          // A second tap on the chosen level keeps it; "All levels" is how it is cleared.
          <Pill
            key={level}
            label={level}
            active={selectedCefr === level}
            onClick={() => onCefrChange(level)}
          />
        ))}

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        <Dropdown
          icon={Globe}
          label={t('podcast.filterAllLanguages')}
          value={selectedLanguage ?? ''}
          options={PODCAST_LANGUAGES.map((l) => ({ id: l.code, label: l.label }))}
          allLabel={t('podcast.filterAllLanguages')}
          onChange={(v) => onLanguageChange(v || undefined)}
        />
        {viewEnabled && (
          <Dropdown
            icon={Layers}
            label={tp('filterView')}
            value={view}
            defaultValue="overview"
            options={HUB_VIEWS.map((v) => ({ id: v, label: tp(VIEW_LABEL_KEY[v]) }))}
            onChange={(v) => onViewChange?.((v || 'overview') as HubView)}
          />
        )}
        <Dropdown
          icon={GraduationCap}
          label={tp('filterTopic')}
          value={selectedTopic ?? ''}
          options={TOPICS.map(({ topic, labelKey }) => ({ id: topic, label: t(labelKey) }))}
          allLabel={tp('filterAllTopics')}
          onChange={(v) => onTopicChange((v || undefined) as TopicCategory | undefined)}
        />
        {durationEnabled && (
          <Dropdown
            icon={Clock}
            label={tp('filterDuration')}
            value={selectedDuration ? String(selectedDuration) : ''}
            options={DURATION_CEILINGS.map((m) => ({
              id: String(m),
              label: tp('filterDurationUnder', { minutes: m }),
            }))}
            allLabel={tp('filterAnyDuration')}
            onChange={(v) => onDurationChange?.(v ? Number(v) : undefined)}
          />
        )}

        {hasAny && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            {tp('clearAllFilters')}
          </button>
        )}
      </div>

      {(chips.length > 0 || resultCount != null) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {c.label}
              <button
                type="button"
                aria-label={tp('removeFilter', { name: c.label })}
                onClick={c.onRemove}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {resultCount != null && (
            <span className="text-xs text-muted-foreground">
              {tp(resultKind === 'podcasts' ? 'matchCountPodcasts' : 'matchCountEpisodes', {
                count: resultCount,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Dropdown({
  icon: Icon,
  label,
  value,
  options,
  allLabel,
  defaultValue = '',
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  options: { id: string; label: string }[];
  /** The "nothing chosen" row; omitted where a choice is always made (the view). */
  allLabel?: string;
  defaultValue?: string;
  onChange: (id: string) => void;
}) {
  const current = options.find((o) => o.id === value);
  const chosen = !!current && value !== defaultValue;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            chosen
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {current && (chosen || !allLabel) ? current.label : label}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {allLabel && <Option label={allLabel} active={!value} onClick={() => onChange('')} />}
        {options.map((o) => (
          <Option
            key={o.id}
            label={o.label}
            active={value === o.id}
            onClick={() => onChange(o.id)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Option({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
    >
      {label}
      {active && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}
