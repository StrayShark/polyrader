import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Trophy, TrendingUp, Fish, RefreshCw } from 'lucide-react';
import { createChart, type IChartApi, type LineData, type Time } from 'lightweight-charts';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { DataState } from '../components/DataState';
import { LoadingSpinner } from '../components/LoadingState';
import { FollowWalletButton } from '../components/CopyFollowPanel';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Card, CardHeader, CardTitle, Badge, Button, Progress } from '@/components/ui';
import type { PolymarketUserPosition, WhaleDetail } from '@polyrader/core/browser';

function PerformanceChart({
  data,
  height = 200,
}: {
  data: WhaleDetail['winRateTimeline'];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: '#A1A1AA' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    const winRateSeries = chartRef.current.addLineSeries({
      color: '#3B82F6',
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: (p: number) => `${(p * 100).toFixed(0)}%` },
      title: 'Win Rate',
    });
    const pnlSeries = chartRef.current.addLineSeries({
      color: '#10B981',
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: (p: number) => `$${p.toFixed(0)}` },
      title: 'PnL',
    });

    const winRatePoints: LineData[] = data.map((point, index) => ({
      time: (Date.parse(point.date) / 1000 + index) as Time,
      value: point.winRate,
    }));
    const pnlPoints: LineData[] = data.map((point, index) => ({
      time: (Date.parse(point.date) / 1000 + index) as Time,
      value: point.cumulativePnl,
    }));

    winRateSeries.setData(winRatePoints);
    pnlSeries.setData(pnlPoints);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  if (data.length === 0) return null;
  return <div ref={containerRef} />;
}

export function WhaleDetailPage() {
  const { address } = useParams();
  const { t } = useI18n();
  const [whale, setWhale] = useState<WhaleDetail | null>(null);
  const [positions, setPositions] = useState<PolymarketUserPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    if (!address) return;
    setPositionsLoading(true);
    setPositionsError(null);
    try {
      const { data } = await api.get<{ data: PolymarketUserPosition[] }>(
        `/whales/${encodeURIComponent(address)}/positions?limit=50`,
      );
      setPositions(data);
    } catch (err) {
      setPositions([]);
      setPositionsError((err as Error).message);
    } finally {
      setPositionsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    api.get<{ data: WhaleDetail }>(`/whales/${encodeURIComponent(address)}`)
      .then(({ data }) => setWhale(data))
      .catch((err) => {
        setWhale(null);
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  const perf = whale?.performance;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: t('nav.whales'), to: '/whales' },
          { label: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : t('whales.detailTitle') },
        ]}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/whales">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight">{address}</h1>
            <p className="text-sm text-muted-foreground">{t('whales.detailSubtitle')}</p>
          </div>
        </div>
        {whale && (
          <div className="flex items-center gap-2">
            {whale.isFollowed && <Badge variant="blue">{t('whales.followed')}</Badge>}
            <FollowWalletButton address={whale.address} />
          </div>
        )}
      </div>

      <DataState isLoading={loading} error={error} isEmpty={!loading && !error && !whale}>
        {whale && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {[
                {
                  label: t('whales.winRate'),
                  value: perf ? `${(perf.winRate * 100).toFixed(1)}%` : '—',
                  icon: Trophy,
                },
                {
                  label: t('whales.settledBets'),
                  value: perf ? String(perf.settledBets) : '—',
                  icon: Fish,
                },
                {
                  label: t('whales.roi'),
                  value: perf ? `${(perf.roi * 100).toFixed(1)}%` : '—',
                  icon: TrendingUp,
                },
                {
                  label: t('whales.pnl'),
                  value: perf ? `${perf.totalPnl >= 0 ? '+' : ''}$${perf.totalPnl.toFixed(0)}` : '—',
                  icon: TrendingUp,
                },
              ].map((stat) => (
                <Card key={stat.label} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className={`mt-2 text-2xl font-semibold tabular-nums ${
                    stat.label === t('whales.pnl') && perf && perf.totalPnl < 0 ? 'text-red' : ''
                  }`}>
                    {stat.value}
                  </div>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between border-b px-6 py-3">
                <CardTitle>{t('whales.currentHoldings')}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => void loadPositions()}
                  disabled={positionsLoading}
                  title={t('common.refresh')}
                >
                  {positionsLoading ? (
                    <LoadingSpinner className="h-3.5 w-3.5" size={14} />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardHeader>
              {positionsLoading && positions.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <LoadingSpinner size={28} />
                </div>
              ) : positionsError ? (
                <p className="p-6 text-sm text-red">{positionsError}</p>
              ) : positions.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{t('whales.noCurrentHoldings')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[minmax(280px,1.8fr)_minmax(90px,0.8fr)_repeat(4,minmax(96px,0.7fr))] gap-3 border-b bg-muted/40 px-6 py-2 text-xs font-medium text-muted-foreground">
                      <span>{t('whales.market')}</span>
                      <span>{t('whales.outcome')}</span>
                      <span className="text-right">{t('whales.value')}</span>
                      <span className="text-right">{t('whales.shares')}</span>
                      <span className="text-right">{t('whales.avgCurrentPrice')}</span>
                      <span className="text-right">{t('whales.unrealizedPnl')}</span>
                    </div>
                    <div className="divide-y">
                      {positions.map((position) => {
                        const key = `${position.conditionId ?? position.marketId}-${position.tokenId ?? position.outcome}`;
                        const pnl = position.cashPnl;
                        return (
                          <div
                            key={key}
                            className="grid grid-cols-[minmax(280px,1.8fr)_minmax(90px,0.8fr)_repeat(4,minmax(96px,0.7fr))] items-center gap-3 px-6 py-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{position.question || '--'}</p>
                              {(position.conditionId ?? position.marketId) && (
                                <p className="truncate font-mono text-[11px] text-muted-foreground">
                                  {position.conditionId ?? position.marketId}
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary" className="w-fit max-w-full truncate">
                              {position.outcome || '--'}
                            </Badge>
                            <span className="text-right font-mono tabular-nums">
                              {formatCurrency(position.value)}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {formatNumber(position.shares)}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {formatPricePair(position.avgPrice, position.currentPrice)}
                            </span>
                            <span
                              className={`text-right font-mono tabular-nums ${
                                pnl === undefined ? 'text-muted-foreground' : pnl >= 0 ? 'text-green' : 'text-red'
                              }`}
                            >
                              {pnl === undefined ? '--' : formatSignedCurrency(pnl)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {whale.winRateTimeline.length > 0 && (
              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <CardTitle>{t('whales.performanceTimeline')}</CardTitle>
                </CardHeader>
                <div className="p-4">
                  <PerformanceChart data={whale.winRateTimeline} />
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <CardTitle>{t('whales.marketBreakdown')}</CardTitle>
                </CardHeader>
                <div className="divide-y">
                  {whale.marketBreakdown.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">{t('whales.noMarketBreakdown')}</p>
                  ) : (
                    whale.marketBreakdown.map((row) => (
                      <div key={row.marketId} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{row.marketQuestion}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.settledBets} {t('whales.settledBets')} · ${row.totalWagered.toFixed(0)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Progress value={row.winRate * 100} className="w-16" />
                          <span className="tabular-nums">{(row.winRate * 100).toFixed(0)}%</span>
                          <span className={`tabular-nums ${row.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                            {row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader className="border-b px-6 py-3">
                  <CardTitle>{t('whales.recentTrades')}</CardTitle>
                </CardHeader>
                <div className="divide-y max-h-[360px] overflow-y-auto">
                  {whale.recentTrades.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">{t('whales.noRecentTrades')}</p>
                  ) : (
                    whale.recentTrades.map((trade, index) => (
                      <div
                        key={`${trade.txHash}-${trade.marketId}-${index}`}
                        className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {trade.marketQuestion || t('whales.unresolvedMarket')}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="uppercase">{trade.type}</span>
                            <span className="text-foreground">{trade.outcome}</span>
                            {!trade.marketQuestion && trade.marketId && (
                              <span className="font-mono">{shortId(trade.marketId)}</span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div>${trade.amount.toFixed(0)} @ {(trade.price * 100).toFixed(0)}¢</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(trade.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader className="border-b px-6 py-3">
                <CardTitle>{t('whales.suspicious')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-5">
                {[
                  { label: t('whales.suspiciousTotal'), value: whale.suspiciousScore.total },
                  { label: t('whales.suspiciousVolume'), value: whale.suspiciousScore.volumeAnomaly },
                  { label: t('whales.suspiciousTiming'), value: whale.suspiciousScore.timingAnomaly },
                  { label: t('whales.suspiciousPattern'), value: whale.suspiciousScore.patternAnomaly },
                  { label: t('whales.suspiciousCorrelation'), value: whale.suspiciousScore.correlationAnomaly },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </DataState>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : '-'}${formatCurrency(value)}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatPrice(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}¢`;
}

function formatPricePair(avgPrice: number | undefined, currentPrice: number | undefined): string {
  return `${formatPrice(avgPrice)} / ${formatPrice(currentPrice)}`;
}

function shortId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
