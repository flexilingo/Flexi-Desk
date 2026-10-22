/**
 * A section the free reader cannot see yet.
 *
 * Two design rules, both learned the hard way from paywalls that do not work:
 *
 *   · Say what is behind it, specifically. "Unlock more" converts nobody.
 *     "13 more days of your plan" converts, because the reader has already
 *     read day 1 and knows it was written about them.
 *   · Never blur fake content. Rendering a greyed-out mock of text that does
 *     not exist is a lie, and the withheld text was never sent to the browser
 *     anyway — there is nothing to blur.
 *
 * The upgrade CTA is suppressed entirely when `canUpsell` is false (mobile
 * signups, App Store purchase-steering rules). In practice the server does not
 * gate those accounts at all, so this component should not render for them —
 * but if it ever does, it must not grow a buy button.
 */

import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PANEL } from './shared';

export function LockedSection({
  titleKey,
  detail,
  canUpsell = true,
}: {
  /** Key under `exam.coach.locked.*` naming what is behind the lock. */
  titleKey: string;
  /** Already-localized line describing the size of what is missing. */
  detail?: string;
  canUpsell?: boolean;
}) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;

  return (
    <section className={`${PANEL} px-4 py-5`}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[10px] bg-muted text-caption flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-bold text-foreground">{t(titleKey)}</h2>
          {detail && (
            <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">{detail}</p>
          )}

          {canUpsell && (
            <div className="mt-3">
              <Button
                variant="accent"
                size="md"
                onClick={() => void openUrl(subscriptionUrl(i18n.language))}
              >
                {t('coach.locked.cta')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The banner at the top of a gated report. Explains once, in plain terms, why
 * part of the document is closed — so the individual locks below do not each
 * have to re-argue it.
 */
export function GatedBanner({ canUpsell = true }: { canUpsell?: boolean }) {
  const { t, i18n } = useTranslation('exam');
  const locale = i18n.language;

  return (
    <section className={`${PANEL} overflow-hidden`}>
      <div className="h-[3px] bg-gradient-to-r from-accent to-accent" />
      <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-bold text-foreground">{t('coach.locked.bannerTitle')}</h2>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            {t('coach.locked.bannerBody')}
          </p>
        </div>
        {canUpsell && (
          <div className="shrink-0">
            <Button
              variant="accent"
              size="md"
              onClick={() => void openUrl(subscriptionUrl(i18n.language))}
            >
              {t('coach.locked.cta')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
