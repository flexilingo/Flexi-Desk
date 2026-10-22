import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, GraduationCap, Headphones, Loader2, LogIn } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The overview's card: one border, one surface, no shadow soup. */
export function OverviewCard({
  children,
  className,
  as: Tag = 'section',
  id,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
  id?: string;
  labelledBy?: string;
}) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      className={cn('relative overflow-hidden rounded-xl border border-border bg-card', className)}
    >
      {children}
    </Tag>
  );
}

export const linkClass =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted';

/** A button for something async: disabled with a spinner while it runs; sized to its content. */
export function LoadingButton({
  loading,
  children,
  disabled,
  className,
  ...props
}: ButtonProps & { loading?: boolean }) {
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      className={cn('inline-flex shrink-0 items-center gap-2', className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

/** A card that could not load: says so inside itself and offers a retry. */
export function CardError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'desk' });
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center gap-3 text-sm text-muted-foreground', className)}
    >
      <span>{t('cardError')}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="inline-flex">
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

/** The calm stand-in for a part that needs the account, shown signed out. */
export function SignInHint({
  title,
  body,
  onSignIn,
}: {
  title: string;
  body: string;
  onSignIn: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'desk' });
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="h-4 w-4" />
        </span>
        <p className="min-w-0 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{title}</span> {body}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSignIn}
        className="inline-flex shrink-0 items-center gap-2"
      >
        <LogIn className="h-4 w-4" />
        {t('signIn')}
      </Button>
    </section>
  );
}

/** Three line-drawn cards, fanned, a number on the top one: the picture for "cards waiting". */
export function DeckStackArt({ label, size = 150 }: { label: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden="true" className="shrink-0">
      <rect
        x="34"
        y="40"
        width="82"
        height="96"
        rx="10"
        transform="rotate(-9 75 88)"
        className="fill-muted stroke-border"
        strokeWidth="2"
      />
      <rect
        x="34"
        y="36"
        width="82"
        height="96"
        rx="10"
        transform="rotate(6 75 84)"
        className="fill-muted stroke-primary/40"
        strokeWidth="2"
      />
      <rect
        x="34"
        y="30"
        width="82"
        height="96"
        rx="10"
        className="fill-card stroke-primary"
        strokeWidth="2.2"
      />
      <line
        x1="48"
        y1="100"
        x2="102"
        y2="100"
        className="stroke-border"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="56"
        y1="110"
        x2="94"
        y2="110"
        className="stroke-border"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="75"
        y="80"
        textAnchor="middle"
        className="fill-primary"
        fontWeight="900"
        fontSize={label.length > 3 ? 22 : 30}
      >
        {label}
      </text>
    </svg>
  );
}

/** A large line icon on a soft disc: the picture for a step without artwork. */
export function IconArt({ kind, size = 150 }: { kind: 'exam' | 'listen'; size?: number }) {
  const Icon = kind === 'exam' ? GraduationCap : Headphones;
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-primary"
      style={{ width: size, height: size }}
    >
      <Icon className="h-1/2 w-1/2" strokeWidth={1.3} />
    </div>
  );
}

/** A remote picture with a calm fallback when it cannot load (offline, 404). */
export function RemoteImage({
  src,
  fallback,
  className,
}: {
  src: string | null | undefined;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}

export const BookFallback = ({ size = 36 }: { size?: number }) => (
  <div className="flex h-full w-full items-center justify-center text-primary">
    <BookOpen width={size} height={size} strokeWidth={1.4} />
  </div>
);

/**
 * A title from the content dropped into a sentence of the app's language,
 * wrapped in Unicode isolates so a French title inside a Persian line keeps
 * its own word order.
 */
export const isolate = (text: string) => `⁨${text}⁩`;
