import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SimBet } from '@polyrader/core/browser';
import { Badge, Button, Card, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';

type StatusFilter = 'all' | 'open' | 'settled' | 'voided';

export function PaperOrdersPage() {
  const { t } = useI18n();
  const [bets, setBets] = useState<SimBet[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`;
      const response = await api.get<{ data: SimBet[] }>(`/sim/bets${query}`);
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

  return (
    <Card data-testid="paper-orders-page">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t('paperOrders.title')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('paperOrders.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
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
        {error && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
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
              {bets.map((bet) => (
                <TableRow key={bet.id}>
                  <TableCell>
                    <div className="font-medium">{bet.matchId ?? '—'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{bet.id.slice(0, 18)}</div>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {bet.game ?? 'unknown'} · {(bet.marketKind ?? 'unknown').replaceAll('_', ' ')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={bet.status === 'open' ? 'yellow' : bet.status === 'settled' ? 'green' : 'secondary'}>
                      {bet.status}{bet.result ? ` · ${bet.result}` : ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">${bet.stake.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {bet.edgeAtEntry == null ? '—' : `${(bet.edgeAtEntry * 100).toFixed(1)}pp`}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${bet.pnl > 0 ? 'text-emerald-600' : bet.pnl < 0 ? 'text-rose-600' : ''}`}>
                    {bet.status === 'open' ? '—' : `$${bet.pnl.toFixed(2)}`}
                  </TableCell>
                  <TableCell>
                    {bet.runId && (
                      <Link to={`/analysis/report/${encodeURIComponent(bet.runId)}`} aria-label={t('paperOrders.openReport')}>
                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && bets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{t('paperOrders.empty')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
