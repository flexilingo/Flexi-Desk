import { Search, X } from 'lucide-react';
import type { CefrLevel } from '../../types';

const CEFR_LEVELS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1', 'C2'];

interface PodcastFiltersProps {
  selectedCefr: CefrLevel | undefined;
  selectedSort: 'score' | 'newest' | 'name';
  searchQuery: string;
  onCefrChange: (cefr: CefrLevel | undefined) => void;
  onSortChange: (sort: 'score' | 'newest' | 'name') => void;
  onSearchChange: (query: string) => void;
}

export function PodcastFilters({
  selectedCefr,
  selectedSort,
  searchQuery,
  onCefrChange,
  onSortChange,
  onSearchChange,
}: PodcastFiltersProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search podcasts…"
          className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* CEFR Level pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground mr-1">Level:</span>
          <button
            onClick={() => onCefrChange(undefined)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              !selectedCefr
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            All
          </button>
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => onCefrChange(selectedCefr === level ? undefined : level)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selectedCefr === level
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={selectedSort}
          onChange={(e) => onSortChange(e.target.value as 'score' | 'newest' | 'name')}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground"
        >
          <option value="score">By Score</option>
          <option value="newest">By Newest</option>
          <option value="name">A-Z</option>
        </select>
      </div>
    </div>
  );
}
