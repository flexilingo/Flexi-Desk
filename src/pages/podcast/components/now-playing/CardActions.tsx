import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Check, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One plain icon button for every action on the card's right (website: `CardActions` ICON_BTN). */
export const CARD_ICON_BUTTON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';

/**
 * The top of the now-playing card (website: `CardActions`): the way back on one side, what you can
 * do with the episode on the other — save it, its episodes, host extras, share. It replaces the old
 * page top bar, so the player is one even surface.
 */
export function CardActions({
  onBack,
  onToggleFavorite,
  isFavorite = false,
  favoritePending = false,
  episodes,
  extra,
  shareUrl,
}: {
  onBack?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  favoritePending?: boolean;
  episodes?: ReactNode;
  extra?: ReactNode;
  /** The public page to share; the link is copied (a desk app has no share sheet). */
  shareUrl?: string | null;
}) {
  const { t } = useTranslation('podcastUi');
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-1.5 rounded-md ps-2.5 pe-3.5 text-sm font-medium text-primary transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('np.back')}
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-0.5">
        {onToggleFavorite && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={favoritePending}
            title={isFavorite ? t('np.favoriteRemoveLabel') : t('np.favoriteLabel')}
            aria-label={isFavorite ? t('np.favoriteRemoveLabel') : t('np.favoriteLabel')}
            aria-pressed={isFavorite}
            className={cn(CARD_ICON_BUTTON, isFavorite && 'text-accent hover:text-accent')}
          >
            <Bookmark className={cn('h-[18px] w-[18px]', isFavorite && 'fill-current')} />
          </button>
        )}
        {episodes}
        {extra}
        {shareUrl && <ShareLinkButton url={shareUrl} />}
      </div>
    </div>
  );
}

/** Share: copies the page's public address and says so. */
function ShareLinkButton({ url }: { url: string }) {
  const { t } = useTranslation('podcastUi');
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused: nothing was copied, so nothing is claimed.
    }
  };
  const label = copied ? t('linkCopied') : t('np.share');
  return (
    <button
      type="button"
      onClick={share}
      title={label}
      aria-label={label}
      className={cn(CARD_ICON_BUTTON, copied && 'text-success hover:text-success')}
    >
      {copied ? <Check className="h-[18px] w-[18px]" /> : <Share2 className="h-[18px] w-[18px]" />}
    </button>
  );
}
