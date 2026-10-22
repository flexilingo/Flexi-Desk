import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Headphones,
  MonitorPlay,
  Library,
  Brain,
  Layers,
  Compass,
  BookOpenText,
  GraduationCap,
  MessageSquareText,
  ScrollText,
  NotebookPen,
  BookA,
  Settings,
  MessageSquare,
  Captions,
  Mic,
  PenLine,
  Puzzle,
  Users,
  Crown,
  Sparkles,
} from 'lucide-react';
import { ENABLED_MODULES, type ModuleKey } from '@/config/features';

/**
 * The desk's menu — the website's sidebar (flexi-lingo-front
 * `components/sidebar/sidebarConfig.ts`): Home, Study, Exams, French and
 * Personal, plus one group for the tools only the desktop app has.
 *
 * Every entry is behind a flag in `config/features.ts`. Entries whose page is
 * not ported yet are listed here with their flag OFF, so they appear the
 * moment the port lands — and never before (no unfinished page is shown).
 */
export interface NavItem {
  /** Route inside the desk (HashRouter path). */
  to: string;
  /** i18n key in the `common` namespace. */
  labelKey: string;
  icon: LucideIcon;
  module: ModuleKey;
  /** Light up on sub-routes of `to` too (default: exact match). */
  matchPrefix?: boolean;
  /** Other routes (and their sub-routes) that belong to this entry. */
  activePaths?: string[];
  /** Sub-routes that belong to another entry. */
  exceptPaths?: string[];
  /** Shown instead of the icon in the mini sidebar: the exams share one icon. */
  monogram?: string;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  /** The first group needs no heading — it is the way into everything else. */
  hideLabel?: boolean;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    labelKey: 'nav.groups.home',
    hideLabel: true,
    items: [
      { to: '/', labelKey: 'nav.overview', icon: LayoutDashboard, module: 'dashboard' },
      {
        to: '/podcast',
        labelKey: 'nav.podcasts',
        icon: Headphones,
        module: 'podcast',
        matchPrefix: true,
      },
      {
        to: '/videos',
        labelKey: 'nav.videos',
        icon: MonitorPlay,
        module: 'videos',
        matchPrefix: true,
      },
      // The reader's own library: a book opens straight into the reader.
      {
        to: '/reader/library',
        labelKey: 'nav.library',
        icon: Library,
        module: 'library',
        matchPrefix: true,
        activePaths: ['/reader/book'],
      },
    ],
  },
  {
    id: 'study',
    labelKey: 'nav.groups.study',
    items: [
      { to: '/study', labelKey: 'nav.study', icon: Brain, module: 'study', matchPrefix: true },
      { to: '/review', labelKey: 'nav.decks', icon: Layers, module: 'review', matchPrefix: true },
      {
        to: '/explore',
        labelKey: 'nav.browse',
        icon: Compass,
        module: 'browse',
        matchPrefix: true,
      },
      {
        to: '/reader',
        labelKey: 'nav.reader',
        icon: BookOpenText,
        module: 'reader',
        matchPrefix: true,
        exceptPaths: ['/reader/library', '/reader/book'],
      },
    ],
  },
  {
    id: 'exams',
    labelKey: 'nav.groups.exams',
    items: [
      {
        to: '/celpip',
        labelKey: 'nav.celpip',
        icon: GraduationCap,
        module: 'celpip',
        matchPrefix: true,
        activePaths: ['/exam/celpip'],
        monogram: 'CEL',
      },
      {
        // TCF Canada; Québec and IRN are other pages of the same exam module.
        to: '/exam/tcf',
        labelKey: 'nav.tcf',
        icon: GraduationCap,
        module: 'tcf',
        matchPrefix: true,
        activePaths: ['/exam/tcf_quebec', '/exam/tcf_irn'],
        monogram: 'TCF',
      },
    ],
  },
  {
    id: 'french',
    labelKey: 'nav.groups.french',
    items: [
      {
        to: '/sentences',
        labelKey: 'nav.sentences',
        icon: MessageSquareText,
        module: 'sentences',
        matchPrefix: true,
      },
      {
        to: '/cheatsheet',
        labelKey: 'nav.cheatsheet',
        icon: ScrollText,
        module: 'cheatsheet',
        matchPrefix: true,
      },
    ],
  },
  {
    // Only the desktop app has these: they listen to the computer's audio and
    // microphone, or run on its own AI model.
    id: 'desk',
    labelKey: 'nav.groups.desk',
    items: [
      {
        to: '/tutor',
        labelKey: 'nav.tutor',
        icon: MessageSquare,
        module: 'tutor',
        matchPrefix: true,
      },
      {
        to: '/caption',
        labelKey: 'nav.caption',
        icon: Captions,
        module: 'caption',
        matchPrefix: true,
      },
      {
        to: '/pronunciation',
        labelKey: 'nav.pronunciation',
        icon: Mic,
        module: 'pronunciation',
        matchPrefix: true,
      },
      {
        to: '/writing',
        labelKey: 'nav.writing',
        icon: PenLine,
        module: 'writing',
        matchPrefix: true,
      },
      {
        to: '/plugins',
        labelKey: 'nav.plugins',
        icon: Puzzle,
        module: 'plugins',
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'personal',
    labelKey: 'nav.groups.personal',
    items: [
      {
        to: '/notes',
        labelKey: 'nav.notes',
        icon: NotebookPen,
        module: 'notes',
        matchPrefix: true,
      },
      {
        to: '/vocabulary',
        labelKey: 'nav.vocabulary',
        icon: BookA,
        module: 'vocabulary',
        matchPrefix: true,
      },
      {
        to: '/account/community',
        labelKey: 'account:desk.nav.community',
        icon: Users,
        module: 'account',
        matchPrefix: true,
        activePaths: ['/account/friends'],
      },
      {
        to: '/subscription',
        labelKey: 'account:desk.nav.pro',
        icon: Crown,
        module: 'subscription',
        matchPrefix: true,
      },
      {
        to: '/whats-new',
        labelKey: 'account:desk.nav.whatsNew',
        icon: Sparkles,
        module: 'whatsNew',
        matchPrefix: true,
      },
      // Last, right above the foot of the sidebar.
      {
        to: '/settings',
        labelKey: 'nav.settings',
        icon: Settings,
        module: 'settings',
        matchPrefix: true,
        // Profile, XP log, stats, payments... are Settings' account tabs.
        activePaths: ['/account'],
        exceptPaths: ['/account/community', '/account/friends'],
      },
    ],
  },
];

/** The groups with only their switched-on entries; empty groups are dropped. */
export function visibleGroups(flags: Record<ModuleKey, boolean> = ENABLED_MODULES): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => flags[i.module]) })).filter(
    (g) => g.items.length > 0,
  );
}

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Whether `item` is the open page. */
export function isItemActive(item: NavItem, pathname: string): boolean {
  if ((item.exceptPaths ?? []).some((p) => under(pathname, p))) return false;
  if ((item.activePaths ?? []).some((p) => under(pathname, p))) return true;
  if (item.to === '/') return pathname === '/';
  return item.matchPrefix ? under(pathname, item.to) : pathname === item.to;
}

/** The entry (and its group) for a route: the active entry, else null. */
export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isItemActive(item, pathname)) return { group, item };
    }
  }
  return null;
}

/**
 * The page title for a route, so the header names where you ARE rather than
 * the last sidebar entry clicked (a deep link or an in-page navigation never
 * touches the sidebar). Null for an unknown route.
 */
export function routeTitle(pathname: string, t: (key: string) => string): string | null {
  const hit = findNavItem(pathname);
  if (hit) return t(hit.item.labelKey);
  const extra = EXTRA_TITLES.find(([prefix]) => under(pathname, prefix));
  return extra ? t(extra[1]) : null;
}

/** Pages reached from inside other pages, so no sidebar entry names them. Longest prefix first. */
const EXTRA_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/writing-practice', 'writingPractice:title'],
  ['/account/profile', 'account:profile.title'],
  ['/account/friends', 'account:friends.title'],
  ['/account/analytics', 'account:analytics.title'],
  ['/account/xp-history', 'account:xpHistory.title'],
  ['/account', 'accountDesk:nav.account'],
  ['/friends', 'account:friends.title'],
  ['/analytics', 'account:analytics.title'],
  ['/xp-history', 'account:xpHistory.title'],
  ['/community', 'accountDesk:nav.community'],
  ['/pro', 'accountDesk:nav.pro'],
];

const SITE = 'https://flexilingo.com';
const SITE_LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh', 'de', 'vi'];

/** The website's subscription page in the learner's language (opened in the system browser). */
export function subscriptionUrl(language: string | undefined): string {
  const base = (language ?? 'en').split('-')[0];
  return `${SITE}/${SITE_LOCALES.includes(base) ? base : 'en'}/dashboard/subscription`;
}
