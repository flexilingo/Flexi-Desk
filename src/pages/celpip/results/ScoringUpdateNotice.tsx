import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabaseCall } from '@/lib/supabase';
import { announcementText } from '@/pages/dashboard/overview/banners';
import type { Announcement } from '@/pages/dashboard/overview/services';
import { getScoringNotice } from '../services/celpipCloud';

// "We changed how Listening and Reading are scored" - only for a learner who still
// has results scored the old way (the exam API decides who), so their next, lower
// reading score does not look like they got worse. Its words are an
// app_announcements row, editable in admin; it stays until the learner presses x.

const DISMISSED_KEY = 'fl_dismissed_announcements';

function dismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

interface ScoringUpdateNoticeProps {
  examType: string;
  /** Opens "how is this scored?". */
  onHowScored: () => void;
}

export function ScoringUpdateNotice({ examType, onHowScored }: ScoringUpdateNoticeProps) {
  const [slot, setSlot] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getScoringNotice(examType)
      .then((r) => {
        if (!cancelled) setSlot(r?.slot ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [examType]);
  // The announcement is fetched only once the learner is known to need it.
  return slot ? <NoticeForSlot slot={slot} onHowScored={onHowScored} /> : null;
}

function NoticeForSlot({ slot, onHowScored }: { slot: string; onHowScored: () => void }) {
  const { t, i18n } = useTranslation('exam');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [hidden, setHidden] = useState<string[]>(dismissedIds);

  useEffect(() => {
    let cancelled = false;
    supabaseCall<{ announcements: Announcement[] }>(
      'GET',
      `/app-config?action=announcements&locale=${encodeURIComponent(i18n.language.split('-')[0])}&slot=${encodeURIComponent(slot)}&platform=web`,
    )
      .then((r) => {
        if (!cancelled) setAnnouncement(r.announcements?.[0] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slot, i18n.language]);

  if (!announcement || hidden.includes(announcement.id)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedIds(), announcement.id]));
    } catch {
      /* the notice just comes back next time */
    }
    setHidden(dismissedIds());
  };

  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-[9px] border border-border bg-card p-3.5 shadow-sm sm:p-4">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary to-primary/70" />
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
        <Info className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        {announcement.title && (
          <p className="text-[13.5px] font-bold leading-snug text-foreground">
            {announcement.title}
          </p>
        )}
        <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
          {announcementText(announcement.message)}
        </p>
        <button
          type="button"
          onClick={onHowScored}
          className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary hover:underline"
        >
          {announcement.button_text || t('scoringInfo.open')}
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('scoringInfo.close')}
        title={t('scoringInfo.close')}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-caption transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
