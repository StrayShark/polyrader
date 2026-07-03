import type {
  PolymarketAccountOverview,
  PolymarketAccountDiagnostic,
  PolymarketAccountStats,
  PolymarketBalance,
  PolymarketEquityPoint,
  PolymarketOpenOrder,
  PolymarketUserActivity,
  PolymarketUserPosition,
  PolymarketUserTrade,
} from '@polyrader/core';
import { PolymarketClobClient, PolymarketDataClient } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';

export class PolymarketAccountService {
  private dataClient = new PolymarketDataClient();
  private clobClient = new PolymarketClobClient();

  async getOverview(): Promise<PolymarketAccountOverview> {
    const status = { ...this.clobClient.getAccountStatus() };
    const address = status.address;
    const cacheKey = `polymarket:account:${address ?? 'missing'}`;
    const cached = await cacheGet<PolymarketAccountOverview>(cacheKey);
    if (cached) return cached;

    let totalPositionValue = 0;
    let positions: PolymarketUserPosition[] = [];
    let closedPositions: PolymarketUserPosition[] = [];
    let activity: PolymarketUserActivity[] = [];
    let trades: PolymarketUserTrade[] = [];
    let balances: PolymarketBalance[] = [];
    let openOrders: PolymarketOpenOrder[] = [];
    const diagnostics: PolymarketAccountDiagnostic[] = [];

    if (address) {
      const publicResults = await Promise.allSettled([
        this.dataClient.getTotalValue(address),
        this.dataClient.getCurrentPositions(address, 100),
        this.dataClient.getClosedPositions(address, 250),
        this.dataClient.getActivity(address, 100),
        this.dataClient.getTrades(address, 100),
      ]);
      const publicOperations = ['total-value', 'positions', 'closed-positions', 'activity', 'trades'];

      totalPositionValue = publicResults[0].status === 'fulfilled' ? publicResults[0].value : 0;
      positions = publicResults[1].status === 'fulfilled' ? publicResults[1].value : [];
      closedPositions = publicResults[2].status === 'fulfilled' ? publicResults[2].value : [];
      activity = publicResults[3].status === 'fulfilled' ? publicResults[3].value : [];
      trades = publicResults[4].status === 'fulfilled' ? publicResults[4].value : [];

      for (const [index, result] of publicResults.entries()) {
        diagnostics.push(toDiagnostic('data-api', publicOperations[index] ?? 'unknown', result));
        if (result.status === 'rejected') {
          logger.warn('Polymarket public account data fetch failed', { error: (result.reason as Error).message });
        }
      }
    }

    if (status.canReadPrivate) {
      const privateResults = await Promise.allSettled([
        this.clobClient.getBalanceAllowance(),
        this.clobClient.getOpenOrders(),
        this.clobClient.getAuthenticatedTrades(100),
      ]);
      const privateOperations = ['balance-allowance', 'open-orders', 'private-trades'];

      balances = privateResults[0].status === 'fulfilled' ? [privateResults[0].value] : [];
      openOrders = privateResults[1].status === 'fulfilled' ? privateResults[1].value : [];
      if (privateResults[2].status === 'fulfilled' && privateResults[2].value.length > 0) {
        trades = privateResults[2].value;
      }
      if (privateResults.every((result) => result.status === 'rejected')) {
        status.message = 'Polymarket private data unavailable; showing public account data';
      }

      for (const [index, result] of privateResults.entries()) {
        diagnostics.push(toDiagnostic('clob-api', privateOperations[index] ?? 'unknown', result));
        if (result.status === 'rejected') {
          logger.warn('Polymarket private account data fetch failed', { error: (result.reason as Error).message });
        }
      }
    }

    const overview: PolymarketAccountOverview = {
      status,
      totalPositionValue,
      balances,
      positions,
      closedPositions,
      activity,
      trades,
      openOrders,
      stats: buildStats({ balances, positions, closedPositions, trades }),
      equityCurve: buildEquityCurve({ balances, positions, closedPositions }),
      diagnostics,
      updatedAt: new Date().toISOString(),
    };

    await cacheSet(cacheKey, overview, 30);
    return overview;
  }
}

function toDiagnostic(
  source: PolymarketAccountDiagnostic['source'],
  operation: string,
  result: PromiseSettledResult<unknown>,
): PolymarketAccountDiagnostic {
  return {
    source,
    operation,
    ok: result.status === 'fulfilled',
    message: result.status === 'fulfilled' ? undefined : sanitizeError(result.reason),
    checkedAt: new Date().toISOString(),
  };
}

function sanitizeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.replace(/\s+/g, ' ').slice(0, 180);
}

function buildStats(input: {
  balances: PolymarketBalance[];
  positions: PolymarketUserPosition[];
  closedPositions: PolymarketUserPosition[];
  trades: PolymarketUserTrade[];
}): PolymarketAccountStats {
  const { positions, closedPositions, trades } = input;
  const tradeCount = trades.length;
  const buyCount = trades.filter((trade) => trade.side === 'buy').length;
  const sellCount = trades.filter((trade) => trade.side === 'sell').length;
  const tradedVolume = trades.reduce((sum, trade) => sum + finiteNumber(trade.value), 0);
  const closedWithPnl = closedPositions.filter((position) => Number.isFinite(position.cashPnl));
  const winningMarkets = closedWithPnl.filter((position) => finiteNumber(position.cashPnl) > 0).length;
  const losingMarkets = closedWithPnl.filter((position) => finiteNumber(position.cashPnl) < 0).length;
  const realizedPnl = closedWithPnl.reduce((sum, position) => sum + finiteNumber(position.cashPnl), 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + finiteNumber(position.cashPnl), 0);
  const totalPnl = realizedPnl + unrealizedPnl;
  const capitalAtRisk = [...closedPositions, ...positions].reduce((sum, position) => {
    if (Number.isFinite(position.initialValue)) return sum + finiteNumber(position.initialValue);
    if (Number.isFinite(position.cashPnl)) return sum + Math.max(0, finiteNumber(position.value) - finiteNumber(position.cashPnl));
    return sum + finiteNumber(position.value);
  }, 0);

  return {
    tradeCount,
    buyCount,
    sellCount,
    tradedVolume,
    settledMarkets: closedWithPnl.length,
    winningMarkets,
    losingMarkets,
    winRate: closedWithPnl.length > 0 ? winningMarkets / closedWithPnl.length : 0,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    roi: capitalAtRisk > 0 ? totalPnl / capitalAtRisk : 0,
    averageTradeSize: tradeCount > 0 ? tradedVolume / tradeCount : 0,
  };
}

function buildEquityCurve(input: {
  balances: PolymarketBalance[];
  positions: PolymarketUserPosition[];
  closedPositions: PolymarketUserPosition[];
}): PolymarketEquityPoint[] {
  const cashBalance = input.balances.reduce((sum, balance) => sum + finiteNumber(balance.balance), 0);
  const positionValue = input.positions.reduce((sum, position) => sum + finiteNumber(position.value), 0);
  const unrealizedPnl = input.positions.reduce((sum, position) => sum + finiteNumber(position.cashPnl), 0);
  const finalEquity = cashBalance + positionValue;
  const closedEvents = input.closedPositions
    .filter((position) => Number.isFinite(position.cashPnl))
    .map((position) => ({
      date: normalizeDate(position.endDate),
      pnl: finiteNumber(position.cashPnl),
    }))
    .filter((point): point is { date: string; pnl: number } => Boolean(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const realizedPnl = closedEvents.reduce((sum, event) => sum + event.pnl, 0);
  const startingEquity = finalEquity - realizedPnl - unrealizedPnl;
  const byDate = new Map<string, number>();
  for (const event of closedEvents) {
    byDate.set(event.date, (byDate.get(event.date) ?? 0) + event.pnl);
  }

  const points: PolymarketEquityPoint[] = [];
  let cumulativeRealized = 0;
  for (const [date, dailyPnl] of byDate.entries()) {
    cumulativeRealized += dailyPnl;
    points.push({
      date,
      realizedPnl: cumulativeRealized,
      positionValue: 0,
      balance: Math.max(0, startingEquity + cumulativeRealized),
      equity: startingEquity + cumulativeRealized,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const last = points[points.length - 1];
  const finalPoint: PolymarketEquityPoint = {
    date: today,
    realizedPnl,
    positionValue,
    balance: cashBalance,
    equity: finalEquity,
  };
  if (!last || last.date !== today) {
    points.push(finalPoint);
  } else {
    points[points.length - 1] = finalPoint;
  }

  return points;
}

function finiteNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(Number(value) > 10_000_000_000 ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
