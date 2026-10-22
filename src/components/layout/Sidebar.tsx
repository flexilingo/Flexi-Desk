import { useEffect, type ReactElement } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bug, ChevronsLeft, ChevronsRight, Crown, Sparkles } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { isPaidTier, useSubscriptionStore } from '@/stores/subscriptionStore';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { isItemActive, visibleGroups, type NavItem } from '@/components/layout/sidebarConfig';

const BUG_URL = 'https://github.com/flexilingo/Flexi-Desk/issues/new';

/** Row shape shared by every entry, so links, the offer and the foot line up. */
const ROW = 'relative flex items-center rounded-md text-[13.5px] leading-5 transition-colors';
const ROW_OPEN = 'gap-2.5 px-3 py-[7px]';
const ROW_MINI = 'mx-auto h-10 w-10 justify-center';
const IDLE =
  'text-sidebar-foreground/80 hover:bg-sidebar-foreground/[0.05] hover:text-sidebar-foreground';

/**
 * The label beside an icon in the mini sidebar: opens at once, on the page side,
 * in the website's olive tooltip.
 */
function MiniLabel({
  label,
  side,
  children,
}: {
  label: string;
  side: 'left' | 'right';
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarLink({
  item,
  collapsed,
  side,
}: {
  item: NavItem;
  collapsed: boolean;
  side: 'left' | 'right';
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const active = isItemActive(item, pathname);
  const label = t(item.labelKey);
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.to}
      onClick={() => setCurrentPage(label)}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        ROW,
        collapsed ? ROW_MINI : ROW_OPEN,
        // The open page: a soft tinted pill, a semibold label and the terra icon —
        // the website's treatment, on cream.
        active
          ? 'bg-primary/[0.075] font-semibold text-sidebar-foreground dark:bg-sidebar-foreground/[0.08]'
          : IDLE,
      )}
    >
      {collapsed && item.monogram ? (
        <span
          aria-hidden="true"
          className={cn(
            'text-[10px] font-bold leading-none tracking-wide',
            active ? 'text-sidebar-accent' : 'text-sidebar-muted',
          )}
        >
          {item.monogram}
        </span>
      ) : (
        <Icon
          aria-hidden="true"
          strokeWidth={active ? 2.2 : 1.9}
          className={cn(
            'h-4 w-4 shrink-0',
            active ? 'text-sidebar-accent' : 'text-sidebar-muted/80',
          )}
        />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  return collapsed ? (
    <MiniLabel label={label} side={side}>
      {link}
    </MiniLabel>
  ) : (
    link
  );
}

/**
 * The PRO offer at the foot of the sidebar, as on the website: shown to a
 * signed-in learner who has not bought a plan (a trial is still offered the
 * purchase). A bought plan gets a quiet link to its page instead. Both open the
 * app's own Pro page (payments from there open in the system browser).
 */
function ProOffer({ collapsed, side }: { collapsed: boolean; side: 'left' | 'right' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const subscription = useSubscriptionStore((s) => s.subscription);
  const hasResolved = useSubscriptionStore((s) => s.hasResolved);
  const isLoading = useSubscriptionStore((s) => s.isLoading);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);

  useEffect(() => {
    if (session && !hasResolved && !isLoading) void fetchSubscription();
  }, [session, hasResolved, isLoading, fetchSubscription]);

  if (!session || !hasResolved) return null;

  const tier = subscription?.tier ?? 'free';
  const bought = isPaidTier(tier) && tier !== 'trial' && subscription?.status !== 'trialing';
  const open = () => navigate('/subscription');

  if (bought) {
    const plan = tier === 'lifetime' ? 'Lifetime' : tier === 'pro_max' ? 'PRO MAX' : 'PRO';
    const title = t('nav.planTitle', { plan });
    if (collapsed) {
      return (
        <MiniLabel label={title} side={side}>
          <button
            type="button"
            onClick={open}
            aria-label={title}
            className={cn(ROW, ROW_MINI, IDLE)}
          >
            <Crown className="h-4 w-4 text-warning" aria-hidden="true" strokeWidth={1.9} />
          </button>
        </MiniLabel>
      );
    }
    return (
      <button type="button" onClick={open} className={cn(ROW, ROW_OPEN, IDLE, 'text-start')}>
        <Crown className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" strokeWidth={1.9} />
        <span className="min-w-0 truncate font-semibold">{title}</span>
      </button>
    );
  }

  const label = t('nav.upgradeToPro');
  if (collapsed) {
    return (
      <MiniLabel label={label} side={side}>
        <button
          type="button"
          onClick={open}
          aria-label={label}
          className={cn(ROW, ROW_MINI, 'text-accent hover:bg-accent/10')}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" strokeWidth={1.9} />
        </button>
      </MiniLabel>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      className="mb-1 flex items-start gap-2.5 rounded-md border border-accent/30 bg-accent/[0.07] px-3 py-2.5 text-start transition-colors hover:bg-accent/[0.12]"
    >
      <Sparkles
        className="mt-0.5 h-4 w-4 shrink-0 text-accent"
        aria-hidden="true"
        strokeWidth={1.9}
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold leading-5 text-sidebar-foreground">
          {label}
        </span>
        <span className="block truncate text-[11.5px] leading-4 text-sidebar-muted">
          {t('nav.upgradeToProBody')}
        </span>
      </span>
    </button>
  );
}

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { t, i18n } = useTranslation();
  const collapsed = !sidebarOpen;
  const isRtl = i18n.dir(i18n.language) === 'rtl';
  const side = isRtl ? 'left' : 'right';
  const groups = visibleGroups();

  // Points the way the sidebar will move: in when open, out when folded.
  const CollapseIcon = isRtl === collapsed ? ChevronsLeft : ChevronsRight;
  const collapseLabel = collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar');
  const bugLabel = t('nav.reportBug');

  const footButton = (
    label: string,
    icon: ReactElement,
    onClick: () => void,
    expanded?: boolean,
  ) => {
    const button = (
      <button
        type="button"
        onClick={onClick}
        aria-label={collapsed ? label : undefined}
        aria-expanded={expanded}
        className={cn(
          ROW,
          collapsed ? ROW_MINI : ROW_OPEN,
          'text-sidebar-muted hover:bg-sidebar-foreground/[0.05] hover:text-sidebar-foreground',
        )}
      >
        {icon}
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
    return collapsed ? (
      <MiniLabel label={label} side={side}>
        {button}
      </MiniLabel>
    ) : (
      button
    );
  };

  return (
    // One provider for every mini label: once one is open, the next opens at
    // once while the pointer runs down the column.
    <TooltipProvider delayDuration={100} skipDelayDuration={400}>
      <aside
        className={cn(
          'flex h-screen shrink-0 flex-col overflow-hidden border-e border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            'flex h-14 shrink-0 items-center',
            collapsed ? 'justify-center' : 'gap-2.5 ps-5 pe-4',
          )}
        >
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
            width={32}
            height={32}
          />
          {!collapsed && (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[15px] font-extrabold tracking-tight text-sidebar-foreground">
                FlexiLingo
              </span>
              <span className="rounded-xs bg-primary/[0.08] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-sidebar-muted dark:bg-sidebar-foreground/[0.08]">
                Desk
              </span>
            </span>
          )}
        </div>

        {/* Menu */}
        <nav className="scrollbar-hide flex-1 overflow-y-auto overflow-x-hidden py-2">
          {groups.map((group, idx) => (
            <div key={group.id} className={cn(collapsed ? 'px-2' : 'px-3', idx > 0 && 'mt-3')}>
              {collapsed
                ? idx > 0 && <div className="mx-3 mb-2.5 h-px bg-border" />
                : !group.hideLabel && (
                    <div className="mb-1 px-3 text-[11.5px] font-semibold uppercase leading-4 tracking-wider text-sidebar-muted/70">
                      {t(group.labelKey)}
                    </div>
                  )}
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <SidebarLink key={item.to} item={item} collapsed={collapsed} side={side} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Foot: the PRO offer, bug report and the fold toggle. */}
        <div
          className={cn(
            'flex shrink-0 flex-col gap-px border-t border-border py-2',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          <ProOffer collapsed={collapsed} side={side} />
          {footButton(
            bugLabel,
            <Bug className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={1.9} />,
            () => void openUrl(BUG_URL),
          )}
          {footButton(
            collapseLabel,
            <CollapseIcon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={1.9} />,
            toggleSidebar,
            !collapsed,
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
