import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PerformanceAttributionRow, PerformanceSummary } from '@polyrader/core/browser';
import { Badge, Button, Card, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function PerformancePage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data: PerformanceSummary }>('/performance/summary');
      setSummary(response.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4" data-testid="performance-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('performance.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('performance.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {t('common.refresh')}
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {summary && (
        <>
          {summary.sampleStatus !== 'reliable' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {summary.sampleStatus === 'insufficient' ? t('performance.insufficient') : t('performance.caution')}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={t('performance.equity')} value={`$${summary.equity.toFixed(2)}`} meta={`${t('performance.pnl')} $${summary.totalPnl.toFixed(2)}`} />
            <Metric label={t('performance.roi')} value={pct(summary.roi)} meta={`$${summary.totalStake.toFixed(2)} ${t('performance.staked')}`} />
            <Metric label={t('performance.winRate')} value={pct(summary.winRate)} meta={`${pct(summary.winRateInterval.low)}–${pct(summary.winRateInterval.high)} · 95%`} />
            <Metric label={t('performance.calibration')} value={summary.avgBrier == null ? '—' : summary.avgBrier.toFixed(3)} meta={`ECE ${summary.calibrationError == null ? '—' : summary.calibrationError.toFixed(3)}`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('performance.equityCurve')}</CardTitle>
              </CardHeader>
              <div className="h-64 px-2 pb-4">
                {summary.equityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.equityCurve} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleDateString()} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={58} />
                      <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} formatter={(value) => [`$${Number(value).toFixed(2)}`, t('performance.equity')]} />
                      <Line dataKey="equity" type="monotone" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('performance.noSettled')}</div>}
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('performance.risk')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                <Metric label={t('performance.settled')} value={String(summary.settledCount)} meta={`${summary.wins}W · ${summary.losses}L`} compact />
                <Metric label={t('performance.open')} value={String(summary.openCount)} meta={t('performance.paperOnly')} compact />
                <Metric label={t('performance.maxDrawdown')} value={`$${summary.maxDrawdown.toFixed(2)}`} meta={t('performance.realized')} compact />
                <Metric label="CLV" value={summary.avgClv == null ? '—' : pct(summary.avgClv)} meta={t('performance.clvUnavailable')} compact />
              </div>
            </Card>
          </div>

          <AttributionTable title={t('performance.byGame')} rows={summary.byGame} />
          <AttributionTable title={t('performance.byProvider')} rows={summary.byProvider} />
          <AttributionTable title={t('performance.byMarket')} rows={summary.byMarketKind} />
        </>
      )}
    </div>
  );
}

function Metric({ label, value, meta, compact = false }: { label: string; value: string; meta: string; compact?: boolean }) {
  return (
    <div className={compact ? 'rounded-md border border-border p-3' : 'rounded-md border border-border bg-card p-4'}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={compact ? 'mt-1 text-lg font-semibold' : 'mt-1 text-2xl font-semibold'}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}

function AttributionTable({ title, rows }: { title: string; rows: PerformanceAttributionRow[] }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline">{rows.length}</Badge>
      </CardHeader>
      <div className="overflow-x-auto px-4 pb-4">
        <Table>
          <TableHeader><TableRow><TableHead>{t('performance.segment')}</TableHead><TableHead className="text-right">N</TableHead><TableHead className="text-right">{t('performance.winRate')}</TableHead><TableHead className="text-right">Brier</TableHead><TableHead className="text-right">ROI</TableHead><TableHead className="text-right">PnL</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.dimension}-${row.key}`}>
                <TableCell className="font-medium">{row.key}</TableCell>
                <TableCell className="text-right font-mono">{row.settledCount}</TableCell>
                <TableCell className="text-right font-mono">{pct(row.winRate)}</TableCell>
                <TableCell className="text-right font-mono">{row.avgBrier == null ? '—' : row.avgBrier.toFixed(3)}</TableCell>
                <TableCell className="text-right font-mono">{pct(row.roi)}</TableCell>
                <TableCell className={`text-right font-mono ${row.totalPnl > 0 ? 'text-emerald-600' : row.totalPnl < 0 ? 'text-rose-600' : ''}`}>${row.totalPnl.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t('performance.noSettled')}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
