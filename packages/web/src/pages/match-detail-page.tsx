import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Brain,
  BarChart3,
  Users,
  AlertTriangle,
  Loader2,
  Target,
  Info,
  Trophy,
  ChevronRight,
  Swords,
} from 'lucide-react';
import { api } from '../utils/api';
import { PriceChart } from '../components/PriceChart';
import { OrderBookChart } from '../components/OrderBookChart';
import { WinRateTimeline, type TimelineSnapshot } from '../components/WinRateTimeline';
import { MatchDetailSkeleton } from '../components/Skeletons';
import { useWebSocket } from '../hooks/use-websocket';
import { useI18n } from '../hooks/use-i18n';
import {
  Card,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { OddsButton } from '../components/OddsButton';
import { usePracticeSlipStore } from '../stores/practice-slip-store';
import { MatchSourcePanel } from '../components/SourceAlignmentPanel';
import { TeamIntelligencePanel } from '../components/TeamIntelligencePanel';
import { AnalysisDataSnapshotPanel } from '../components/AnalysisDataSnapshotPanel';
import { MarketLiquidityWarning } from '../components/MarketLiquidityWarning';
import { MultiMarketAnalysisPanel } from '../components/MultiMarketAnalysisPanel';
import { DotaDataQualityPanel } from '../components/DotaDataQualityPanel';
import { RiotGameDataQualityPanel } from '../components/RiotGameDataQualityPanel';
import { parsePolymarketMatch, type MarketCategory } from '../utils/match-parser';
import { useMarketStore } from '../stores/market-store';
import type {
  LLMAggregation,
  LLMAnalysisResult,
  MatchInfo,
  Market,
  NormalizedMatchFacts,
  TeamBrief,
} from '@polyrader/core/browser';

export function MatchDetailPage() {
  const { slug } = useParams();
  const { subscribe } = useWebSocket();
  const { t, locale } = useI18n();
  const { markets, fetchMarkets } = useMarketStore();
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [aggregation, setAggregation] = useState<LLMAggregation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const addLeg = usePracticeSlipStore((s) => s.addLeg);
  const [priceData, setPriceData] = useState<Array<{ time: string; value: number }>>([]);
  const [orderBookData, setOrderBookData] = useState<{
    bids: Array<{ price: number; size: number; side: 'bid' }>;
    asks: Array<{ price: number; size: number; side: 'ask' }>;
  }>({ bids: [], asks: [] });
  const [timelineData, setTimelineData] = useState<TimelineSnapshot[]>([]);
  const [section, setSection] = useState('overview');
  const [conditionId, setConditionId] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [marketSource, setMarketSource] = useState<'local-sim' | 'polymarket' | null>(null);
  const [normalizedFacts, setNormalizedFacts] = useState<NormalizedMatchFacts | null>(null);

  const loadMatch = useCallback(async () => {
    if (!slug) return;
    setMatchLoading(true);
    try {
      const { data } = await api.get<{ data: MatchInfo }>(`/esports/matches/${slug}`);
      setMatch(data);
    } catch {
      setMatch(null);
    } finally {
      setMatchLoading(false);
    }
  }, [slug]);

  // Fetch match data
  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    if (!slug) return;
    setNormalizedFacts(null);
    api
      .get<{ data: NormalizedMatchFacts[] }>('/validation-lab/boards/dota2/facts?limit=50')
      .then(({ data }) => {
        const ids = new Set([slug, match?.matchId].filter(Boolean));
        setNormalizedFacts(data.find((facts) => ids.has(facts.externalMatchId)) ?? null);
      })
      .catch(() => setNormalizedFacts(null));
  }, [match?.matchId, slug]);

  useEffect(() => {
    if (markets.length === 0) void fetchMarkets(200, 0);
  }, [fetchMarkets, markets.length]);

  useEffect(() => {
    if (!slug) return;
    api
      .get<{ data: { conditionId: string; outcomePrices: string[]; tags?: string[] } }>(
        `/markets/by-slug/${slug}`,
      )
      .then(({ data }) => {
        setConditionId(data.conditionId);
        setLivePrice(parseFloat(data.outcomePrices[0] ?? '0.5'));
        setMarketSource(data.tags?.includes('local-sim') ? 'local-sim' : 'polymarket');
      })
      .catch(() => {
        setConditionId(null);
        setMarketSource(null);
      });
    // Live trading is intentionally hidden from the main path per simulation-first positioning.
  }, [slug]);

  useEffect(() => {
    if (!conditionId) return;
    const unsub = subscribe(`prices:${conditionId}`, (data: unknown) => {
      const payload = data as { price?: number };
      if (payload.price !== undefined) setLivePrice(payload.price);
    });
    return unsub;
  }, [conditionId, subscribe]);

  // Fetch price data
  useEffect(() => {
    if (!slug) return;
    api
      .get<{ data: Array<{ timestamp: string; price: number }> }>(
        `/markets/${slug}/prices?interval=1h`,
      )
      .then(({ data }) => {
        setPriceData(data.map((p) => ({ time: p.timestamp, value: p.price })));
      })
      .catch(() => {});
  }, [slug]);

  // Fetch order book data (poll every 10s)
  useEffect(() => {
    if (!slug || marketSource === null) return;
    if (marketSource === 'local-sim') {
      setOrderBookData({ bids: [], asks: [] });
      return;
    }
    const fetchOrderBook = () => {
      api
        .get<{
          data: {
            bids: Array<{ price: string; size: string }>;
            asks: Array<{ price: string; size: string }>;
          };
        }>(`/markets/${slug}/orderbook`)
        .then(({ data }) => {
          setOrderBookData({
            bids: data.bids.map((b) => ({
              price: parseFloat(b.price),
              size: parseFloat(b.size),
              side: 'bid' as const,
            })),
            asks: data.asks.map((a) => ({
              price: parseFloat(a.price),
              size: parseFloat(a.size),
              side: 'ask' as const,
            })),
          });
        })
        .catch(() => {});
    };
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 10000);
    return () => clearInterval(interval);
  }, [slug, marketSource]);

  // Fetch 24h analysis timeline for win-rate chart
  useEffect(() => {
    if (!slug) return;
    api
      .get<{ data: TimelineSnapshot[] }>(`/ai/analysis/timeline/${slug}`)
      .then(({ data }) => setTimelineData(data))
      .catch(() => setTimelineData([]));
  }, [slug, aggregation]);

  // Real-time: update analysis when auto-analysis broadcast arrives
  useEffect(() => {
    if (!slug) return;
    return subscribe('analysis', (data) => {
      const payload = data as { matchId?: string; aggregation?: LLMAggregation };
      if (payload.matchId === slug && payload.aggregation) {
        setAggregation(payload.aggregation);
      }
    });
  }, [subscribe, slug]);

  const triggerAnalysis = async () => {
    if (!slug || !match) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const { data } = await api.post<{ data: LLMAggregation }>(`/ai/analyze`, {
        matchId: slug,
        teamAId: match.teamA.teamId,
        teamBId: match.teamB.teamId,
        locale,
      });
      if (data) {
        setAggregation(data);
      }
    } catch (err) {
      setAnalysisError((err as Error).message);
    }
    setIsAnalyzing(false);
  };

  const matchOddsA = livePrice && livePrice > 0 ? 1 / livePrice : undefined;
  const matchOddsB = livePrice && livePrice > 0 && livePrice < 1 ? 1 / (1 - livePrice) : undefined;

  const handleAddMatchWinner = (side: 'a' | 'b') => {
    if (!match || !matchOddsA || !matchOddsB) return;
    const selection = side === 'a' ? match.teamA.name : match.teamB.name;
    const odds = side === 'a' ? matchOddsA : matchOddsB;
    addLeg({
      id: '',
      matchId: match.matchId ?? slug ?? '',
      marketId: conditionId ?? slug ?? '',
      selection,
      odds,
      source: marketSource === 'local-sim' ? 'local-sim' : 'polymarket',
      matchLabel: `${match.teamA.name} vs ${match.teamB.name}`,
      marketLabel: t('match.matchWinner'),
      matchFormat: match.format,
    });
  };

  const results = aggregation?.results ?? [];
  const consensus = aggregation?.consensus;
  // kelly allocation intentionally not surfaced as betting advice
  const aggregatedProb = aggregation?.aggregatedProbability;
  const lineups = match?.lineups;

  const consensusLabels: Record<string, string> = {
    strong: t('match.strongConsensus'),
    moderate: t('match.mediumConsensus'),
    weak: t('match.weakConsensus'),
    divergent: t('match.disagreement'),
  };

  // Group related markets for this match — must stay before any early return to keep hook order stable.
  const relatedMarkets = useMemo<Market[]>(() => {
    if (!match) return [];
    return markets.filter((m: Market) => {
      const parsed = parsePolymarketMatch(m.question);
      if (!parsed) return false;
      return parsed.teamAName === match.teamA.name && parsed.teamBName === match.teamB.name;
    });
  }, [markets, match]);

  const marketsByCategory = useMemo(() => {
    const map = new Map<MarketCategory, typeof relatedMarkets>();
    for (const m of relatedMarkets) {
      const parsed = parsePolymarketMatch(m.question);
      if (!parsed) continue;
      const list = map.get(parsed.category) ?? [];
      list.push(m);
      map.set(parsed.category, list);
    }
    return map;
  }, [relatedMarkets]);

  const primaryMarket = useMemo(
    () =>
      relatedMarkets.find((market) => market.conditionId === conditionId) ??
      marketsByCategory.get('match_winner')?.[0],
    [conditionId, marketsByCategory, relatedMarkets],
  );

  if (matchLoading) {
    return <MatchDetailSkeleton />;
  }

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">{t('match.notFound')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('match.waitForHltv')}</p>
      </div>
    );
  }

  const teamAPlayers = lineups?.teamA?.players ?? [];
  const teamBPlayers = lineups?.teamB?.players ?? [];
  const hasLineups = teamAPlayers.length > 0 || teamBPlayers.length > 0;
  const lineupsConfirmed = Boolean(lineups?.teamA?.isConfirmed && lineups?.teamB?.isConfirmed);
  const teamAHasStandin = lineups?.teamA?.hasStandin ?? false;
  const teamBHasStandin = lineups?.teamB?.hasStandin ?? false;

  const handleAddMarketLeg = (market: Market, sideIndex: number) => {
    const parsed = parsePolymarketMatch(market.question);
    if (!parsed || !match) return;
    const price = parseFloat(market.outcomePrices[sideIndex] ?? '0');
    if (!price || price <= 0 || price >= 1) return;
    const odds = 1 / price;
    const selection =
      market.outcomes[sideIndex] ?? (sideIndex === 0 ? parsed.teamAName : parsed.teamBName);
    addLeg({
      id: '',
      matchId: match.matchId ?? slug ?? '',
      marketId: market.conditionId,
      selection,
      odds,
      source: 'polymarket',
      matchLabel: `${parsed.teamAName} vs ${parsed.teamBName}`,
      marketLabel: parsed.marketLabel,
      matchFormat: match.format ?? parsed.format,
    });
  };

  const renderOddsMatrix = (market: Market) => {
    const parsed = parsePolymarketMatch(market.question);
    if (!parsed) return null;
    return (
      <div key={market.conditionId} className="flex flex-col items-end gap-2">
        <MarketLiquidityWarning liquidity={market.liquidity} tags={market.tags} compact />
        <div className="flex items-center gap-3">
          {market.outcomePrices.map((p, idx) => {
            const price = parseFloat(p);
            const odds = price > 0 && price < 1 ? 1 / price : 0;
            const selection =
              market.outcomes[idx] ?? (idx === 0 ? parsed.teamAName : parsed.teamBName);
            return (
              <OddsButton
                key={idx}
                odds={odds}
                selection={selection}
                disabled={odds < 1.01}
                onClick={() => handleAddMarketLeg(market, idx)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Match header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            {t('nav.lobby')}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{match.eventName}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Trophy className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {match.teamA.name} <span className="text-muted-foreground">vs</span> {match.teamB.name}
          </h1>
          <Badge variant="outline" className="text-[10px]">
            {match.format}
          </Badge>
          {match.status === 'live' && (
            <Badge variant="red" className="text-[10px]">
              {t('lobby.live')}
            </Badge>
          )}
          {match.status === 'finished' && (
            <Badge variant="outline" className="text-[10px]">
              {t('match.statusFinished')}
            </Badge>
          )}
          {match.status === 'delayed' && (
            <Badge variant="yellow" className="text-[10px]">
              {t('match.statusDelayed')}
            </Badge>
          )}
          {match.status === 'cancelled' && (
            <Badge variant="outline" className="text-[10px]">
              {t('match.statusCancelled')}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {match.eventName} · {match.format}
          {livePrice !== null && (
            <span className="ml-2 tabular-nums">
              · {t('match.livePrice')} {(livePrice * 100).toFixed(1)}¢
            </span>
          )}
        </p>
      </div>

      {analysisError && (
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">
          {analysisError}
        </div>
      )}

      <Tabs value={section} onValueChange={setSection} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t('match.sectionOverview')}</TabsTrigger>
          <TabsTrigger value="market">{t('match.sectionMarket')}</TabsTrigger>
          <TabsTrigger value="analysis">{t('match.sectionAnalysis')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
          {/* Match Header */}
          <Card className="overflow-hidden p-0">
            <div className="grid min-h-40 grid-cols-[minmax(0,1fr)_82px_minmax(0,1fr)] items-center gap-2 px-3 py-5 sm:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] sm:px-6">
              <MatchTeamIdentity team={match.teamA} />
              <div className="text-center">
                <div className="truncate text-xs text-muted-foreground">{match.eventName}</div>
                <div className="mt-2 text-xl font-semibold tabular-nums">
                  {match.currentScore
                    ? `${match.currentScore.teamA} : ${match.currentScore.teamB}`
                    : 'VS'}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded border border-border px-1.5 py-0.5">{match.format}</span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    {match.eventType}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {match.scheduledAt
                    ? new Date(match.scheduledAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'TBD'}
                </div>
              </div>
              <MatchTeamIdentity team={match.teamB} align="right" />
            </div>
          </Card>

          {match.teamDetails && (
            <TeamIntelligencePanel
              teamA={match.teamDetails.teamA}
              teamB={match.teamDetails.teamB}
              lineups={lineups}
              isComplete={match.teamDetails.isComplete}
              updatedAt={match.teamDetails.updatedAt}
            />
          )}

          {normalizedFacts && <DotaDataQualityPanel match={normalizedFacts} />}
          {normalizedFacts && <RiotGameDataQualityPanel match={normalizedFacts} />}

          <MatchSourcePanel
            matchId={match.matchId ?? slug ?? ''}
            teamA={match.teamA}
            teamB={match.teamB}
            lineups={lineups}
            onLineupRefresh={loadMatch}
          />

          {/* Odds Matrix */}
          <div className="space-y-4">
            {/* Match Winner */}
            <Card className="p-4">
              <CardHeader className="flex-row items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('match.matchWinner')}</CardTitle>
                {primaryMarket && (
                  <MarketLiquidityWarning
                    liquidity={primaryMarket.liquidity}
                    tags={primaryMarket.tags}
                    compact
                    className="ml-auto"
                  />
                )}
              </CardHeader>
              <p className="mb-4 text-xs text-muted-foreground">{t('match.practiceHint')}</p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-24 truncate text-sm font-medium">{match.teamA.name}</span>
                  <OddsButton
                    odds={matchOddsA ?? 0}
                    selection={match.teamA.name}
                    disabled={!matchOddsA}
                    onClick={() => handleAddMatchWinner('a')}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-24 truncate text-sm font-medium">{match.teamB.name}</span>
                  <OddsButton
                    odds={matchOddsB ?? 0}
                    selection={match.teamB.name}
                    disabled={!matchOddsB}
                    onClick={() => handleAddMatchWinner('b')}
                  />
                </div>
              </div>
            </Card>

            {/* Map Winners */}
            {(marketsByCategory.get('map_winner')?.length ?? 0) > 0 && (
              <Card className="p-4">
                <CardHeader className="flex-row items-center gap-2 mb-4">
                  <Swords className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('match.mapWinners')}</CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  {marketsByCategory.get('map_winner')?.map((market) => {
                    const parsed = parsePolymarketMatch(market.question);
                    return (
                      <div
                        key={market.conditionId}
                        className="flex items-center justify-between rounded-md border border-border p-3"
                      >
                        <span className="text-sm font-medium">
                          {parsed?.marketLabel ?? market.question}
                        </span>
                        {renderOddsMatrix(market)}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Handicap */}
            {(marketsByCategory.get('handicap')?.length ?? 0) > 0 && (
              <Card className="p-4">
                <CardHeader className="flex-row items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('match.handicap')}</CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  {marketsByCategory.get('handicap')?.map((market) => (
                    <div
                      key={market.conditionId}
                      className="flex items-center justify-between rounded-md border border-border p-3"
                    >
                      <span className="text-sm font-medium">{market.question}</span>
                      {renderOddsMatrix(market)}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Total Maps */}
            {(marketsByCategory.get('total_maps')?.length ?? 0) > 0 && (
              <Card className="p-4">
                <CardHeader className="flex-row items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('match.totalMaps')}</CardTitle>
                </CardHeader>
                <div className="space-y-3">
                  {marketsByCategory.get('total_maps')?.map((market) => (
                    <div
                      key={market.conditionId}
                      className="flex items-center justify-between rounded-md border border-border p-3"
                    >
                      <span className="text-sm font-medium">{market.question}</span>
                      {renderOddsMatrix(market)}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Correct Score */}
            {(marketsByCategory.get('correct_score')?.length ?? 0) > 0 && (
              <Card className="p-4">
                <CardHeader className="flex-row items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{t('match.correctScore')}</CardTitle>
                </CardHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  {marketsByCategory
                    .get('correct_score')
                    ?.map((market) => renderOddsMatrix(market))}
                </div>
              </Card>
            )}

            {relatedMarkets.length === 0 && (
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">{t('match.noRelatedMarkets')}</div>
              </Card>
            )}
          </div>

          {/* Lineup Comparison */}
          <Card className="p-4">
            <CardHeader className="flex-row items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">{t('match.lineupComparison')}</CardTitle>
              {hasLineups && lineupsConfirmed ? (
                <Badge variant="green" className="ml-auto text-[10px]">
                  {t('match.lineupConfirmed')}
                </Badge>
              ) : hasLineups ? (
                <Badge variant="yellow" className="ml-auto text-[10px]">
                  {t('sourceAlignment.lineupFallback')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {t('match.lineupPending')}
                </Badge>
              )}
            </CardHeader>

            {hasLineups ? (
              <div className="grid grid-cols-2 gap-6">
                {[
                  { players: teamAPlayers, name: match.teamA.name, hasStandin: teamAHasStandin },
                  { players: teamBPlayers, name: match.teamB.name, hasStandin: teamBHasStandin },
                ].map(({ players, name, hasStandin }) => {
                  const avgRating =
                    players.length > 0
                      ? players.reduce((s, p) => s + p.rating, 0) / players.length
                      : 0;
                  const avgImpact =
                    players.length > 0
                      ? players.reduce((s, p) => s + p.impactScore, 0) / players.length
                      : 0;
                  return (
                    <div key={name}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('match.lineup', { name })}
                        </span>
                        {hasStandin && (
                          <Badge variant="red" className="text-[9px]">
                            {t('match.withSubstitute')}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {players.map((p) => (
                          <div
                            key={p.playerId}
                            className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs ${p.isStandin ? 'bg-red/10 border border-red/20' : 'bg-muted/50'}`}
                          >
                            <span className="w-20 font-medium truncate">{p.nickname}</span>
                            <span className="w-14 text-muted-foreground">{p.role}</span>
                            <span
                              className={`tabular-nums ${p.isStandin ? 'text-red' : 'text-green'}`}
                            >
                              {p.rating.toFixed(2)}
                            </span>
                            {p.isStandin && (
                              <Badge variant="red" className="text-[9px]">
                                {t('match.substitute')}
                              </Badge>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <div className="h-1 w-12 rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${p.impactScore}%` }}
                                />
                              </div>
                              <span className="w-6 text-right tabular-nums text-muted-foreground">
                                {p.impactScore}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                        <span>
                          {t('match.avgRating')}{' '}
                          <span className="text-foreground font-medium">
                            {avgRating.toFixed(2)}
                          </span>
                        </span>
                        <span>
                          {t('match.impact')}{' '}
                          <span className="text-foreground font-medium">
                            {Math.round(avgImpact)}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('match.lineupEmpty')}
              </div>
            )}

            {hasLineups && (teamAHasStandin || teamBHasStandin) && (
              <div className="mt-4 rounded-md bg-muted p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-yellow" />
                  <div className="text-xs text-muted-foreground">
                    {teamAHasStandin && t('match.substituteWarning', { name: match.teamA.name })}
                    {teamBHasStandin && t('match.substituteWarning', { name: match.teamB.name })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4 mt-0">
          <div className="flex items-start gap-2 rounded-md border border-yellow/20 bg-yellow/5 p-3 text-xs text-yellow">
            <Info className="h-4 w-4 shrink-0" />
            <span>{t('match.aiReferenceHint')}</span>
          </div>

          {aggregation?.analysisData && (
            <AnalysisDataSnapshotPanel snapshot={aggregation.analysisData} />
          )}

          {/* Probability comparison: market vs model vs user */}
          <Card className="p-4">
            <CardHeader className="flex-row items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('match.probabilityComparison')}</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={triggerAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> {t('match.analyzing')}
                  </>
                ) : (
                  <>
                    <Brain className="mr-1 h-3.5 w-3.5" /> {t('match.triggerAnalysis')}
                  </>
                )}
              </Button>
            </CardHeader>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Market probability */}
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{t('match.marketProbability')}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{match.teamA.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(matchOddsA ? 1 / matchOddsA : 0.5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-medium">
                    {matchOddsA ? `${((1 / matchOddsA) * 100).toFixed(1)}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{match.teamB.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-orange"
                      style={{ width: `${(matchOddsB ? 1 / matchOddsB : 0.5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-medium">
                    {matchOddsB ? `${((1 / matchOddsB) * 100).toFixed(1)}%` : '--'}
                  </span>
                </div>
              </div>

              {/* Model probability */}
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{t('match.modelProbability')}</div>
                {aggregatedProb ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{match.teamA.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${aggregatedProb.teamA * 100}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums font-medium">
                        {(aggregatedProb.teamA * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{match.teamB.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                        <div
                          className="h-full bg-orange"
                          style={{ width: `${aggregatedProb.teamB * 100}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums font-medium">
                        {(aggregatedProb.teamB * 100).toFixed(1)}%
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    {t('match.modelProbabilityEmpty')}
                  </div>
                )}
              </div>

              {/* User probability */}
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{t('match.yourProbability')}</div>
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {t('match.yourProbabilityHint')}
                </div>
              </div>
            </div>
          </Card>

          {aggregation?.marketAnalyses && aggregation.marketAnalyses.length > 0 && (
            <MultiMarketAnalysisPanel analyses={aggregation.marketAnalyses} />
          )}

          {/* LLM Consensus (collapsed detail) */}
          {results.length > 0 && (
            <Card className="p-4">
              <CardHeader className="flex-row items-center gap-2 mb-4">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('match.llmConsensus')}</CardTitle>
                {consensus && (
                  <Badge
                    variant={
                      consensus.level === 'strong'
                        ? 'green'
                        : consensus.level === 'moderate'
                          ? 'yellow'
                          : consensus.level === 'weak'
                            ? 'orange'
                            : 'red'
                    }
                    className="ml-auto text-[10px]"
                  >
                    {consensusLabels[consensus.level]}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {t('match.aiReferenceLabel')}
                </Badge>
              </CardHeader>

              <div className="space-y-3">
                {results.map((r) => {
                  const isStream = isAnalyzing && !('winProbability' in r);
                  const teamAProb = isStream
                    ? (r as { probability: number }).probability
                    : (r as LLMAnalysisResult).winProbability.teamA;
                  const teamBProb = isStream
                    ? 1 - (r as { probability: number }).probability
                    : (r as LLMAnalysisResult).winProbability.teamB;
                  return (
                    <div key={r.provider} className="rounded-md border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium capitalize">{r.provider}</span>
                          {!isStream && (
                            <span className="text-[10px] text-muted-foreground">
                              {(r as LLMAnalysisResult).model}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {'error' in r && r.error ? (
                            <span className="text-red">{r.error}</span>
                          ) : (
                            <>
                              <span>
                                {(r.confidence * 100).toFixed(0)}
                                {t('match.confidence')}
                              </span>
                              {!isStream && <span>{(r as LLMAnalysisResult).latency}ms</span>}
                              {!isStream && (r as LLMAnalysisResult).paperDecisionAction && (
                                <Badge
                                  variant={
                                    (r as LLMAnalysisResult).paperDecisionAction === 'paper_bet'
                                      ? 'green'
                                      : (r as LLMAnalysisResult).paperDecisionAction === 'rejected'
                                        ? 'yellow'
                                        : 'secondary'
                                  }
                                  className="text-[10px]"
                                >
                                  {(r as LLMAnalysisResult).paperDecisionAction}
                                </Badge>
                              )}
                              {!isStream && (r as LLMAnalysisResult).analysisRunId && (
                                <Link
                                  to={`/analysis/report/${encodeURIComponent((r as LLMAnalysisResult).analysisRunId!)}`}
                                  className="text-primary hover:underline"
                                >
                                  {t('match.openAnalysisReport')}
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {!('error' in r && r.error) && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {match?.teamA.name}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden flex">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${teamAProb * 100}%` }}
                              />
                              <div
                                className="h-full bg-orange"
                                style={{ width: `${teamBProb * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {match?.teamB.name}
                            </span>
                          </div>
                          {r.reasoning && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">
                              {r.reasoning}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="market" className="space-y-4 mt-0">
          {/* Market Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Win Rate Timeline (24h) */}
            {timelineData.length > 0 && (
              <Card className="p-4">
                <CardHeader className="flex-row items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">
                    {t('match.winRateTimeline') || 'Win Rate Timeline (24h)'}
                  </CardTitle>
                </CardHeader>
                <WinRateTimeline
                  data={timelineData}
                  teamAName={match?.teamA.name ?? 'Team A'}
                  teamBName={match?.teamB.name ?? 'Team B'}
                  height={180}
                />
              </Card>
            )}

            {/* Price Chart */}
            <Card className="p-4">
              <CardHeader className="flex-row items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('match.priceTrend')}</CardTitle>
              </CardHeader>
              {priceData.length > 0 ? (
                <PriceChart data={priceData} height={180} />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  {t('match.noPriceData')}
                </div>
              )}
            </Card>

            {/* Order Book */}
            <Card className="p-4">
              <CardTitle className="text-sm mb-4">{t('match.orderBookDepth')}</CardTitle>
              {marketSource === 'local-sim' ? (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  {t('match.localOddsNoOrderBook')}
                </div>
              ) : orderBookData.bids.length > 0 || orderBookData.asks.length > 0 ? (
                <OrderBookChart bids={orderBookData.bids} asks={orderBookData.asks} height={180} />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  {t('match.noOrderBookData')}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function MatchTeamIdentity({
  team,
  align = 'left',
}: {
  team: TeamBrief;
  align?: 'left' | 'right';
}) {
  const mark = team.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 ${align === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:text-left'}`}
    >
      {team.logo ? (
        <img
          src={team.logo}
          alt=""
          className="h-14 w-14 shrink-0 rounded border border-border bg-white p-2 object-contain sm:h-16 sm:w-16"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-border bg-muted/30 text-base font-semibold text-muted-foreground sm:h-16 sm:w-16">
          {mark || '?'}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold sm:text-lg">{team.name}</div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          {team.rank > 0 && team.rank < 999 ? `World #${team.rank}` : 'World rank -'}
        </div>
        {team.region && (
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{team.region}</div>
        )}
      </div>
    </div>
  );
}
