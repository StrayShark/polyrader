import { Fragment, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PerformanceAttributionRow,
  PerformanceFilters,
  PerformanceSummary,
} from '@polyrader/core/browser';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const EMPTY_FILTERS: PerformanceFilters = {};

function seconds(value?: number): string {
  if (value == null) return '—';
  if (value < 60) return `${value.toFixed(0)}s`;
  return `${(value / 60).toFixed(1)}m`;
}

export function PerformancePage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PerformanceFilters>(EMPTY_FILTERS);

  const load = async (nextFilters: PerformanceFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(nextFilters)) {
        if (value) query.set(key, value);
      }
      const response = await api.get<{ data: PerformanceSummary }>(
        `/performance/summary${query.size > 0 ? `?${query.toString()}` : ''}`,
      );
      setSummary(response.data);
      setFilters(response.data.filters);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(EMPTY_FILTERS);
  }, []);

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    void load(EMPTY_FILTERS);
  };
  const hasActiveFilters = summary ? Object.values(summary.filters).some(Boolean) : false;

  return (
    <div className="space-y-4" data-testid="performance-page">
      <div className="flex items-start justify-between gap-3">
        {!embedded && (
          <div>
            <h2 className="text-base font-semibold">{t('performance.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('performance.subtitle')}</p>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {t('common.refresh')}
        </Button>
      </div>

      <Card data-testid="performance-filters">
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <FilterSelect
            label={t('performance.filterGame')}
            value={filters.game}
            options={summary?.filterOptions.games ?? []}
            onChange={(game) => setFilters((current) => ({ ...current, game }))}
          />
          <FilterSelect
            label={t('performance.filterProvider')}
            value={filters.provider}
            options={summary?.filterOptions.providers ?? []}
            onChange={(provider) => setFilters((current) => ({ ...current, provider }))}
          />
          <FilterSelect
            label={t('performance.filterMarket')}
            value={filters.marketKind}
            options={summary?.filterOptions.marketKinds ?? []}
            onChange={(marketKind) => setFilters((current) => ({ ...current, marketKind }))}
          />
          <FilterSelect
            label={t('performance.filterPolicy')}
            value={filters.policyVersion}
            options={summary?.filterOptions.policyVersions ?? []}
            onChange={(policyVersion) => setFilters((current) => ({ ...current, policyVersion }))}
          />
          <FilterSelect
            label={t('performance.filterPrompt')}
            value={filters.promptVersion}
            options={summary?.filterOptions.promptVersions ?? []}
            onChange={(promptVersion) => setFilters((current) => ({ ...current, promptVersion }))}
          />
          <DateFilter
            label={t('performance.filterFrom')}
            value={filters.from}
            onChange={(from) => setFilters((current) => ({ ...current, from }))}
          />
          <DateFilter
            label={t('performance.filterTo')}
            value={filters.to}
            onChange={(to) => setFilters((current) => ({ ...current, to }))}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={loading}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t('performance.resetFilters')}
          </Button>
          <Button size="sm" onClick={() => void load(filters)} disabled={loading}>
            <Filter className="h-3.5 w-3.5" />
            {t('performance.applyFilters')}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {summary && (
        <>
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            data-testid="performance-ranking-status"
          >
            <Badge
              variant={
                summary.rankingStatus === 'eligible'
                  ? 'green'
                  : summary.rankingStatus === 'provisional'
                    ? 'yellow'
                    : 'secondary'
              }
            >
              {t(`performance.ranking.${summary.rankingStatus}`)}
            </Badge>
            <span className="text-muted-foreground">
              {summary.tuningEligible
                ? t('performance.tuningEligible')
                : t('performance.tuningLocked')}
            </span>
          </div>
          {summary.sampleStatus !== 'reliable' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {summary.sampleStatus === 'insufficient'
                ? t('performance.insufficient')
                : t('performance.caution')}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Metric
              label={t(hasActiveFilters ? 'performance.filteredEquity' : 'performance.equity')}
              value={`$${summary.equity.toFixed(2)}`}
              meta={`${t('performance.pnl')} $${summary.totalPnl.toFixed(2)}`}
            />
            <Metric
              label={t('performance.roi')}
              value={pct(summary.roi)}
              meta={`$${summary.totalStake.toFixed(2)} ${t('performance.staked')}`}
            />
            <Metric
              label={t('performance.winRate')}
              value={pct(summary.winRate)}
              meta={`${pct(summary.winRateInterval.low)}–${pct(summary.winRateInterval.high)} · 95%`}
            />
            <Metric
              label={t('performance.calibration')}
              value={summary.avgBrier == null ? '—' : summary.avgBrier.toFixed(3)}
              meta={`ECE ${summary.calibrationError == null ? '—' : summary.calibrationError.toFixed(3)}`}
            />
            <Metric
              label={t('performance.logLoss')}
              value={summary.avgLogLoss == null ? '—' : summary.avgLogLoss.toFixed(3)}
              meta={t('performance.lowerIsBetter')}
            />
            <Metric
              label={t('performance.sharpe')}
              value={summary.sharpeRatio == null ? '—' : summary.sharpeRatio.toFixed(2)}
              meta={`${t('performance.volatility')} ${summary.returnVolatility == null ? '—' : summary.returnVolatility.toFixed(2)}`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t(
                    hasActiveFilters
                      ? 'performance.filteredEquityCurve'
                      : 'performance.equityCurve',
                  )}
                </CardTitle>
              </CardHeader>
              <div className="h-64 px-2 pb-4">
                {summary.equityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={summary.equityCurve}
                      margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} width={58} />
                      <Tooltip
                        labelFormatter={(value) => new Date(String(value)).toLocaleString()}
                        formatter={(value) => [
                          `$${Number(value).toFixed(2)}`,
                          t(hasActiveFilters ? 'performance.filteredEquity' : 'performance.equity'),
                        ]}
                      />
                      <Line
                        dataKey="equity"
                        type="monotone"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t('performance.noSettled')}
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('performance.risk')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                <Metric
                  label={t('performance.settled')}
                  value={String(summary.settledCount)}
                  meta={`${summary.wins}W · ${summary.losses}L`}
                  compact
                />
                <Metric
                  label={t('performance.open')}
                  value={String(summary.openCount)}
                  meta={t('performance.paperOnly')}
                  compact
                />
                <Metric
                  label={t('performance.maxDrawdown')}
                  value={`$${summary.maxDrawdown.toFixed(2)}`}
                  meta={t('performance.realized')}
                  compact
                />
                <Metric
                  label="CLV"
                  value={summary.avgClv == null ? '—' : pct(summary.avgClv)}
                  meta={
                    summary.clvSampleCount > 0
                      ? t('performance.clvCoverage')
                          .replace('{captured}', String(summary.clvSampleCount))
                          .replace('{missing}', String(summary.clvMissingCount))
                      : t('performance.clvUnavailable')
                  }
                  compact
                />
                <Metric
                  label={t('performance.closingCoverage')}
                  value={pct(summary.closingCoverage.coverageRate)}
                  meta={`${summary.closingCoverage.capturedCount}/${summary.closingCoverage.eligibleCount} · ${t('performance.latency')} ${seconds(summary.closingCoverage.averageCaptureLatencySeconds)}`}
                  compact
                />
                <Metric
                  label={t('performance.closingAttempts')}
                  value={summary.closingCoverage.averageAttempts.toFixed(1)}
                  meta={`${summary.closingCoverage.unavailableCount} ${t('performance.unavailable')}`}
                  compact
                />
              </div>
            </Card>
          </div>

          {summary.closingCoverage.sources.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
              data-testid="closing-source-coverage"
            >
              <span className="text-muted-foreground">{t('performance.closingSources')}</span>
              {summary.closingCoverage.sources.map((item) => (
                <Badge key={item.source} variant="outline">
                  {item.source} · {item.count} · {pct(item.coverageRate)}
                </Badge>
              ))}
            </div>
          )}

          {summary.closingCoverage.unavailableReasons.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
              data-testid="closing-unavailable-reasons"
            >
              <span className="text-muted-foreground">{t('performance.unavailableReasons')}</span>
              {summary.closingCoverage.unavailableReasons.map((item) => (
                <Badge key={item.reason} variant="outline">
                  {item.reason} · {item.count}
                </Badge>
              ))}
            </div>
          )}

          <AttributionTable title={t('performance.byGame')} rows={summary.byGame} />
          <AttributionTable title={t('performance.byProvider')} rows={summary.byProvider} />
          <AttributionTable title={t('performance.byMarket')} rows={summary.byMarketKind} />
          <AttributionTable title={t('performance.byPolicy')} rows={summary.byPolicy} />
          <AttributionTable title={t('performance.byPrompt')} rows={summary.byPromptVersion} />
          <AttributionTable title={t('performance.byEventTier')} rows={summary.byEventTier} />
          <AttributionTable title={t('performance.byDataQuality')} rows={summary.byDataQuality} />
          <AttributionTable title={t('performance.byConfidence')} rows={summary.byConfidenceBand} />
          <AttributionTable title={t('performance.byEdge')} rows={summary.byEdgeBand} />
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value?: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t('performance.filterAll')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value?: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function Metric({
  label,
  value,
  meta,
  compact = false,
}: {
  label: string;
  value: string;
  meta: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? 'rounded-md border border-border p-3'
          : 'rounded-md border border-border bg-card p-4'
      }
    >
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={compact ? 'mt-1 text-lg font-semibold' : 'mt-1 text-2xl font-semibold'}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

function AttributionTable({ title, rows }: { title: string; rows: PerformanceAttributionRow[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <div className="overflow-x-auto px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('performance.segment')}</TableHead>
              <TableHead className="text-right">N</TableHead>
              <TableHead className="text-right">{t('performance.winRate')}</TableHead>
              <TableHead className="text-right">Brier</TableHead>
              <TableHead className="text-right">Log Loss</TableHead>
              <TableHead className="text-right">Sharpe</TableHead>
              <TableHead className="text-right">CLV</TableHead>
              <TableHead className="text-right">Close</TableHead>
              <TableHead className="text-right">ROI</TableHead>
              <TableHead className="text-right">PnL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const rowId = `${row.dimension}-${row.key}`;
              const isExpanded = expanded === rowId;
              return (
                <Fragment key={rowId}>
                  <TableRow data-testid={`performance-segment-${rowId}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
                          onClick={() => setExpanded(isExpanded ? null : rowId)}
                          aria-label={t('performance.toggleDrilldown')}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <span>{row.key}</span>
                        <Badge
                          variant={row.rankingStatus === 'eligible' ? 'green' : 'outline'}
                          className="text-[10px]"
                        >
                          {row.rank ? `#${row.rank} · ` : ''}
                          {t(`performance.ranking.${row.rankingStatus}`)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.settledCount}</TableCell>
                    <TableCell className="text-right font-mono">{pct(row.winRate)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.avgBrier == null ? '—' : row.avgBrier.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.avgLogLoss == null ? '—' : row.avgLogLoss.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.sharpeRatio == null ? '—' : row.sharpeRatio.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.avgClv == null ? '—' : pct(row.avgClv)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.clvCapturedCount}/{row.settledCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">{pct(row.roi)}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${row.totalPnl > 0 ? 'text-emerald-600' : row.totalPnl < 0 ? 'text-rose-600' : ''}`}
                    >
                      ${row.totalPnl.toFixed(2)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow data-testid={`performance-drilldown-${rowId}`}>
                      <TableCell colSpan={10} className="bg-muted/30 p-0">
                        <div className="divide-y divide-border">
                          {row.items.map((item) => (
                            <div
                              key={item.betId}
                              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-xs"
                            >
                              <span className="font-mono">{item.betId.slice(0, 18)}</span>
                              <span className="text-muted-foreground">
                                {item.game ?? 'unknown'} · {item.marketKind ?? 'unknown'} ·{' '}
                                {item.result}
                              </span>
                              <span className="font-mono">${item.stake.toFixed(2)}</span>
                              <span
                                className={item.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                              >
                                ${item.pnl.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">
                                {new Date(item.placedAt).toLocaleString()}
                              </span>
                              <span className="ml-auto flex items-center gap-3">
                                <Link
                                  to={`/bankroll?section=orders&betId=${encodeURIComponent(item.betId)}`}
                                  className="inline-flex items-center gap-1 hover:underline"
                                >
                                  {t('performance.openOrder')}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                                {item.runId && (
                                  <Link
                                    to={`/analysis/report/${encodeURIComponent(item.runId)}`}
                                    className="inline-flex items-center gap-1 hover:underline"
                                  >
                                    {t('performance.openReport')}
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                  {t('performance.noSettled')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
