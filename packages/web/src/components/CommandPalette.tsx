import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Trophy,
  Wallet,
  BookOpen,
  Database,
  FlaskConical,
  CalendarDays,
  Fish,
  Gamepad2,
  Activity,
  Settings2,
  BarChart3,
  Beaker,
  PieChart,
  LineChart,
  CreditCard,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import { useMarketStore } from '../stores/market-store';
import { useWhaleStore } from '../stores/whale-store';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';
import { useFeatureFlagStore } from '../stores/feature-flag-store';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  group: string;
  keywords: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const NAV_PAGES: Array<{ to: string; icon: LucideIcon; labelKey: string; featureFlag?: 'polymarketAccountEnabled' }> = [
  // Practice
  { to: '/', icon: Trophy, labelKey: 'nav.lobby' },
  { to: '/bankroll', icon: Wallet, labelKey: 'nav.bankroll' },
  { to: '/review', icon: BookOpen, labelKey: 'nav.review' },
  // Data
  { to: '/database', icon: Database, labelKey: 'nav.database' },
  { to: '/strategy', icon: FlaskConical, labelKey: 'nav.strategy' },
  { to: '/settings', icon: Settings2, labelKey: 'nav.settings' },
  // Advanced
  { to: '/daily', icon: CalendarDays, labelKey: 'nav.daily' },
  { to: '/esports', icon: Gamepad2, labelKey: 'nav.esports' },
  { to: '/signals', icon: Activity, labelKey: 'nav.signals' },
  { to: '/whales', icon: Fish, labelKey: 'nav.whales' },
  { to: '/ai/config', icon: Settings2, labelKey: 'nav.aiConfig' },
  { to: '/ai/stats', icon: BarChart3, labelKey: 'nav.aiStats' },
  { to: '/prompt-variants', icon: Beaker, labelKey: 'nav.promptVariants' },
  { to: '/allocation', icon: PieChart, labelKey: 'nav.allocation' },
  { to: '/simulation', icon: LineChart, labelKey: 'nav.simulation' },
  { to: '/polymarket/account', icon: CreditCard, labelKey: 'nav.polymarketAccount', featureFlag: 'polymarketAccountEnabled' },
];

/**
 * CommandPalette — global Cmd/Ctrl+K search across pages, markets and whales.
 * Markets and whales come from their respective Zustand stores (already loaded
 * for the current session); pages are always available as quick-jump targets.
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const markets = useMarketStore((s) => s.markets);
  const whales = useWhaleStore((s) => s.whales);
  const fetchWhales = useWhaleStore((s) => s.fetchWhales);
  const { polymarketAccountEnabled } = useFeatureFlagStore();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state + focus input each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // Lazily ensure whales are available for search.
    if (whales.length === 0) void fetchWhales({ limit: 50 });
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, whales.length, fetchWhales]);

  // Global Escape closes the palette regardless of focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const items = useMemo<CommandItem[]>(() => {
    const pages: CommandItem[] = NAV_PAGES
      .filter((p) => (p.featureFlag ? polymarketAccountEnabled : true))
      .map((p) => {
      const label = t(p.labelKey);
      return {
        id: `page:${p.to}`,
        label,
        icon: p.icon,
        to: p.to,
        group: t('search.groupPages'),
        keywords: `${label} ${p.to}`.toLowerCase(),
      };
    });

    const marketItems: CommandItem[] = markets.slice(0, 50).map((m) => ({
      id: `market:${m.conditionId}`,
      label: m.question,
      hint: m.match?.eventName,
      icon: Swords,
      to: `/match/${m.slug}`,
      group: t('search.groupMarkets'),
      keywords: `${m.question} ${m.slug} ${m.match?.eventName ?? ''}`.toLowerCase(),
    }));

    const whaleItems: CommandItem[] = whales.slice(0, 50).map((w) => ({
      id: `whale:${w.address}`,
      label: `${w.address.slice(0, 8)}…${w.address.slice(-6)}`,
      hint: w.label,
      icon: Fish,
      to: `/whales/${w.address}`,
      group: t('search.groupWhales'),
      keywords: `${w.address} ${w.label ?? ''}`.toLowerCase(),
    }));

    return [...pages, ...marketItems, ...whaleItems];
  }, [markets, whales, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.group === t('search.groupPages'));
    return items.filter((i) => i.keywords.includes(q)).slice(0, 30);
  }, [items, query, t]);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const select = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group results for display while preserving the flat index for keyboard nav.
  let runningIndex = -1;
  const groups: Array<{ name: string; items: Array<{ item: CommandItem; index: number }> }> = [];
  for (const item of filtered) {
    runningIndex += 1;
    const idx = runningIndex;
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) {
      last.items.push({ item, index: idx });
    } else {
      groups.push({ name: item.group, items: [{ item, index: idx }] });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="relative z-[61] w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in-0 zoom-in-95"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('search.noResults')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-1">
                <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </div>
                {group.items.map(({ item, index }) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => select(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        index === activeIndex ? 'bg-accent text-foreground' : 'text-foreground/90 hover:bg-accent/60',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{item.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
