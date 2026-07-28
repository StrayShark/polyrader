import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { Card, Button } from '@/components/ui';
import { useMarketStore } from '../stores/market-store';
import { MatchOddsRow } from '../components/MatchOddsRow';
import { LoadingSpinner, LoadingState } from '../components/LoadingState';
import {
  isSubgameMarketQuestion,
  parsePolymarketMatch,
  type MarketCategory,
} from '../utils/match-parser';
import type { EsportsGame, Market } from '@polyrader/core/browser';
import { cn } from '../utils/cn';
import type { OddsFormat } from '../utils/bet-math';
import { readOddsFormatPreference } from '../utils/odds-format-preference';
import {
  hasDisplayableTwoWayPrices,
  isLobbyVisibleMatch,
} from '../utils/match-eligibility';
import { api } from '../utils/api';

type TimeFilter = 'all' | 'live' | 'starting_soon' | 'today' | 'tomorrow' | 'upcoming';

interface AnalysisRunSummary {
  matchId: string;
  marketId: string;
  status: string;
  validationStatus: string;
}

interface LobbyMarketGroup {
  key: string;
  markets: Market[];
  primaryMarket: Market;
  liquidity: number;
}

const STARTING_SOON_MINUTES = 60;
const MIN_LOBBY_LIQUIDITY_USD = 1_000;
const INTEL_SYNC_KEY = 'polyrader-hltv-intel-synced-at';
const INTEL_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const INTEL_SYNC_TIMEOUT_MS = 15_000;
const MAX_STARTUP_MARKET_RETRIES = 3;
const STARTUP_MARKET_RETRY_DELAY_MS = 750;

function getMarketGame(market: Market): EsportsGame | null {
  const parsed = parsePolymarketMatch(market.question);
  if (parsed?.game) return parsed.game;
  const tag = market.tags.find(
    (item): item is EsportsGame =>
      item === 'cs2' || item === 'lol' || item === 'dota2' || item === 'valorant',
  );
  if (tag) return tag;
  const canonical = market.canonicalMatchId ?? market.match?.canonicalMatchId ?? '';
  if (canonical.startsWith('dota2:')) return 'dota2';
  if (canonical.startsWith('lol:')) return 'lol';
  if (canonical.startsWith('valorant:')) return 'valorant';
  if (canonical.startsWith('hltv:')) return 'cs2';
  return null;
}

function isEsportsMatchMarket(market: Market): boolean {
  return (
    getMarketGame(market) !== null &&
    (parsePolymarketMatch(market.question) !== null || Boolean(market.match))
  );
}

function getMarketCategory(market: Market) {
  const parsed = parsePolymarketMatch(market.question);
  return parsed?.category;
}

function isLobbyMarketCategory(category: MarketCategory | undefined): boolean {
  return (
    category === 'match_winner' ||
    category === 'handicap' ||
    category === 'total_maps'
  );
}

function isLobbyMarket(market: Market): boolean {
  return (
    isLobbyMarketCategory(getMarketCategory(market)) &&
    !isSubgameMarketQuestion(market.question)
  );
}

function isToday(dateIso: string | undefined): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function isTomorrow(dateIso: string | undefined): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
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
  return (
    !Number.isNaN(d.getTime()) &&
    d.getTime() > Date.now() &&
    !isToday(scheduled) &&
    !isTomorrow(scheduled)
  );
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

function getMarketAnalysisKeys(market: Market): string[] {
  const category = getMarketCategory(market);
  return [
    market.conditionId,
    category ? `${market.conditionId}:${category}` : undefined,
    market.slug,
    market.canonicalMatchId,
    market.match?.matchId,
    market.match?.matchId && category ? `${market.match.matchId}:${category}` : undefined,
    market.match?.canonicalMatchId,
  ].filter((value): value is string => Boolean(value));
}

function isCompletedAnalysisRun(run: AnalysisRunSummary): boolean {
  return (
    (run.validationStatus === 'valid' || run.validationStatus === 'repaired') &&
    (run.status === 'validated' ||
      run.status === 'report_ready' ||
      run.status === 'decision_ready')
  );
}

function normalizeTeamKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([+-]?\d+(?:\.\d+)?\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function isTeamLikeOutcome(name: string): boolean {
  return !/^(yes|no|over|under|o\s*\d|u\s*\d)/i.test(name.trim());
}

function getGroupingTeamNames(market: Market): [string, string] | null {
  const parsed = parsePolymarketMatch(market.question);
  if (!parsed) return null;
  if (
    parsed.category === 'handicap' &&
    market.outcomes.length >= 2 &&
    market.outcomes.slice(0, 2).every(isTeamLikeOutcome)
  ) {
    return [market.outcomes[0], market.outcomes[1]];
  }
  return [parsed.teamAName, parsed.teamBName];
}

function getDateKey(market: Market): string {
  const date = market.match?.scheduledAt ?? market.endDate;
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return 'unknown-date';
}

function getGroupKey(market: Market): string {
  const game = getMarketGame(market) ?? 'unknown-game';
  const groupingTeams = getGroupingTeamNames(market);
  if (groupingTeams) {
    const teams = groupingTeams
      .map(normalizeTeamKey)
      .filter(Boolean)
      .sort()
      .join('__');
    if (teams) return `${game}:${teams}:${getDateKey(market)}`;
  }
  return market.match?.canonicalMatchId ?? market.canonicalMatchId ?? market.conditionId;
}

function getCategoryRank(category: MarketCategory | undefined): number {
  switch (category) {
    case 'match_winner':
      return 0;
    case 'handicap':
      return 1;
    case 'total_maps':
      return 2;
    case 'map_winner':
      return 3;
    case 'correct_score':
      return 4;
    default:
      return 10;
  }
}

function getMarketSortRank(market: Market): number {
  const parsed = parsePolymarketMatch(market.question);
  return getCategoryRank(parsed?.category) * 100 + (parsed?.mapNumber ?? 0);
}

function hasKnownEventName(market: Market): boolean {
  if (market.match?.eventName?.trim()) return true;
  const parsed = parsePolymarketMatch(market.question);
  return Boolean(parsed?.eventName && parsed.eventName !== 'Unknown Event');
}

function choosePrimaryMarket(markets: Market[]): Market {
  const sorted = [...markets].sort((a, b) => {
    const eventDelta = Number(!hasKnownEventName(a)) - Number(!hasKnownEventName(b));
    if (eventDelta !== 0) return eventDelta;
    const rankDelta = getMarketSortRank(a) - getMarketSortRank(b);
    if (rankDelta !== 0) return rankDelta;
    return (b.liquidity ?? 0) - (a.liquidity ?? 0);
  });
  return sorted[0];
}

function groupLobbyMarkets(markets: Market[]): LobbyMarketGroup[] {
  const groups = new Map<string, Market[]>();
  for (const market of markets) {
    const key = getGroupKey(market);
    const existing = groups.get(key);
    if (existing) existing.push(market);
    else groups.set(key, [market]);
  }

  return Array.from(groups.entries()).map(([key, groupMarkets]) => {
    const sortedMarkets = [...groupMarkets].sort((a, b) => {
      const rankDelta = getMarketSortRank(a) - getMarketSortRank(b);
      if (rankDelta !== 0) return rankDelta;
      return (b.liquidity ?? 0) - (a.liquidity ?? 0);
    });
    return {
      key,
      markets: sortedMarkets,
      primaryMarket: choosePrimaryMarket(sortedMarkets),
      liquidity: sortedMarkets.reduce((sum, item) => sum + (item.liquidity ?? 0), 0),
    };
  });
}

export function EventLobbyPage() {
  const { t } = useI18n();
  const { markets, isLoading, error, fetchMarkets } = useMarketStore();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [oddsFormat] = useState<OddsFormat>(() => readOddsFormatPreference());
  const [isSyncingIntel, setIsSyncingIntel] = useState(false);
  const [isStartupRetryScheduled, setIsStartupRetryScheduled] = useState(false);
  const startupMarketRetryCount = useRef(0);
  const [analyzedMarketKeys, setAnalyzedMarketKeys] = useState<Set<string>>(() => new Set());

  const fetchAnalysisReadiness = useCallback(async () => {
    const { data } = await api.get<{ data: AnalysisRunSummary[] }>('/analysis/runs?limit=200');
    const keys = new Set<string>();
    for (const run of data ?? []) {
      if (!isCompletedAnalysisRun(run)) continue;
      if (run.marketId) keys.add(run.marketId);
      if (run.matchId) keys.add(run.matchId);
    }
    setAnalyzedMarketKeys(keys);
  }, []);

  const syncMatches = useCallback(async () => {
    setIsSyncingIntel(true);
    try {
      await api.post<{ data: { enrichmentQueued?: boolean } }>(
        '/esports/fetch-upcoming',
        undefined,
        { timeoutMs: INTEL_SYNC_TIMEOUT_MS },
      );
      sessionStorage.setItem(INTEL_SYNC_KEY, String(Date.now()));
    } catch {
      // Keep the local schedule usable while HLTV or GRID is temporarily unavailable.
    } finally {
      await fetchMarkets(200);
      void fetchAnalysisReadiness().catch(() => setAnalyzedMarketKeys(new Set()));
      setIsSyncingIntel(false);
    }
  }, [fetchAnalysisReadiness, fetchMarkets]);

  useEffect(() => {
    void fetchMarkets(200);
  }, [fetchMarkets]);

  useEffect(() => {
    void fetchAnalysisReadiness().catch(() => setAnalyzedMarketKeys(new Set()));
  }, [fetchAnalysisReadiness]);

  useEffect(() => {
    if (!error || markets.length > 0 || isLoading) {
      if (markets.length > 0) startupMarketRetryCount.current = 0;
      return;
    }
    if (startupMarketRetryCount.current >= MAX_STARTUP_MARKET_RETRIES) return;

    startupMarketRetryCount.current += 1;
    setIsStartupRetryScheduled(true);
    const timeoutId = window.setTimeout(() => {
      setIsStartupRetryScheduled(false);
      void fetchMarkets(200);
    }, STARTUP_MARKET_RETRY_DELAY_MS * startupMarketRetryCount.current);
    return () => window.clearTimeout(timeoutId);
  }, [error, fetchMarkets, isLoading, markets.length]);

  useEffect(() => {
    const lastSync = Number(sessionStorage.getItem(INTEL_SYNC_KEY) ?? 0);
    if (Date.now() - lastSync < INTEL_SYNC_INTERVAL_MS) return;
    sessionStorage.setItem(INTEL_SYNC_KEY, String(Date.now()));
    void syncMatches().catch(() => {
      // Existing local matches remain available when an external source is temporarily unavailable.
    });
  }, [syncMatches]);

  const allEsportsMarkets = useMemo(() => {
    return markets.filter(
      (market) =>
        isEsportsMatchMarket(market) &&
        (market.liquidity ?? 0) >= MIN_LOBBY_LIQUIDITY_USD &&
        isLobbyVisibleMatch(market.match?.status, market.match?.scheduledAt),
    );
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    return allEsportsMarkets.filter((m) => matchTimeFilter(m, timeFilter));
  }, [allEsportsMarkets, timeFilter]);

  const displayGroups = useMemo(() => {
    const lobbyMarkets = filteredMarkets.filter(isLobbyMarket);
    const resolvedMatchGroups = new Set(
      lobbyMarkets
        .filter(
          (market) =>
            getMarketCategory(market) === 'match_winner' &&
            !hasDisplayableTwoWayPrices(market.outcomePrices),
        )
        .map(getGroupKey),
    );
    const visibleMarkets = lobbyMarkets.filter((market) =>
      hasDisplayableTwoWayPrices(market.outcomePrices),
    );

    return groupLobbyMarkets(visibleMarkets).filter((group) => !resolvedMatchGroups.has(group.key)).sort((a, b) => {
      const gameDelta = (getMarketGame(a.primaryMarket) ?? '').localeCompare(
        getMarketGame(b.primaryMarket) ?? '',
      );
      if (gameDelta !== 0) return gameDelta;
      const aTime = Date.parse(a.primaryMarket.match?.scheduledAt ?? a.primaryMarket.endDate ?? '');
      const bTime = Date.parse(b.primaryMarket.match?.scheduledAt ?? b.primaryMarket.endDate ?? '');
      return (
        (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER)
      );
    });
  }, [filteredMarkets]);

  const timeItems: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t('rail.time_all') },
    { key: 'live', label: t('rail.time_live') },
    { key: 'starting_soon', label: t('rail.time_starting_soon') },
    { key: 'today', label: t('rail.time_today') },
    { key: 'tomorrow', label: t('rail.time_tomorrow') },
    { key: 'upcoming', label: t('rail.time_upcoming') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('lobby.title')}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap justify-end gap-1">
            {timeItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setTimeFilter(item.key)}
                className={cn(
                  'flex items-center justify-center rounded-md px-2.5 py-1.5 text-[11px] transition-colors',
                  timeFilter === item.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => void syncMatches()}
            disabled={isLoading || isSyncingIntel}
          >
            {isSyncingIntel ? (
              <LoadingSpinner className="h-4 w-4" size={14} />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t(isSyncingIntel ? 'lobby.refreshing' : 'lobby.refresh')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {(isLoading || isStartupRetryScheduled) && markets.length === 0 ? (
          <LoadingState className="min-h-[240px]" label={t('common.loading')} />
        ) : error && markets.length === 0 ? (
          <Card>
            <div className="p-6 text-sm text-red">{error}</div>
          </Card>
        ) : displayGroups.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-sm text-muted-foreground">{t('lobby.empty')}</div>
          </Card>
        ) : (
          <div
            className="grid gap-3 xl:grid-cols-2"
            data-testid="lobby-market-grid"
          >
            {displayGroups.map((group) => (
              <MatchOddsRow
                key={group.key}
                market={group.primaryMarket}
                markets={group.markets}
                displayFormat={oddsFormat}
                liquidity={group.liquidity}
                analysisReady={group.markets
                  .flatMap((market) => getMarketAnalysisKeys(market))
                  .some((key) => analyzedMarketKeys.has(key))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
