import { useState, useEffect } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReviewStore } from '../stores/reviewStore';
import type { CardFull } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CardFull | null;
}

export function CardEditDialog({ open, onOpenChange, card }: Props) {
  const { updateCardInSession, deleteCardFromSession } = useReviewStore();

  const [front, setFront] = useState('');
  const [translation, setTranslation] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && card) {
      setFront(card.front);
      setTranslation(card.translation ?? '');
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [open, card]);

  const handleSave = async () => {
    if (!card || !front.trim()) {
      setError('Front text is required');
      return;
    }
    setIsUpdating(true);
    setError(null);
    try {
      await updateCardInSession(card.id, front.trim(), translation.trim());
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!card) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteCardFromSession(card.id);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Card</DialogTitle>
          <DialogDescription>Modify the card content</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Front Text</label>
            <Input
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Word or phrase..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Translation</label>
            <Input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder="Translation..."
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!showDeleteConfirm ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isUpdating || isDeleting}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive">Are you sure?</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isUpdating || !front.trim()}>
              {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
