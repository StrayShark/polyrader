import type { SimBet } from '../types/index';
import { calculateBrierScore } from './bet-math';

export interface PerformanceAttributionRow {
  key: string;
  dimension: 'game' | 'provider' | 'market_kind' | 'policy';
  settledCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalStake: number;
  roi: number;
  avgBrier?: number;
  avgEdge?: number;
}

export interface PerformanceSummary {
  settledCount: number;
  openCount: number;
  wins: number;
  losses: number;
  winRate: number;
  winRateInterval: { low: number; high: number };
  totalPnl: number;
  totalStake: number;
  roi: number;
  avgBrier?: number;
  calibrationError?: number;
  avgClv?: number;
  equity: number;
  maxDrawdown: number;
  sampleStatus: 'insufficient' | 'caution' | 'reliable';
  equityCurve: Array<{ timestamp: string; equity: number; cumulativePnl: number }>;
  byGame: PerformanceAttributionRow[];
  byProvider: PerformanceAttributionRow[];
  byMarketKind: PerformanceAttributionRow[];
}

export function outcomeToBinary(result: SimBet['result']): 0 | 1 | null {
  if (result === 'won') return 1;
  if (result === 'lost') return 0;
  return null;
}

export function brierForBet(bet: SimBet): number | undefined {
  const binary = outcomeToBinary(bet.result);
  const probability = bet.modelProbability ?? bet.userProbability;
  if (binary == null || probability == null || !Number.isFinite(probability)) return undefined;
  return calculateBrierScore(probability, binary);
}

export function buildPerformanceSummary(input: {
  bets: SimBet[];
  initialBankroll: number;
  providerByRunId?: Record<string, string>;
}): PerformanceSummary {
  const openCount = input.bets.filter((bet) => bet.status === 'open').length;
  const settled = input.bets.filter((bet) => bet.status === 'settled' && (bet.result === 'won' || bet.result === 'lost'));
  const wins = settled.filter((bet) => bet.result === 'won').length;
  const losses = settled.filter((bet) => bet.result === 'lost').length;
  const totalPnl = settled.reduce((sum, bet) => sum + bet.pnl, 0);
  const totalStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
  const briers = settled.map(brierForBet).filter((value): value is number => value != null);
  const avgBrier = briers.length > 0 ? briers.reduce((a, b) => a + b, 0) / briers.length : undefined;
  const winRate = settled.length > 0 ? wins / settled.length : 0;
  const winRateInterval = wilsonInterval(wins, settled.length);
  const equityCurve = buildEquityCurve(settled, input.initialBankroll);

  return {
    settledCount: settled.length,
    openCount,
    wins,
    losses,
    winRate,
    winRateInterval,
    totalPnl,
    totalStake,
    roi: totalStake > 0 ? totalPnl / totalStake : 0,
    avgBrier,
    calibrationError: expectedCalibrationError(settled),
    equity: input.initialBankroll + totalPnl,
    maxDrawdown: maxDrawdown(equityCurve),
    sampleStatus: settled.length < 10 ? 'insufficient' : settled.length < 30 ? 'caution' : 'reliable',
    equityCurve,
    byGame: attribute(settled, (bet) => bet.game ?? 'unknown', 'game', input.providerByRunId),
    byProvider: attribute(
      settled,
      (bet) => (bet.runId ? input.providerByRunId?.[bet.runId] : undefined) ?? 'user',
      'provider',
      input.providerByRunId,
    ),
    byMarketKind: attribute(settled, (bet) => bet.marketKind ?? 'unknown', 'market_kind', input.providerByRunId),
  };
}

function attribute(
  bets: SimBet[],
  keyFn: (bet: SimBet) => string,
  dimension: PerformanceAttributionRow['dimension'],
  _providerByRunId?: Record<string, string>,
): PerformanceAttributionRow[] {
  const map = new Map<string, SimBet[]>();
  for (const bet of bets) {
    const key = keyFn(bet);
    const list = map.get(key) ?? [];
    list.push(bet);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, rows]) => {
    const wins = rows.filter((bet) => bet.result === 'won').length;
    const losses = rows.filter((bet) => bet.result === 'lost').length;
    const briers = rows.map(brierForBet).filter((value): value is number => value != null);
    const edges = rows
      .map((bet) => bet.edgeAtEntry ?? bet.edge)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const totalStake = rows.reduce((sum, bet) => sum + bet.stake, 0);
    const totalPnl = rows.reduce((sum, bet) => sum + bet.pnl, 0);
    return {
      key,
      dimension,
      settledCount: rows.length,
      wins,
      losses,
      winRate: rows.length > 0 ? wins / rows.length : 0,
      totalPnl,
      totalStake,
      roi: totalStake > 0 ? totalPnl / totalStake : 0,
      avgBrier: briers.length > 0 ? briers.reduce((a, b) => a + b, 0) / briers.length : undefined,
      avgEdge: edges.length > 0 ? edges.reduce((a, b) => a + b, 0) / edges.length : undefined,
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl);
}

function wilsonInterval(wins: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function expectedCalibrationError(bets: SimBet[]): number | undefined {
  const usable = bets.map((bet) => ({
    probability: bet.modelProbability ?? bet.userProbability,
    outcome: outcomeToBinary(bet.result),
  })).filter((item): item is { probability: number; outcome: 0 | 1 } => (
    item.probability != null && Number.isFinite(item.probability) && item.outcome != null
  ));
  if (usable.length === 0) return undefined;
  let weightedError = 0;
  for (let index = 0; index < 10; index++) {
    const low = index / 10;
    const high = (index + 1) / 10;
    const bucket = usable.filter((item) => item.probability >= low && (index === 9 ? item.probability <= high : item.probability < high));
    if (bucket.length === 0) continue;
    const confidence = bucket.reduce((sum, item) => sum + item.probability, 0) / bucket.length;
    const accuracy = bucket.reduce((sum, item) => sum + item.outcome, 0) / bucket.length;
    weightedError += (bucket.length / usable.length) * Math.abs(confidence - accuracy);
  }
  return weightedError;
}

function buildEquityCurve(
  bets: SimBet[],
  initialBankroll: number,
): Array<{ timestamp: string; equity: number; cumulativePnl: number }> {
  let cumulativePnl = 0;
  return [...bets]
    .sort((a, b) => Date.parse(a.settledAt ?? a.placedAt) - Date.parse(b.settledAt ?? b.placedAt))
    .map((bet) => {
      cumulativePnl += bet.pnl;
      return {
        timestamp: bet.settledAt ?? bet.placedAt,
        equity: initialBankroll + cumulativePnl,
        cumulativePnl,
      };
    });
}

function maxDrawdown(curve: Array<{ equity: number }>): number {
  let peak = curve[0]?.equity ?? 0;
  let largest = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    largest = Math.max(largest, peak - point.equity);
  }
  return largest;
}
