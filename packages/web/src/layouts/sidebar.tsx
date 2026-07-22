import { NavLink } from 'react-router-dom';
import {
  Trophy,
  Ticket,
  Wallet,
  FlaskConical,
  Settings,
  Fish,
  Activity,
  BarChart3,
  Beaker,
  PieChart,
  LineChart,
  CreditCard,
  Menu,
  X,
  FileJson2,
  ClipboardCheck,
} from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';
import { useFeatureFlagStore } from '../stores/feature-flag-store';

const navigation = [
  {
    group: 'Practice',
    items: [
      { to: '/', icon: Trophy, labelKey: 'nav.lobby' },
      { to: '/bankroll', icon: Wallet, labelKey: 'nav.bankroll' },
    ],
  },
  {
    group: 'Data',
    items: [
      { to: '/strategy', icon: FlaskConical, labelKey: 'nav.strategy' },
      { to: '/analysis/report', icon: FileJson2, labelKey: 'nav.analysisReport' },
      { to: '/validation-lab', icon: ClipboardCheck, labelKey: 'nav.validationLab' },
    ],
  },
  {
    group: 'Advanced',
    items: [
      { to: '/daily', icon: Ticket, labelKey: 'nav.daily' },
      { to: '/esports', icon: Activity, labelKey: 'nav.esports' },
      { to: '/signals', icon: BarChart3, labelKey: 'nav.signals' },
      { to: '/whales', icon: Fish, labelKey: 'nav.whales' },
      { to: '/ai/stats', icon: LineChart, labelKey: 'nav.aiStats' },
      { to: '/prompt-variants', icon: Beaker, labelKey: 'nav.promptVariants' },
      { to: '/allocation', icon: PieChart, labelKey: 'nav.allocation' },
      { to: '/polymarket/account', icon: CreditCard, labelKey: 'nav.polymarketAccount', featureFlag: 'polymarketAccountEnabled' as const },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { t } = useI18n();
  const { polymarketAccountEnabled } = useFeatureFlagStore();

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && onToggle && (
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
          collapsed && '-translate-x-full lg:translate-x-0 lg:w-[64px]',
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
          {navigation.map((group) => (
            <div key={group.group} className="mb-2">
              {!collapsed && (
                <div className="px-4 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </div>
              )}
              {group.items
                .filter((item) => (item.featureFlag ? polymarketAccountEnabled : true))
                .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onToggle}
                  className={({ isActive }) =>
                    cn(
                      'mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      collapsed && 'lg:justify-center lg:px-2',
                      isActive
                        ? 'bg-sidebar-active text-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <nav className="border-t border-border p-2" aria-label="Settings" data-testid="sidebar-footer">
          <NavLink
            to="/settings"
            onClick={onToggle}
            className={({ isActive }) => cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors',
              collapsed && 'lg:justify-center lg:px-2',
              isActive
                ? 'bg-sidebar-active text-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
            )}
            title={collapsed ? t('nav.settings') : undefined}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>{t('nav.settings')}</span>}
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
