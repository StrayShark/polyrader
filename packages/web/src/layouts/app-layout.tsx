import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './sidebar';
import { StatusBar } from './status-bar';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationBell } from '../components/NotificationBell';
import { VirtualBankrollBar } from '../components/VirtualBankrollBar';
import { PracticeBetSlip } from '../components/PracticeBetSlip';
import { MobileBetSlipDrawer } from '../components/MobileBetSlipDrawer';
import { useMarketStore } from '../stores/market-store';
import { useBankrollStore } from '../stores/bankroll-store';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { useWhaleAlerts } from '../hooks/use-whale-alerts';
import { useCopySignalAlerts } from '../hooks/use-copy-signal-alerts';
import { useSettlementAlerts } from '../hooks/use-settlement-alerts';
import { useI18n } from '../hooks/use-i18n';
import { PRODUCT_NAME } from '../utils/brand';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fetchMarkets = useMarketStore((state) => state.fetchMarkets);
  const fetchSummary = useBankrollStore((state) => state.fetchSummary);
  const { t } = useI18n();
  useKeyboardShortcuts({ onCommandPalette: () => setPaletteOpen((o) => !o) });
  useWhaleAlerts();
  useCopySignalAlerts();
  useSettlementAlerts();

  useEffect(() => {
    void fetchMarkets(20);
    void fetchSummary();
  }, [fetchMarkets, fetchSummary]);

  return (
    <div
      data-testid="practice-app-shell"
      className="grid h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[240px_minmax(0,1fr)_340px]"
    >
      {/* Desktop rail: navigation, theme and advanced entry points */}
      <div className="hidden min-h-0 border-r border-border bg-sidebar lg:block">
        <Sidebar collapsed={false} />
      </div>

      {/* Mobile sidebar: only rendered when menu is open */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <Sidebar
            collapsed={false}
            onToggle={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-col overflow-hidden">
        {/* Compact desk bar */}
        <header className="flex h-14 items-center gap-2 border-b border-border bg-card/60 px-2 sm:gap-3 sm:px-4">
          <div className="lg:hidden">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary sm:inline-flex">
              Practice Mode
            </span>
            <span className="hidden truncate text-sm font-semibold sm:inline lg:hidden">{PRODUCT_NAME}</span>
          </div>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-0 text-sm text-muted-foreground transition-colors hover:bg-accent/50 sm:w-auto sm:flex-1 sm:justify-start sm:px-3 sm:max-w-sm"
            aria-label={t('search.title')}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden flex-1 text-left sm:inline">{t('search.placeholder')}</span>
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <MobileBetSlipDrawer />
            <NotificationBell />
          </div>
        </header>

        {/* Virtual bankroll bar */}
        <VirtualBankrollBar />

        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-5 lg:p-6">
          <Outlet />
        </main>

        <StatusBar />
      </div>

      {/* Desktop practice slip */}
      <aside
        data-testid="desktop-bet-slip"
        className="hidden min-h-0 border-l border-border bg-card/50 p-3 lg:flex lg:flex-col"
      >
        <PracticeBetSlip />
      </aside>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
