import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar, MobileMenuButton } from './sidebar';
import { StatusBar } from './status-bar';
import { CommandPalette } from '../components/CommandPalette';
import { PracticeBetSlip } from '../components/PracticeBetSlip';
import { MobileBetSlipDrawer } from '../components/MobileBetSlipDrawer';
import { useMarketStore } from '../stores/market-store';
import { useBankrollStore } from '../stores/bankroll-store';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { useWhaleAlerts } from '../hooks/use-whale-alerts';
import { useCopySignalAlerts } from '../hooks/use-copy-signal-alerts';
import { useSettlementAlerts } from '../hooks/use-settlement-alerts';
import { cn } from '../utils/cn';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fetchMarkets = useMarketStore((state) => state.fetchMarkets);
  const fetchSummary = useBankrollStore((state) => state.fetchSummary);
  const { pathname } = useLocation();
  const showBetSlip = pathname === '/match' || pathname.startsWith('/match/');
  useKeyboardShortcuts({ onCommandPalette: () => setPaletteOpen((o) => !o) });
  useWhaleAlerts();
  useCopySignalAlerts();
  useSettlementAlerts();

  useEffect(() => {
    void fetchMarkets(200);
  }, [fetchMarkets]);

  useEffect(() => {
    if (showBetSlip) void fetchSummary();
  }, [fetchSummary, showBetSlip]);

  return (
    <div
      data-testid="practice-app-shell"
      className={cn(
        'relative grid h-screen overflow-hidden bg-background text-foreground',
        showBetSlip
          ? 'lg:grid-cols-[240px_minmax(0,1fr)_340px]'
          : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <div
        data-testid="window-top-border"
        className="pointer-events-none absolute inset-x-0 top-0 z-50 h-px bg-border"
      />

      {/* Desktop rail: navigation, theme and advanced entry points */}
      <div className="hidden min-h-0 border-r border-border bg-sidebar lg:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar: only rendered when menu is open */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <Sidebar onToggle={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="relative flex min-w-0 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex items-center justify-between px-3 lg:hidden">
          <div className="pointer-events-auto">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          </div>
          <div className="pointer-events-auto">
            {showBetSlip && <MobileBetSlipDrawer />}
          </div>
        </div>

        <main className="min-w-0 flex-1 overflow-auto p-4 pt-14 md:p-5 md:pt-14 lg:p-6 lg:pt-6">
          <Outlet />
        </main>

        <StatusBar />
      </div>

      {showBetSlip && (
        <aside
          data-testid="desktop-bet-slip"
          className="hidden min-h-0 border-l border-border bg-card/50 p-3 lg:flex lg:flex-col"
        >
          <PracticeBetSlip />
        </aside>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
