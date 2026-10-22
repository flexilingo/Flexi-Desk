import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LibraryEmpty } from './LibraryParts';

/**
 * Saved podcasts and history live on the FlexiLingo account. Everything else in
 * this app works signed-out and offline; only these tabs need a session.
 */
export function SignedOutNotice({ message }: { message: string }) {
  const { t } = useTranslation('common');
  return <LibraryEmpty icon={LogIn} title={t('podcast.signInRequired')} description={message} />;
}
