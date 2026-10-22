import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { podcastLanguageName } from '../../utils/showEpisodes';

interface Props {
  code: string | null | undefined;
  /** "overlay": a dark chip on the artwork (the parent positions it). "inline": icon + name in the surrounding text. */
  variant?: 'overlay' | 'inline';
  className?: string;
  iconClassName?: string;
}

/** Every podcast card shows its language through this, so none can go without it. */
export function PodcastLanguage({ code, variant = 'inline', className, iconClassName }: Props) {
  const { i18n } = useTranslation();
  const name = podcastLanguageName(code, i18n.language);
  if (!name) return null;

  if (variant === 'overlay') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-[7px] bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold text-cream-50 backdrop-blur-sm',
          className,
        )}
      >
        <Globe className={cn('h-2.5 w-2.5 shrink-0', iconClassName)} />
        {name}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Globe className={cn('h-3 w-3 shrink-0', iconClassName)} />
      {name}
    </span>
  );
}
