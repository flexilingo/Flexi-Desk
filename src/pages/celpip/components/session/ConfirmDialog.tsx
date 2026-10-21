import type { ReactNode } from 'react';
import { Info, TriangleAlert, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Desk has no shared ConfirmDialog yet, and every exam section plus the engine
// needs the same "are you sure?" gate front got from `@/components/ui/confirm-dialog`.
// This is the local equivalent: same variant vocabulary, built on desk's Dialog.
export type ConfirmVariant = 'info' | 'warning' | 'destructive' | 'success';

interface VariantTone {
  strip: string; // 4px top strip colour
  icon: LucideIcon;
  iconColor: string;
}

// Literal classes only — the Tailwind scanner can't see string-concatenated tokens.
const VARIANT_TONES: Record<ConfirmVariant, VariantTone> = {
  info: { strip: 'bg-primary', icon: Info, iconColor: 'text-primary' },
  warning: { strip: 'bg-warning', icon: TriangleAlert, iconColor: 'text-warning' },
  destructive: { strip: 'bg-error', icon: Trash2, iconColor: 'text-error' },
  success: { strip: 'bg-success', icon: CheckCircle2, iconColor: 'text-success' },
};

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: ConfirmVariant;
  title: string;
  description?: ReactNode;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  variant = 'info',
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const tone = VARIANT_TONES[variant];
  const Icon = tone.icon;

  return (
    <Dialog
      open={open}
      // While the action is in flight the dialog must stay put — UX rule: never
      // auto-close before the mutation resolves.
      onOpenChange={(next) => {
        if (isLoading) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="p-0 gap-0 overflow-hidden max-w-md">
        <div className={`h-1 w-full ${tone.strip}`} />
        <div className="p-6">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className={`shrink-0 mt-0.5 ${tone.iconColor}`}>
                <Icon className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base">{title}</DialogTitle>
                {description != null && (
                  <DialogDescription className="mt-2 leading-relaxed">
                    {description}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-6 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              size="sm"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmText}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
