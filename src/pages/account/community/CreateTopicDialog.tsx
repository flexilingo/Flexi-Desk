import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { createTopic, updateTopic } from '@/lib/account/api';
import { validateTopic } from '@/lib/account/community';
import type { CommunityTopic } from '@/lib/account/types';
import { parseCloudError } from '@/lib/cloudError';
import { ErrorLine, useAccountT } from '../components/AccountBits';
import { MarkdownEditor } from './MarkdownEditor';

/**
 * New topic, or (with `topic`) edit one. The dialog stays open until the server says
 * yes; a failure shows inline and the text is kept.
 */
export function CreateTopicDialog({
  open,
  onClose,
  onCreated,
  onSaved,
  onProRequired,
  topic,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (t: CommunityTopic) => void;
  onSaved?: (t: CommunityTopic) => void;
  onProRequired?: () => void;
  topic?: CommunityTopic | null;
}) {
  const { t, errorText } = useAccountT();
  const isEdit = !!topic;
  const [title, setTitle] = useState(topic?.title ?? '');
  const [description, setDescription] = useState(topic?.description ?? '');
  const [category, setCategory] = useState(topic?.category ?? '');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(topic?.title ?? '');
    setDescription(topic?.description ?? '');
    setCategory(topic?.category ?? '');
    setAnonymous(false);
    setError(null);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const invalid = validateTopic(title, description);
    if (invalid) {
      setError(t(`community.${invalid}`));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: category || undefined,
      };
      if (topic) {
        // An emptied category must travel as "" or the server keeps the old one.
        const saved = await updateTopic(topic.id, { ...payload, category: category.trim() });
        onSaved?.(saved);
        onClose();
        return;
      }
      const created = await createTopic({ ...payload, is_anonymous: anonymous });
      setTitle('');
      setDescription('');
      setCategory('');
      setAnonymous(false);
      onCreated?.(created);
      onClose();
    } catch (err) {
      if (/PRO/.test(parseCloudError(err).code)) {
        onProRequired?.();
        onClose();
      } else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('community.editTopic') : t('community.createTopic')}
          </DialogTitle>
          <DialogDescription>{t('community.createTopicDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <ErrorLine message={error} onDismiss={() => setError(null)} />
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            {t('community.topicTitleLabel')} *
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('community.titlePlaceholder')}
              maxLength={200}
              required
              dir="auto"
            />
            <span className="text-[11px] font-normal text-caption">{title.length}/200</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t('community.description')} *
            </span>
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder={t('community.descriptionPlaceholder')}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            {t('community.category')} ({t('community.optional')})
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('community.categoryPlaceholder')}
              dir="auto"
            />
          </label>
          {!isEdit && (
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-muted px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-foreground">
                  {t('community.postAnonymously')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                  {t('community.postAnonymouslyHint')}
                </span>
              </span>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} />
            </label>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('community.cancel')}
            </Button>
            <Button type="submit" variant="accent" loading={busy}>
              {!busy && !isEdit && <Plus />}
              {isEdit
                ? busy
                  ? t('community.saving')
                  : t('community.saveChanges')
                : busy
                  ? t('community.creating')
                  : t('community.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
