import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import type { Algorithm, DeckWithStats } from '../../types';
import { useErrorText } from '../../lib/useErrorText';
import { LanguagePicker } from '../parts/LanguagePicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  defaultLanguage?: string;
  /** Language the meanings are in (the translation language chosen on the page). */
  nativeLanguage?: string;
  onCreate: (
    name: string,
    language: string,
    algorithm: Algorithm,
    description: string | undefined,
    nativeLanguage: string | undefined,
  ) => Promise<DeckWithStats>;
  onCreated: (deck: DeckWithStats) => void;
}

const ALGORITHMS: Algorithm[] = ['fsrs', 'sm2', 'leitner'];

export function CreateDeckFromItemsDialog({
  open,
  onOpenChange,
  selectedCount,
  defaultLanguage = 'en',
  nativeLanguage,
  onCreate,
  onCreated,
}: Props) {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(defaultLanguage);
  const [algorithm, setAlgorithm] = useState<Algorithm>('fsrs');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('hub.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const deck = await onCreate(
        name.trim(),
        language,
        algorithm,
        description || undefined,
        nativeLanguage,
      );
      setName('');
      setDescription('');
      onOpenChange(false);
      onCreated(deck);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('hub.createDeck')}</DialogTitle>
          <DialogDescription>{t('hub.willBeAdded', { count: selectedCount })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('hub.deckName')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('hub.namePlaceholder')}
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('form.cardsAreIn')}</label>
              <LanguagePicker value={language} onSelect={setLanguage} disabled={busy} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('form.algorithm')}</label>
              <select
                value={algorithm}
                disabled={busy}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {ALGORITHMS.map((a) => (
                  <option key={a} value={a}>
                    {t(`form.algo.${a}.label`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t('form.description')}{' '}
              <span className="font-normal text-muted-foreground">({t('form.optional')})</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('hub.descPlaceholder')}
              disabled={busy}
            />
          </div>
          <InlineError message={error} onDismiss={() => setError(null)} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('hub.createDeck')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
