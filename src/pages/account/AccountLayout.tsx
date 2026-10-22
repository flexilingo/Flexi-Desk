import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Link2,
  MessageSquare,
  Receipt,
  Share2,
  Sparkles,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccountT } from './components/AccountBits';
import { CommunityBoard } from './community/CommunityBoard';
import { TopicPage } from './community/TopicPage';
import { FriendsTab } from './FriendsTab';
import { LearningTab } from './LearningTab';
import { LinksTab } from './LinksTab';
import { PaymentsTab } from './PaymentsTab';
import { ProfileTab } from './ProfileTab';
import { StatsTab } from './StatsTab';
import { XpHistoryTab } from './XpHistoryTab';

interface Item {
  to: string;
  label: string;
  Icon: LucideIcon;
}

/**
 * The website's SettingsShell: side tabs - Learning, then Profile / XP log / Stats /
 * Payments, then Community / Friends / Shared decks / Share links.
 */
export function AccountLayout() {
  const { t } = useAccountT();
  const groups: { title: string; items: Item[] }[] = [
    {
      title: t('settings.title'),
      items: [{ to: 'learning', label: t('settings.learningLanguages'), Icon: BookOpen }],
    },
    {
      title: t('navigation.groups.account'),
      items: [
        { to: 'profile', label: t('navigation.profile'), Icon: User },
        { to: 'xp', label: t('navigation.xpLog'), Icon: Sparkles },
        { to: 'stats', label: t('navigation.stats'), Icon: BarChart3 },
        { to: 'payments', label: t('navigation.payments'), Icon: Receipt },
      ],
    },
    {
      title: t('navigation.groups.community'),
      items: [
        { to: 'community', label: t('navigation.community'), Icon: MessageSquare },
        { to: 'friends', label: t('navigation.friends'), Icon: Users },
        { to: 'shared', label: t('navigation.shared'), Icon: Share2 },
        { to: 'links', label: t('navigation.shareLinks'), Icon: Link2 },
      ],
    },
  ];
  const all = groups.flatMap((g) => g.items);

  const link = ({ to, label, Icon }: Item, mobile = false) => (
    <NavLink
      key={to}
      to={`/account/${to}`}
      className={({ isActive }) =>
        cn(
          mobile
            ? 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px]'
            : 'flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px]',
          isActive
            ? 'border-accent/40 bg-accent/10 font-semibold text-accent'
            : 'border-border text-foreground/75 hover:bg-muted hover:text-foreground',
          !mobile && 'border-0',
        )
      }
    >
      <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </NavLink>
  );

  return (
    <div className="flex items-start gap-5">
      <nav
        aria-label={t('settings.title')}
        className="sticky top-0 hidden w-52 shrink-0 flex-col gap-0.5 self-start md:flex"
      >
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            <div className="mb-1.5 mt-3 px-3 text-[10px] font-bold uppercase tracking-[.12em] text-accent/70 first:mt-0">
              {g.title}
            </div>
            {g.items.map((i) => link(i))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <nav className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 md:hidden">
          {all.map((i) => link(i, true))}
        </nav>
        <Routes>
          <Route index element={<Navigate to="learning" replace />} />
          <Route path="learning" element={<LearningTab />} />
          <Route path="profile" element={<ProfileTab />} />
          <Route path="xp" element={<XpHistoryTab />} />
          <Route path="stats" element={<StatsTab />} />
          <Route path="payments" element={<PaymentsTab />} />
          <Route path="community" element={<CommunityBoard />} />
          <Route path="community/:id" element={<TopicPage />} />
          <Route path="friends" element={<FriendsTab />} />
          <Route path="shared" element={<LinksTab kind="shared" />} />
          <Route path="links" element={<LinksTab kind="links" />} />
          <Route path="*" element={<Navigate to="learning" replace />} />
        </Routes>
      </div>
    </div>
  );
}
