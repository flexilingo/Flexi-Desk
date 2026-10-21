import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeak } from '../../hooks/useSpeak';

interface Props {
  target: string;
  /** Resets the ladder whenever the activity changes. */
  activityId: string;
  disabled?: boolean;
}

/**
 * Graduated hints for the typing activities: first press speaks the word, each
 * further press reveals one more leading letter. Mirrors front's audio → reveal
 * hint ladder. Taking hints doesn't change grading — the answer must still match.
 */
export function HintRow({ target, activityId, disabled }: Props) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    setLevel(0);
  }, [activityId]);

  const maxLevel = Math.max(1, target.length - 1);
  const revealed = level > 0 ? target.slice(0, Math.min(level, maxLevel)) : '';
  const masked = level > 0 ? '·'.repeat(Math.max(0, target.length - revealed.length)) : '';

  const next = () => {
    if (level === 0) speak(target);
    setLevel((l) => Math.min(l + 1, maxLevel));
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => speak(target)}
        disabled={disabled}
        title={t('runner.listen')}
      >
        <Volume2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" onClick={next} disabled={disabled || level >= maxLevel}>
        <Lightbulb className="h-3.5 w-3.5" />
        {t('runner.hint')}
      </Button>
      {level > 0 && (
        <span className="font-mono text-sm tracking-widest text-muted-foreground">
          <span className="font-semibold text-foreground">{revealed}</span>
          {masked}
        </span>
      )}
    </div>
  );
}
