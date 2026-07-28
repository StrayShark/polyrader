import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, Fish, Menu, Settings, Trophy, Wallet, X } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

const navigation = [
  {
    to: '/',
    icon: Trophy,
    labelKey: 'nav.lobby',
    activePrefixes: ['/match', '/esports', '/signals', '/ai/stats', '/prompt-variants'],
  },
  {
    to: '/bankroll',
    icon: Wallet,
    labelKey: 'nav.bankroll',
    activePrefixes: [
      '/bankroll',
      '/strategy',
      '/analysis/report',
      '/validation-lab',
      '/allocation',
      '/llm/analysis',
    ],
  },
  {
    to: '/whales',
    icon: Fish,
    labelKey: 'nav.whales',
    activePrefixes: ['/whales', '/polymarket/account'],
  },
  {
    to: '/daily',
    icon: CalendarDays,
    labelKey: 'nav.daily',
    activePrefixes: ['/daily'],
  },
];

interface SidebarProps { onToggle?: () => void }

function isItemActive(
  pathname: string,
  item: { to: string; activePrefixes: string[] },
  isExactActive: boolean,
): boolean {
  if (isExactActive) return true;
  return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function Sidebar({ onToggle }: SidebarProps) {
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {onToggle && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        data-testid="app-sidebar"
        className={cn(
          'flex flex-col border-r border-border bg-sidebar transition-all duration-200',
          'fixed inset-y-0 left-0 z-50 w-[240px]',
          'lg:static lg:z-auto lg:h-full',
        )}
      >
        {onToggle && (
          <div className="flex h-10 items-center justify-end border-b border-border px-2 lg:hidden">
            <button
              onClick={onToggle}
              className="rounded p-1.5 text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
              aria-label={t('nav.closeMenu')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-auto py-3" aria-label="Primary">
          <div className="space-y-2">
            {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onToggle}
                  className={({ isActive }) =>
                    cn(
                      'mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isItemActive(pathname, item, isActive)
                        ? 'bg-sidebar-active text-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
                    )
                  }
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
            ))}
          </div>
        </nav>

        <nav className="border-t border-border p-2" aria-label="Settings" data-testid="sidebar-footer">
          <NavLink
            to="/settings"
            onClick={onToggle}
            className={({ isActive }) => cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
              isActive || pathname === '/database' || pathname === '/ai/config'
                ? 'bg-sidebar-active text-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
            )}
          >
            <Settings aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{t('nav.settings')}</span>
          </NavLink>
        </nav>
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md p-2 hover:bg-muted lg:hidden"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
