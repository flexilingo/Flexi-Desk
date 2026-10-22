import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
}

/** An on/off switch, content-sized, in semantic colours. */
export function Toggle({ checked, onCheckedChange, id, disabled, label }: ToggleProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-success' : 'bg-muted',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-card shadow transition-transform',
          'translate-x-1 data-[state=checked]:translate-x-6 rtl:-translate-x-1 rtl:data-[state=checked]:-translate-x-6',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
