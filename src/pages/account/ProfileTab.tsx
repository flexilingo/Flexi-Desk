import { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Save, Upload, User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/stores/authStore';
import { getProfile, updateProfile, uploadAvatar } from '@/lib/account/api';
import { useRemote } from '@/hooks/useRemote';
import {
  CardTitleRow,
  ErrorLine,
  RequireSession,
  Spinner,
  useAccountT,
} from './components/AccountBits';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfileTab() {
  return (
    <RequireSession icon={UserIcon}>
      <ProfileForm />
    </RequireSession>
  );
}

function ProfileForm() {
  const { t, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const profile = useRemote(() => getProfile(), [session?.user_id]);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name ?? '');
      setBio(profile.data.bio ?? '');
      setAvatar(profile.data.avatar_url);
    }
  }, [profile.data]);

  if (profile.loading && !profile.data) return <Spinner />;

  const save = async () => {
    setSaving(true);
    setOk(false);
    setError(null);
    try {
      await updateProfile({ display_name: name || null, bio: bio || null });
      setOk(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setAvatarError(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t('desk.profile.tooBig'));
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const ext = file.name.split('.').pop() ?? 'png';
        const result = await uploadAvatar(
          String(reader.result),
          `${session?.user_id}-${Date.now()}.${ext}`,
        );
        setAvatar(result.avatar_url);
      } catch (e) {
        setAvatarError(errorText(e));
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setUploading(false);
      setAvatarError(t('profile.avatarUploadError'));
    };
    reader.readAsDataURL(file);
  };

  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : session?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={UserIcon} title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <ErrorLine
        message={profile.error ? errorText(profile.error) : null}
        onRetry={() => void profile.reload()}
        retryLabel={t('subscription.retry')}
      />
      <div className="grid items-start gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardTitleRow icon={UserIcon} title={t('profile.personalInfo')} />
          <div className="flex flex-col gap-4 px-5 py-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('profile.email')}
              <Input type="email" value={session?.email ?? ''} disabled readOnly />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('profile.displayName')}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profile.displayNamePlaceholder')}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('profile.bio')}
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder={t('profile.bioPlaceholder')}
                className="resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </label>
            {ok && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
              >
                <Check className="h-4 w-4" />
                {t('profile.profileUpdatedSuccess')}
              </p>
            )}
            <ErrorLine message={error} onDismiss={() => setError(null)} />
            <div>
              <Button variant="accent" loading={saving} onClick={() => void save()}>
                {!saving && <Save />}
                {saving ? t('profile.saving') : t('profile.saveChanges')}
              </Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardTitleRow icon={ImageIcon} title={t('profile.avatar')} />
          <div className="flex flex-col items-center gap-3 px-5 py-5">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-border">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary text-2xl font-extrabold text-primary-foreground">
                  {initials}
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-card/40 border-t-card" />
                </div>
              )}
            </div>
            {avatarError && (
              <p role="alert" className="text-center text-xs text-error">
                {avatarError}
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button variant="accent" loading={uploading} onClick={() => fileRef.current?.click()}>
              {!uploading && <Upload />}
              {t('profile.changeAvatar')}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              {t('profile.avatarHint')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
