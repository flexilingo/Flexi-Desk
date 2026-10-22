import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { errorCode } from '@/pages/notes/notesApi';
import { updateWord } from './vocabApi';
import { CEFR_LEVELS, type VocabItem } from './vocabLogic';

interface Props {
  word: VocabItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

/** Edit a word in this computer's store. Stays open until the save has gone through. */
export function WordEditDialog({ word, onClose, onSaved }: Props) {
  const { t } = useTranslation('vocabulary');
  const [translation, setTranslation] = useState('');
  const [definition, setDefinition] = useState('');
  const [pos, setPos] = useState('');
  const [cefr, setCefr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!word?.local) return;
    setTranslation(word.local.translation ?? '');
    setDefinition(word.local.definition ?? '');
    setPos(word.local.pos ?? '');
    setCefr(word.local.cefr_level ?? '');
    setError(null);
  }, [word]);

  const save = async () => {
    if (!word?.local) return;
    setSaving(true);
    setError(null);
    try {
      await updateWord(word.local.id, { translation, definition, pos, cefrLevel: cefr });
      await onSaved();
      onClose();
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mb-1 block text-xs text-muted-foreground';
  return (
    <Dialog open={word !== null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle dir="auto">{t('editTitle', { word: word?.word ?? '' })}</DialogTitle>
          <DialogDescription>{t('editDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className={field}>{t('fieldTranslation')}</label>
            <Input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              dir="auto"
            />
          </div>
          <div>
            <label className={field}>{t('fieldDefinition')}</label>
            <Input value={definition} onChange={(e) => setDefinition(e.target.value)} dir="auto" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={field}>{t('fieldPos')}</label>
              <Input value={pos} onChange={(e) => setPos(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={field}>{t('fieldCefr')}</label>
              <select
                value={cefr}
                onChange={(e) => setCefr(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus:border-accent"
              >
                <option value="">{t('cefrUnknown')}</option>
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <InlineError message={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button variant="accent" onClick={save} loading={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
