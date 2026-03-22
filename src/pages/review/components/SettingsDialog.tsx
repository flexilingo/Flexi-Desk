import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReviewStore } from '../stores/reviewStore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { reviewSettings, saveReviewSetting } = useReviewStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Auto TTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto TTS</p>
                <p className="text-xs text-muted-foreground">
                  Speak word, show answer, then auto-advance
                </p>
              </div>
              <Checkbox
                checked={reviewSettings.autoTtsEnabled}
                onCheckedChange={(checked) =>
                  saveReviewSetting('autoTtsEnabled', !!checked)
                }
              />
            </div>

            {reviewSettings.autoTtsEnabled && (
              <div className="pl-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Auto-advance delay: {reviewSettings.autoTtsDelaySeconds}s
                </p>
                <Slider
                  value={[reviewSettings.autoTtsDelaySeconds]}
                  min={2}
                  max={10}
                  step={1}
                  onValueChange={([val]) =>
                    saveReviewSetting('autoTtsDelaySeconds', val)
                  }
                />
              </div>
            )}
          </div>

          {/* Auto Pronounce Only */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto Pronounce Only</p>
              <p className="text-xs text-muted-foreground">
                Speak word without showing the answer
              </p>
            </div>
            <Checkbox
              checked={reviewSettings.autoPronounceEnabled}
              onCheckedChange={(checked) =>
                saveReviewSetting('autoPronounceEnabled', !!checked)
              }
            />
          </div>

          {/* TTS Voice */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">TTS Voice</p>
              <p className="text-xs text-muted-foreground">Speech accent</p>
            </div>
            <Select
              value={reviewSettings.ttsVoice}
              onValueChange={(val) =>
                saveReviewSetting('ttsVoice', val as 'us' | 'uk')
              }
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">US</SelectItem>
                <SelectItem value="uk">UK</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reverse Card Direction */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reverse Direction</p>
              <p className="text-xs text-muted-foreground">
                Show translation first, guess the word
              </p>
            </div>
            <Checkbox
              checked={reviewSettings.reverseCardDirection}
              onCheckedChange={(checked) =>
                saveReviewSetting('reverseCardDirection', !!checked)
              }
            />
          </div>

          {/* Always Show Translation */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Always Show Translation</p>
              <p className="text-xs text-muted-foreground">
                Show answer without clicking
              </p>
            </div>
            <Checkbox
              checked={reviewSettings.alwaysShowTranslation}
              onCheckedChange={(checked) =>
                saveReviewSetting('alwaysShowTranslation', !!checked)
              }
            />
          </div>

          {/* Edit Mode */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Edit Mode</p>
              <p className="text-xs text-muted-foreground">
                Show edit button on cards
              </p>
            </div>
            <Checkbox
              checked={reviewSettings.editModeEnabled}
              onCheckedChange={(checked) =>
                saveReviewSetting('editModeEnabled', !!checked)
              }
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
