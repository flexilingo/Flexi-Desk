import { MessageCircle, Drama, Layers, Brain, LockKeyhole, HelpCircle } from 'lucide-react';
import type { ModeInfo } from '../types';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'message-circle': MessageCircle,
  theater: Drama,
  layers: Layers,
  brain: Brain,
  'lock-keyhole': LockKeyhole,
};

interface ModeCardProps {
  mode: ModeInfo;
  isSelected: boolean;
  onClick: () => void;
}

export function ModeCard({ mode, isSelected, onClick }: ModeCardProps) {
  const { t } = useTranslation('tutor');
  const Icon = ICON_MAP[mode.icon] ?? HelpCircle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg p-4 text-left cursor-pointer transition-colors',
        isSelected
          ? 'border-2 border-primary bg-primary/5'
          : 'border border-border bg-card hover:bg-muted/50',
      )}
    >
      <Icon className={cn('h-5 w-5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
      <div>
        <p className="text-sm font-bold text-foreground">
          {t(`modes.${mode.id}.name`, { defaultValue: mode.name })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`modes.${mode.id}.description`, { defaultValue: mode.description })}
        </p>
      </div>
    </button>
  );
}
