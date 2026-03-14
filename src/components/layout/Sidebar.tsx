import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  BookOpen,
  MessageSquare,
  Captions,
  Mic,
  PenLine,
  GraduationCap,
  Podcast,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/review', label: 'SRS Review', icon: Brain },
  { to: '/reading', label: 'Reading', icon: BookOpen },
  { to: '/tutor', label: 'AI Tutor', icon: MessageSquare },
  { to: '/caption', label: 'Live Caption', icon: Captions },
  { to: '/pronunciation', label: 'Pronunciation', icon: Mic },
  { to: '/writing', label: 'Writing', icon: PenLine },
  { to: '/exam', label: 'Exam', icon: GraduationCap },
  { to: '/podcast', label: 'Podcast', icon: Podcast },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const isRtl = document.documentElement.dir === 'rtl';

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-screen flex-col border-e border-border bg-sidebar text-sidebar-foreground transition-all duration-300',
          sidebarOpen ? 'w-60' : 'w-16',
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-3">
          {sidebarOpen && (
            <span className="text-lg font-bold tracking-tight text-primary">FlexiDesk</span>
          )}
          <button
            onClick={toggleSidebar}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
            ) : (
              <PanelLeft className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <Separator />

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setCurrentPage(item.label)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent/20 text-sidebar-accent'
                        : 'text-sidebar-foreground hover:bg-muted',
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </NavLink>
              );

              if (!sidebarOpen) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side={isRtl ? 'left' : 'right'}>{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return link;
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <Separator />
        <div className="flex h-12 items-center justify-center px-3">
          {sidebarOpen ? (
            <span className="text-xs text-muted-foreground">Powered by FlexiLingo</span>
          ) : (
            <span className="text-xs font-bold text-primary">FL</span>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
