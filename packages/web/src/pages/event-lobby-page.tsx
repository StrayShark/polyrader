import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Loader2, ChevronDown, ChevronUp, Percent, Hash, DollarSign } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { Card, Button, Badge, Skeleton } from '@/components/ui';
import { useMarketStore } from '../stores/market-store';
import { MatchOddsRow } from '../components/MatchOddsRow';
import { parsePolymarketMatch } from '../utils/match-parser';
import { CS2Rail, type CS2RailFilters } from '../components/CS2Rail';
import { EmptyStateGuide } from '../components/EmptyStateGuide';
import type { Market } from '@polyrader/core/browser';
import { classifyEventTier } from '@polyrader/core/browser';
import { cn } from '../utils/cn';
import type { OddsFormat } from '../utils/bet-math';
import { api } from '../utils/api';

const ODDS_FORMAT_KEY = 'polyrader-odds-format';

const ODDS_FORMATS: { key: OddsFormat; labelKey: string; icon: typeof Percent }[] = [
  { key: 'decimal', labelKey: 'lobby.oddsFormatDecimal', icon: Hash },
  { key: 'probability', labelKey: 'lobby.oddsFormatProbability', icon: Percent },
  { key: 'american', labelKey: 'lobby.oddsFormatAmerican', icon: DollarSign },
];

type TimeFilter = CS2RailFilters['time'];

const STARTING_SOON_MINUTES = 60;
const INTEL_SYNC_KEY = 'polyrader-hltv-intel-synced-at';
const INTEL_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const INTEL_SYNC_TIMEOUT_MS = 15_000;

type RefreshStatus = 'idle' | 'queued' | 'complete' | 'cached';

function isCs2MatchMarket(market: Market): boolean {
  const q = market.question.toLowerCase();
  return q.startsWith('counter-strike') || q.includes('cs2') || q.includes('csgo');
}

function isMatchWinnerMarket(market: Market): boolean {
  const parsed = parsePolymarketMatch(market.question);
  return parsed !== null && !parsed.isMapMarket;
}

function isToday(dateIso: string | undefined): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isTomorrow(dateIso: string | undefined): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
}

function isStartingSoon(dateIso: string | undefined): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const diff = d.getTime() - Date.now();
  return diff > 0 && diff <= STARTING_SOON_MINUTES * 60 * 1000;
}

function isLive(market: Market): boolean {
  return market.match?.status === 'live';
}

function isUpcoming(market: Market): boolean {
  if (isLive(market)) return false;
  const scheduled = market.match?.scheduledAt ?? market.endDate;
  if (!scheduled) return false;
  const d = new Date(scheduled);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now() && !isToday(scheduled) && !isTomorrow(scheduled);
}

function matchTimeFilter(market: Market, time: TimeFilter): boolean {
  const scheduled = market.match?.scheduledAt ?? market.endDate;
  switch (time) {
    case 'live':
      return isLive(market);
    case 'starting_soon':
      return isStartingSoon(scheduled);
    case 'today':
      return isToday(scheduled) && !isLive(market);
    case 'tomorrow':
      return isTomorrow(scheduled);
    case 'upcoming':
      return isUpcoming(market);
    default:
      return true;
  }
}

function getMatchKey(market: Market): string {
  if (market.canonicalMatchId) return market.canonicalMatchId;
  const parsed = parsePolymarketMatch(market.question);
  if (!parsed) return market.conditionId;
  const base = `${parsed.teamAName} vs ${parsed.teamBName}`;
  const event = parsed.eventName;
  return `${event}::${base}`;
}

function getMarketTier(market: Market, parsed: ReturnType<typeof parsePolymarketMatch>): 'S' | 'A' | 'B' | 'C' | null {
  const eventName = parsed?.eventName || market.match?.eventName;
  if (!eventName) return null;
  const eventType = market.match?.eventType ?? 'Online';
  return classifyEventTier({ stars: 0, eventType, eventName });
}

export function EventLobbyPage() {
  const { t } = useI18n();
  const { markets, isLoading, error, fetchMarkets } = useMarketStore();
  const [filters, setFilters] = useState<CS2RailFilters>({
    time: 'all',
    format: 'all',
    tier: 'all',
  });
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(() => {
    const saved = localStorage.getItem(ODDS_FORMAT_KEY);
    return (saved as OddsFormat) ?? 'decimal';
  });
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [isSyncingIntel, setIsSyncingIntel] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle');

  const syncMatches = useCallback(async () => {
    setIsSyncingIntel(true);
    setRefreshStatus('idle');
    try {
      const { data } = await api.post<{ data: { enrichmentQueued?: boolean } }>(
        '/esports/fetch-upcoming',
        undefined,
        { timeoutMs: INTEL_SYNC_TIMEOUT_MS },
      );
      sessionStorage.setItem(INTEL_SYNC_KEY, String(Date.now()));
      setRefreshStatus(data?.enrichmentQueued ? 'queued' : 'complete');
    } catch {
      // Keep the local schedule usable while HLTV or GRID is temporarily unavailable.
      setRefreshStatus('cached');
    } finally {
      await fetchMarkets(100);
      setIsSyncingIntel(false);
    }
  }, [fetchMarkets]);

  useEffect(() => {
    localStorage.setItem(ODDS_FORMAT_KEY, oddsFormat);
  }, [oddsFormat]);

  useEffect(() => {
    void fetchMarkets(100);
  }, [fetchMarkets]);

  useEffect(() => {
    const lastSync = Number(sessionStorage.getItem(INTEL_SYNC_KEY) ?? 0);
    if (Date.now() - lastSync < INTEL_SYNC_INTERVAL_MS) return;
    sessionStorage.setItem(INTEL_SYNC_KEY, String(Date.now()));
    void syncMatches().catch(() => {
      // Existing local matches remain available when an external source is temporarily unavailable.
    });
  }, [syncMatches]);

  const allCs2Markets = useMemo(() => {
    return markets.filter(isCs2MatchMarket);
  }, [markets]);

  const tournaments = useMemo(() => {
    const set = new Set<string>();
    for (const m of allCs2Markets) {
      const parsed = parsePolymarketMatch(m.question);
      if (parsed?.eventName) set.add(parsed.eventName);
    }
    return Array.from(set).sort();
  }, [allCs2Markets]);

  const filteredMarkets = useMemo(() => {
    return allCs2Markets.filter((m) => {
      const parsed = parsePolymarketMatch(m.question);
      if (filters.format !== 'all' && parsed?.format !== filters.format) return false;
      if (filters.tournament && parsed?.eventName !== filters.tournament) return false;
      if (!matchTimeFilter(m, filters.time)) return false;
      if (filters.tier !== 'all') {
        const tier = getMarketTier(m, parsed);
        if (tier !== filters.tier) return false;
      }
      return true;
    });
  }, [allCs2Markets, filters]);

  const matchWinnerMarkets = useMemo(() => {
    return filteredMarkets.filter(isMatchWinnerMarket);
  }, [filteredMarkets]);

  const mapMarketsByMatch = useMemo(() => {
    const map = new Map<string, Market[]>();
    for (const m of filteredMarkets) {
      const parsed = parsePolymarketMatch(m.question);
      if (!parsed?.isMapMarket) continue;
      const key = getMatchKey(m);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [filteredMarkets]);

  const grouped = useMemo(() => {
    const map = new Map<string, Market[]>();
    for (const m of matchWinnerMarkets) {
      const parsed = parsePolymarketMatch(m.question);
      const key = parsed?.eventName ?? t('lobby.unknownEvent');
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [matchWinnerMarkets, t]);

  const toggleExpand = (matchKey: string) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchKey)) next.delete(matchKey);
      else next.add(matchKey);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            {t('lobby.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('lobby.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            {ODDS_FORMATS.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setOddsFormat(key)}
                className={cn(
                  'flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors',
                  oddsFormat === key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={t(labelKey)}
                aria-label={t(labelKey)}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{t(labelKey)}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => void syncMatches()} disabled={isLoading || isSyncingIntel}>
            {isSyncingIntel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t(isSyncingIntel ? 'lobby.refreshing' : 'lobby.refresh')}
          </Button>
        </div>
      </div>

      {(refreshStatus !== 'idle' || (error && markets.length > 0)) && (
        <div className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {refreshStatus === 'queued'
            ? t('lobby.refreshQueued')
            : refreshStatus === 'complete'
              ? t('lobby.refreshComplete')
              : t('lobby.cachedDataNotice')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <CS2Rail
          filters={filters}
          onChange={setFilters}
          tournaments={tournaments}
          onClear={() => setFilters({ time: 'all', format: 'all', tier: 'all' })}
        />

        {/* Content */}
        <div className="space-y-4">
          {isLoading && markets.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : error && markets.length === 0 ? (
            <Card>
              <div className="p-6 text-sm text-red">{error}</div>
            </Card>
          ) : grouped.length === 0 ? (
            <div className="space-y-3">
              <EmptyStateGuide
                icon={Trophy}
                title={t('lobby.empty')}
                description={t('lobby.emptyHint')}
                steps={[
                  t('lobby.emptyStep1'),
                  t('lobby.emptyStep2'),
                  t('lobby.emptyStep3'),
                ]}
              />
              {(filters.time !== 'all' || filters.format !== 'all' || filters.tier !== 'all' || filters.tournament || filters.mapComplete) && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ time: 'all', format: 'all', tier: 'all' })}
                  >
                    {t('rail.clearFilters')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([eventName, eventMarkets]) => (
                <div key={eventName} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{eventName}</h2>
                    <Badge variant="secondary" className="text-[10px]">
                      {eventMarkets.length}
                    </Badge>
                  </div>
                  <div className="grid gap-3">
                    {eventMarkets.map((market) => {
                      const matchKey = getMatchKey(market);
                      const mapMarkets = mapMarketsByMatch.get(matchKey) ?? [];
                      const hasMore = mapMarkets.length > 0;
                      const expanded = expandedMatches.has(matchKey);
                      return (
                        <div key={market.conditionId} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <MatchOddsRow market={market} displayFormat={oddsFormat} />
                            </div>
                            {hasMore && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 px-2 text-xs"
                                onClick={() => toggleExpand(matchKey)}
                                aria-label={expanded ? t('lobby.collapseMarkets') : t('lobby.expandMarkets')}
                              >
                                {expanded ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <>
                                    <span>+{mapMarkets.length}</span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                          {expanded && hasMore && (
                            <div className={cn('grid gap-2 pl-4 sm:grid-cols-2 lg:grid-cols-3', hasMore && 'border-l-2 border-border ml-2')}>
                              {mapMarkets.map((mapMarket) => (
                                <MatchOddsRow key={mapMarket.conditionId} market={mapMarket} displayFormat={oddsFormat} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
