import { useState } from 'react';
import { Trash2, Play, Plus, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PodcastBookmark } from '../../types';
import { formatTimeMs } from '../../types';

interface NotesTabProps {
  bookmarks: PodcastBookmark[];
  episodeId: string;
  onSeek: (timeSeconds: number) => void;
  onDeleteBookmark: (id: string) => void;
  onAddBookmark: (episodeId: string, positionMs: number, label?: string, note?: string) => void;
  currentTimeMs?: number;
  currentSubtitle?: string;
  onUpdateBookmark?: (id: string, note: string) => void;
  onSync?: () => void;
}

export function NotesTab({
  bookmarks,
  episodeId,
  onSeek,
  onDeleteBookmark,
  onAddBookmark,
  currentTimeMs = 0,
  currentSubtitle,
  onUpdateBookmark,
  onSync,
}: NotesTabProps) {
  const [addExpanded, setAddExpanded] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleAddNote = () => {
    onAddBookmark(
      episodeId,
      currentTimeMs,
      currentSubtitle ?? undefined,
      newNote.trim() || undefined,
    );
    setNewNote('');
    setAddExpanded(false);
  };

  const handleStartEdit = (bm: PodcastBookmark) => {
    setEditingId(bm.id);
    setEditText(bm.note ?? '');
  };

  const handleSaveEdit = (id: string) => {
    if (onUpdateBookmark) {
      onUpdateBookmark(id, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">Notes</h3>
        <div className="flex items-center gap-1.5">
          {onSync && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onSync}
              title="Sync notes"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setAddExpanded(!addExpanded)}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Expandable "Add with note" section */}
      {addExpanded && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium"
              onClick={() => setAddExpanded(!addExpanded)}
            >
              {addExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Add with note
            </button>
          </div>

          {/* Timestamp + subtitle preview */}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-mono text-[#8BB7A3]">{formatTimeMs(currentTimeMs)}</span>
            {currentSubtitle && <span className="truncate">{currentSubtitle}</span>}
          </div>

          {/* Note input */}
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNote();
            }}
          />

          {/* Cancel / Save */}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setAddExpanded(false);
                setNewNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={handleAddNote}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Bookmark list */}
      {bookmarks.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No notes yet. Click "+ Add" to create one at the current timestamp.
        </p>
      ) : (
        <div className="space-y-0.5">
          {bookmarks.map((bm) => (
            <div key={bm.id} className="group rounded-md hover:bg-muted/30 px-2 py-2">
              <div className="flex items-start gap-2">
                {/* Play button with timestamp */}
                <button
                  onClick={() => onSeek(bm.positionMs / 1000)}
                  className="flex items-center gap-1 text-[10px] text-[#8BB7A3] font-mono mt-0.5 shrink-0 hover:text-[#8BB7A3]/80 transition-colors"
                  title="Seek to this position"
                >
                  <Play className="h-3 w-3 fill-current" />
                  {formatTimeMs(bm.positionMs)}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Subtitle text */}
                  {bm.label && <p className="text-xs text-foreground line-clamp-2">{bm.label}</p>}

                  {/* Note display / edit */}
                  {editingId === bm.id ? (
                    <div className="mt-1 space-y-1.5">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Edit note..."
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(bm.id);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleSaveEdit(bm.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {bm.note ? (
                        <div className="mt-0.5">
                          <p className="text-[10px] text-muted-foreground">{bm.note}</p>
                          {onUpdateBookmark && (
                            <button
                              className="text-[10px] text-[#8BB7A3] hover:underline mt-0.5"
                              onClick={() => handleStartEdit(bm)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      ) : (
                        onUpdateBookmark && (
                          <button
                            className="text-[10px] text-[#8BB7A3] hover:underline mt-0.5"
                            onClick={() => handleStartEdit(bm)}
                          >
                            + Add note
                          </button>
                        )
                      )}
                      {!bm.label && !bm.note && (
                        <p className="text-xs text-muted-foreground italic">Bookmark</p>
                      )}
                    </>
                  )}
                </div>

                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBookmark(bm.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View All Notes link */}
      {bookmarks.length > 0 && (
        <div className="pt-1 border-t border-border">
          <button className="flex items-center gap-1 text-xs text-[#8BB7A3] hover:underline w-full justify-center py-2">
            View All Notes
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
