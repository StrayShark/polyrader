import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './sidebar';
import { StatusBar } from './status-bar';
import { TickerBar } from '../components/TickerBar';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationBell } from '../components/NotificationBell';
import { useMarketStore } from '../stores/market-store';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { useWhaleAlerts } from '../hooks/use-whale-alerts';
import { useCopySignalAlerts } from '../hooks/use-copy-signal-alerts';
import { useSettlementAlerts } from '../hooks/use-settlement-alerts';
import { useI18n } from '../hooks/use-i18n';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fetchMarkets = useMarketStore((state) => state.fetchMarkets);
  const { t } = useI18n();
  useKeyboardShortcuts({ onCommandPalette: () => setPaletteOpen((o) => !o) });
  useWhaleAlerts();
  useCopySignalAlerts();
  useSettlementAlerts();

  useEffect(() => {
    void fetchMarkets(20);
  }, [fetchMarkets]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar: always visible on large screens */}
      <div className="hidden h-full lg:block">
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

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar: global search + notifications */}
        <header className="flex h-12 items-center gap-3 border-b border-border px-4">
          <div className="lg:hidden">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />
          </div>
          <span className="text-sm font-semibold lg:hidden">PolyRader CS2</span>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 sm:max-w-xs"
            aria-label={t('search.title')}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{t('search.placeholder')}</span>
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
          </div>
        </header>

        {/* Real-time price ticker */}
        <TickerBar />

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
        <StatusBar />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
