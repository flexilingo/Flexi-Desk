import {
  BarChart3,
  BookOpen,
  Brain,
  GraduationCap,
  StickyNote,
  Settings,
  ChevronLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatsTab } from './StatsTab';
import { VocabTab } from './VocabTab';
import { AnalysisTab } from './AnalysisTab';
import { NotesTab } from './NotesTab';
import { SettingsTab } from './SettingsTab';
import type { NlpAnalysis, PodcastBookmark } from '../../types';

/** Tabs of the insights drawer. */
export type SidebarTab = 'stats' | 'vocab' | 'analysis' | 'notes' | 'settings';

const TABS: { id: SidebarTab; icon: typeof BarChart3; label: string }[] = [
  { id: 'stats', icon: BarChart3, label: 'Stats' },
  { id: 'vocab', icon: BookOpen, label: 'Vocab' },
  { id: 'analysis', icon: Brain, label: 'Analysis' },
  { id: 'notes', icon: StickyNote, label: 'Notes' },
];

interface PlayerSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which tab to show. Owned by the parent so the control bar can open one directly. */
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  // Stats data
  wordsClicked: number;
  wordsAddedToDeck: number;
  activeTimeSpent: number;
  segmentCount: number;
  // Analysis
  analysis: NlpAnalysis | null;
  /** Episode's language — decides whether a missing analysis means "not yet" or "unsupported". */
  sourceLang?: string;
  // Notes
  bookmarks: PodcastBookmark[];
  episodeId: string;
  onSeek: (timeSeconds: number) => void;
  onDeleteBookmark: (id: string) => void;
  onAddBookmark: (episodeId: string, positionMs: number, label?: string, note?: string) => void;
  // Settings
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  subtitleBgOpacity: number;
  onSubtitleBgOpacityChange: (opacity: number) => void;
  subtitlesEnabled: boolean;
  onToggleSubtitles: () => void;
  autoPauseOnBoundary?: boolean;
  onToggleAutoPause?: () => void;
  pauseOnHover?: boolean;
  onTogglePauseOnHover?: () => void;
  subtitleAlignment?: 'left' | 'center' | 'right';
  onSubtitleAlignmentChange?: (alignment: 'left' | 'center' | 'right') => void;
  // Quiz
  onStartQuiz?: () => void;
  // Vocab
  onAddToDeck?: (words: string[]) => void;
}

export function PlayerSidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  wordsClicked,
  wordsAddedToDeck,
  activeTimeSpent,
  segmentCount,
  analysis,
  sourceLang = 'en',
  bookmarks,
  episodeId,
  onSeek,
  onDeleteBookmark,
  onAddBookmark,
  fontSize,
  onFontSizeChange,
  subtitleBgOpacity,
  onSubtitleBgOpacityChange,
  subtitlesEnabled,
  onToggleSubtitles,
  autoPauseOnBoundary,
  onToggleAutoPause,
  pauseOnHover,
  onTogglePauseOnHover,
  subtitleAlignment,
  onSubtitleAlignmentChange,
  onStartQuiz,
  onAddToDeck,
}: PlayerSidebarProps) {
  // The collapsed icon rail was removed to match the web player — the panels are
  // opened from the Vocab / Analysis buttons in the control bar instead.
  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full shrink-0">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">Studio FlexiLingo</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTabChange('settings')}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              activeTab === 'settings'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Horizontal tab bar */}
      <div className="flex items-center border-b border-border px-1 py-1 gap-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-md text-[10px] font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
        {onStartQuiz && (
          <button
            onClick={onStartQuiz}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-md text-[10px] font-medium transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <GraduationCap className="h-4 w-4" />
            Quiz
          </button>
        )}
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {activeTab === 'stats' && (
            <StatsTab
              wordsClicked={wordsClicked}
              wordsAddedToDeck={wordsAddedToDeck}
              activeTimeSpent={activeTimeSpent}
              segmentCount={segmentCount}
              cefrLevel={analysis?.cefrLevel}
              cefrDistribution={analysis?.cefrDistribution}
              uniqueWords={analysis?.uniqueWords}
              totalWords={analysis?.totalWords}
              notesCount={bookmarks.length}
              onStartQuiz={onStartQuiz}
              onNavigateToVocab={() => onTabChange('vocab')}
              onNavigateToAnalysis={() => onTabChange('analysis')}
            />
          )}
          {activeTab === 'vocab' && <VocabTab analysis={analysis} onAddToDeck={onAddToDeck} />}
          {activeTab === 'analysis' && <AnalysisTab analysis={analysis} sourceLang={sourceLang} />}
          {activeTab === 'notes' && (
            <NotesTab
              bookmarks={bookmarks}
              episodeId={episodeId}
              onSeek={onSeek}
              onDeleteBookmark={onDeleteBookmark}
              onAddBookmark={onAddBookmark}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              subtitleBgOpacity={subtitleBgOpacity}
              onSubtitleBgOpacityChange={onSubtitleBgOpacityChange}
              subtitlesEnabled={subtitlesEnabled}
              onToggleSubtitles={onToggleSubtitles}
              autoPauseOnBoundary={autoPauseOnBoundary}
              onToggleAutoPause={onToggleAutoPause}
              pauseOnHover={pauseOnHover}
              onTogglePauseOnHover={onTogglePauseOnHover}
              subtitleAlignment={subtitleAlignment}
              onSubtitleAlignmentChange={onSubtitleAlignmentChange}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
