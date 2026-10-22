import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The website's button (flexi-lingo-front `components/ui/button.tsx`), on the
 * desk's semantic tokens so it follows the light and dark themes.
 *
 * Sized to its content (`inline-flex`) — never stretched to the row. `loading`
 * disables the button, shows a spinner and keeps its colour (an async action
 * in flight is not the same as "unavailable").
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'rounded-md text-sm font-medium',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none disabled:translate-y-0',
    'data-[loading=true]:cursor-wait data-[loading=true]:opacity-90',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        /** Dark olive — the default action. */
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/88 active:bg-primary/80',
        /** The one orange — the page's main call to action (Start, Create, Save). */
        accent:
          'bg-accent text-accent-foreground shadow-xs hover:bg-accent/90 active:bg-accent/85 focus-visible:ring-accent/45',
        success:
          'bg-success text-success-foreground shadow-xs hover:bg-success/90 focus-visible:ring-success/45',
        destructive:
          'bg-error text-error-foreground shadow-xs hover:bg-error/90 focus-visible:ring-error/45',
        outline:
          'border border-input bg-card text-foreground/85 hover:border-accent/45 hover:bg-muted/50 hover:text-foreground active:bg-muted',
        secondary:
          'border border-input/70 bg-muted text-foreground/85 shadow-xs hover:bg-muted/70 hover:text-foreground',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80',
        link: 'h-auto rounded-none px-0 text-accent underline-offset-4 shadow-none hover:underline active:translate-y-0',
      },
      size: {
        xs: 'h-7 gap-1 px-2.5 text-xs font-semibold [&_svg]:size-3.5',
        sm: 'h-8 gap-1.5 px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-9 gap-2 px-4 [&_svg]:size-4',
        lg: 'h-11 gap-2 px-6 text-[15px] font-semibold [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 p-0 [&_svg]:size-3.5',
        icon: 'h-9 w-9 p-0 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Async action in flight: disabled, spinner first, colour kept. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        data-loading={loading ? 'true' : undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
