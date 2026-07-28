import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SimBetRecord } from '@polyrader/core/browser';
import { LoadingSpinner } from '../components/LoadingState';
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
import { SimBetMarketContext, SimBetMarketSummary } from '../components/SimBetMarketSummary';

type StatusFilter = 'all' | 'open' | 'settled' | 'voided';

export function PaperOrdersPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedBetId = searchParams.get('betId');
  const [bets, setBets] = useState<SimBetRecord[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`;
      const response = await api.get<{ data: SimBetRecord[] }>(`/sim/bets${query}`);
      setBets(response.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const visibleBets = focusedBetId ? bets.filter((bet) => bet.id === focusedBetId) : bets;

  const clearFocusedBet = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('betId');
    setSearchParams(next, { replace: true });
  };

  return (
    <Card data-testid="paper-orders-page">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        {!embedded && (
          <div>
            <CardTitle className="text-base">{t('paperOrders.title')}</CardTitle>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <LoadingSpinner className="h-3.5 w-3.5" size={14} /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('common.refresh')}
        </Button>
      </CardHeader>
      <div className="px-4 pb-4">
        <div className="mb-3 flex flex-wrap gap-1" role="tablist">
          {(['all', 'open', 'settled', 'voided'] as StatusFilter[]).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={filter === status ? 'default' : 'ghost'}
              onClick={() => setFilter(status)}
            >
              {t(`paperOrders.${status}`)}
            </Button>
          ))}
        </div>
        {focusedBetId && (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
            data-testid="focused-paper-order"
          >
            <span>
              {t('paperOrders.focusedOrder')} · <span className="font-mono">{focusedBetId}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={clearFocusedBet}>
              {t('paperOrders.showAll')}
            </Button>
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('paperOrders.match')}</TableHead>
                <TableHead>{t('paperOrders.gameMarket')}</TableHead>
                <TableHead>{t('paperOrders.status')}</TableHead>
                <TableHead className="text-right">{t('paperOrders.stake')}</TableHead>
                <TableHead className="text-right">{t('paperOrders.edge')}</TableHead>
                <TableHead className="text-right">{t('paperOrders.pnl')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleBets.map((bet) => (
                <TableRow
                  key={bet.id}
                  data-testid={`paper-order-${bet.id}`}
                  className={focusedBetId === bet.id ? 'bg-accent/40' : undefined}
                >
                  <TableCell>
                    <SimBetMarketSummary bet={bet} showContext={false} />
                    <div className="font-mono text-xs text-muted-foreground">
                      {bet.id.slice(0, 18)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <SimBetMarketContext bet={bet} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        bet.status === 'open'
                          ? 'yellow'
                          : bet.status === 'settled'
                            ? 'green'
                            : 'secondary'
                      }
                    >
                      {bet.status}
                      {bet.result ? ` · ${bet.result}` : ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">${bet.stake.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {bet.edgeAtEntry == null ? '—' : `${(bet.edgeAtEntry * 100).toFixed(1)}pp`}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${bet.pnl > 0 ? 'text-emerald-600' : bet.pnl < 0 ? 'text-rose-600' : ''}`}
                  >
                    {bet.status === 'open' ? '—' : `$${bet.pnl.toFixed(2)}`}
                  </TableCell>
                  <TableCell>
                    {bet.runId && (
                      <Link
                        to={`/analysis/report/${encodeURIComponent(bet.runId)}`}
                        aria-label={t('paperOrders.openReport')}
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && visibleBets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                    {t('paperOrders.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
