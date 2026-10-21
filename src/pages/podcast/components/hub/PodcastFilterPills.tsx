import {
  Search,
  X,
  Loader2,
  Globe,
  Check,
  ChevronDown,
  GraduationCap,
  Newspaper,
  Microscope,
  Drama,
  MessageCircle,
  Landmark,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { CefrLevel, TopicCategory } from '../../types';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Only the topics the difficulty pipeline actually tags episodes with. */
const TOPICS: { topic: TopicCategory; icon: LucideIcon; labelKey: string }[] = [
  { topic: 'education', icon: GraduationCap, labelKey: 'podcast.topicEducation' },
  { topic: 'news', icon: Newspaper, labelKey: 'podcast.topicNews' },
  { topic: 'science', icon: Microscope, labelKey: 'podcast.topicScience' },
  { topic: 'storytelling', icon: Drama, labelKey: 'podcast.topicStorytelling' },
  { topic: 'conversation', icon: MessageCircle, labelKey: 'podcast.topicConversation' },
  { topic: 'culture', icon: Landmark, labelKey: 'podcast.topicCulture' },
];

export const PODCAST_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
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
}

/**
 * The hub's single filter bar. A CEFR level or topic selects *episodes*
 * (`episodes-by-level`, the v2 per-episode difficulty model); a language or a
 * search term selects *podcasts* (`curated-list`). There is deliberately no sort
 * control — episodes come back easiest-first, podcasts by score.
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
}: Props) {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-3">
      {/* Search input */}
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
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LanguageDropdown selected={selectedLanguage} onChange={onLanguageChange} />

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        <Pill
          label={t('podcast.filterAllLevels')}
          active={!selectedCefr}
          onClick={() => onCefrChange(undefined)}
        />
        {LEVELS.map((level) => (
          <Pill
            key={level}
            label={level}
            active={selectedCefr === level}
            onClick={() => onCefrChange(selectedCefr === level ? undefined : level)}
          />
        ))}

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        {TOPICS.map(({ topic, icon: Icon, labelKey }) => (
          <Pill
            key={topic}
            label={t(labelKey)}
            icon={Icon}
            active={selectedTopic === topic}
            onClick={() => onTopicChange(selectedTopic === topic ? undefined : topic)}
          />
        ))}
      </div>
    </div>
  );
}

function LanguageDropdown({
  selected,
  onChange,
}: {
  selected: string | undefined;
  onChange: (lang: string | undefined) => void;
}) {
  const { t } = useTranslation('common');
  const current = PODCAST_LANGUAGES.find((l) => l.code === selected);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            current
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          {current?.label ?? t('podcast.filterAllLanguages')}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        <LanguageOption
          label={t('podcast.filterAllLanguages')}
          active={!selected}
          onClick={() => onChange(undefined)}
        />
        {PODCAST_LANGUAGES.map((l) => (
          <LanguageOption
            key={l.code}
            label={l.label}
            active={selected === l.code}
            onClick={() => onChange(l.code)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function LanguageOption({
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

function Pill({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
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
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
