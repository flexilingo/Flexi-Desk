import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Check, ArrowRight, ArrowLeft, Search, BookOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { useReviewStore } from '../stores/reviewStore';
import type { RawReviewSession } from '../types';
import { mapSession } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionCreated: (sessionId: string) => void;
  initialDeckId?: string;
}

type Step = 1 | 2 | 3;

export function CreateReviewDialog({ open, onOpenChange, onSessionCreated, initialDeckId }: Props) {
  const { decks, fetchDecks } = useReviewStore();

  const [step, setStep] = useState<Step>(1);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [cardsPerSession, setCardsPerSession] = useState(20);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchDecks();
      if (initialDeckId) {
        setSelectedDeckIds([initialDeckId]);
        setStep(2);
      } else {
        setSelectedDeckIds([]);
        setStep(1);
      }
      setSearch('');
      setCardsPerSession(20);
      setError(null);
    }
  }, [open, fetchDecks, initialDeckId]);

  const filteredDecks = useMemo(() => {
    if (!search.trim()) return decks;
    const q = search.toLowerCase();
    return decks.filter((d) => d.name.toLowerCase().includes(q));
  }, [decks, search]);

  const selectedDecks = decks.filter((d) => selectedDeckIds.includes(d.id));
  const totalCards = selectedDecks.reduce((sum, d) => sum + d.cardCount, 0);
  const totalDue = selectedDecks.reduce((sum, d) => sum + d.dueToday, 0);
  const totalNew = selectedDecks.reduce((sum, d) => sum + d.newCards, 0);

  // Session preview calculations
  const dueInSession = Math.min(totalDue, cardsPerSession);
  const newInSession = Math.min(totalNew, Math.max(0, cardsPerSession - dueInSession));
  const notYetDueInSession = Math.max(0, cardsPerSession - dueInSession - newInSession);
  const actualSessionCards = Math.min(cardsPerSession, totalCards);
  const duePercent = actualSessionCards > 0 ? (dueInSession / actualSessionCards) * 100 : 0;
  const newPercent = actualSessionCards > 0 ? ((newInSession + notYetDueInSession) / actualSessionCards) * 100 : 0;

  const toggleDeck = (id: string) => {
    setSelectedDeckIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (selectedDeckIds.length === 0) return;
    setIsCreating(true);
    setError(null);

    try {
      let rawSession: RawReviewSession;

      if (selectedDeckIds.length === 1) {
        rawSession = await invoke<RawReviewSession>('srs_start_session', {
          deckId: selectedDeckIds[0],
          limit: cardsPerSession,
        });
      } else {
        rawSession = await invoke<RawReviewSession>('srs_start_multi_deck_session', {
          deckIds: selectedDeckIds,
          limit: cardsPerSession,
        });
      }

      const session = mapSession(rawSession);

      if (session.totalCards === 0) {
        setError('No cards available in selected decks');
        setIsCreating(false);
        return;
      }

      // Load session + cards into store before navigating
      await useReviewStore.getState().loadSessionCards(session);
      onOpenChange(false);
      onSessionCreated(session.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isCreating && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-4">
          <h2 className="text-lg font-bold text-foreground">Create Review Session</h2>
          <Stepper current={step} />
        </div>

        {/* Content */}
        <div className="px-6 pb-2">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm mb-4">
              {error}
            </div>
          )}

          {/* ── Step 1: Select Deck ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Which deck do you want to study?
              </p>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search decks..."
                  className="pl-9"
                />
              </div>

              {/* Deck List */}
              <div className="max-h-[320px] overflow-y-auto space-y-2">
                {filteredDecks.map((deck) => {
                  const isSelected = selectedDeckIds.includes(deck.id);
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => toggleDeck(deck.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                        isSelected
                          ? 'border-[#8BB7A3] bg-[#8BB7A3]/5'
                          : 'border-border hover:border-[#8BB7A3]/40'
                      }`}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <span className="flex-1 text-sm font-medium truncate">{deck.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {deck.cardCount} cards
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 2: Filter Cards ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Filter by card tags (optional)
              </p>

              {/* Per-deck tag sections */}
              <div className="space-y-3">
                {selectedDecks.map((deck) => (
                  <div
                    key={deck.id}
                    className="rounded-xl border border-border px-4 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">{deck.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 italic">No tags</p>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="flex items-center gap-2 rounded-xl border border-border px-4 py-3">
                <BookOpen className="w-5 h-5 text-[#8BB7A3] shrink-0" />
                <span className="text-sm text-foreground">
                  {totalCards} cards – all will be included
                </span>
              </div>
            </div>
          )}

          {/* ── Step 3: Configure ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Session Preview */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Session Preview</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-[#C58C6E]" />
                    <span className="text-muted-foreground">{totalDue} due for review</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-[#8BB7A3]" />
                    <span className="text-muted-foreground">{totalCards - totalDue} new available</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
                  {duePercent > 0 && (
                    <div className="h-full bg-[#C58C6E]" style={{ width: `${duePercent}%` }} />
                  )}
                  <div className="h-full bg-[#8BB7A3]" style={{ width: `${newPercent}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {actualSessionCards} cards ({dueInSession} review, {newInSession + notYetDueInSession} new)
                </p>
              </div>

              {/* Cards per session */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Cards per session</p>
                  <span className="text-sm font-bold text-foreground">{cardsPerSession}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Due review cards come first, then new cards fill remaining slots
                </p>
                <Slider
                  value={[cardsPerSession]}
                  min={5}
                  max={Math.max(totalCards, 5)}
                  step={5}
                  onValueChange={([val]) => setCardsPerSession(val)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 flex items-center justify-between">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={selectedDeckIds.length === 0}
                onClick={() => setStep(2)}
              >
                Next <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Next <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
              </Button>
              <Button
                disabled={isCreating || selectedDeckIds.length === 0}
                onClick={handleCreate}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Starting...
                  </>
                ) : (
                  'Start Review'
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Stepper ── */

function Stepper({ current }: { current: Step }) {
  const steps = [
    { num: 1, label: 'Select Deck' },
    { num: 2, label: 'Filter Cards' },
    { num: 3, label: 'Configure' },
  ];

  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const isCompleted = s.num < current;
        const isActive = s.num === current;

        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              {/* Circle */}
              {isCompleted ? (
                <div className="w-6 h-6 rounded-full bg-[#8BB7A3] flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              ) : (
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {s.num}
                </div>
              )}
              {/* Label */}
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive
                    ? 'font-semibold text-foreground'
                    : isCompleted
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
            </div>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`h-px flex-1 mx-2 ${
                  isCompleted ? 'bg-[#8BB7A3]' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
