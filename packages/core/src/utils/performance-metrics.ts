import type { SimBet } from '../types/index';
import { calculateBrierScore } from './bet-math';

export interface PerformanceAttributionRow {
  key: string;
  dimension:
    | 'game'
    | 'provider'
    | 'market_kind'
    | 'policy'
    | 'prompt_version'
    | 'event_tier'
    | 'data_quality'
    | 'confidence_band'
    | 'edge_band';
  settledCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalStake: number;
  roi: number;
  avgBrier?: number;
  avgLogLoss?: number;
  avgEdge?: number;
  avgClv?: number;
  returnVolatility?: number;
  sharpeRatio?: number;
  clvCapturedCount: number;
  clvUnavailableCount: number;
  clvCoverageRate: number;
  avgClosingAttempts: number;
  avgClosingLatencySeconds?: number;
  sampleStatus: 'insufficient' | 'caution' | 'reliable';
  rankingStatus: 'hidden' | 'provisional' | 'eligible';
  rank?: number;
  tuningEligible: boolean;
  items: PerformanceDrilldownItem[];
}

export interface PerformanceRunMetadata {
  dataQuality?: number;
  confidence?: number;
}

export interface PerformanceDrilldownItem {
  betId: string;
  runId?: string;
  reportId?: string;
  matchId?: string;
  game?: string;
  marketKind?: string;
  placedAt: string;
  result: SimBet['result'];
  stake: number;
  pnl: number;
}

export interface PerformanceFilters {
  game?: string;
  provider?: string;
  marketKind?: string;
  policyVersion?: string;
  promptVersion?: string;
  from?: string;
  to?: string;
}

export interface PerformanceFilterOptions {
  games: string[];
  providers: string[];
  marketKinds: string[];
  policyVersions: string[];
  promptVersions: string[];
}

export interface ClosingCoverageSummary {
  eligibleCount: number;
  capturedCount: number;
  unavailableCount: number;
  pendingCount: number;
  coverageRate: number;
  averageAttempts: number;
  averageCaptureLatencySeconds?: number;
  sources: Array<{ source: string; count: number; coverageRate: number }>;
  unavailableReasons: Array<{ reason: string; count: number }>;
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
  avgLogLoss?: number;
  calibrationError?: number;
  avgClv?: number;
  clvSampleCount: number;
  clvMissingCount: number;
  equity: number;
  maxDrawdown: number;
  returnVolatility?: number;
  sharpeRatio?: number;
  closingCoverage: ClosingCoverageSummary;
  sampleStatus: 'insufficient' | 'caution' | 'reliable';
  rankingStatus: 'hidden' | 'provisional' | 'eligible';
  tuningEligible: boolean;
  filters: PerformanceFilters;
  filterOptions: PerformanceFilterOptions;
  equityCurve: Array<{ timestamp: string; equity: number; cumulativePnl: number }>;
  byGame: PerformanceAttributionRow[];
  byProvider: PerformanceAttributionRow[];
  byMarketKind: PerformanceAttributionRow[];
  byPolicy: PerformanceAttributionRow[];
  byPromptVersion: PerformanceAttributionRow[];
  byEventTier: PerformanceAttributionRow[];
  byDataQuality: PerformanceAttributionRow[];
  byConfidenceBand: PerformanceAttributionRow[];
  byEdgeBand: PerformanceAttributionRow[];
}

export function outcomeToBinary(result: SimBet['result']): 0 | 1 | null {
  if (result === 'won') return 1;
  if (result === 'lost') return 0;
  return null;
}

export const RANKING_MIN_AUTHORITATIVE_SETTLEMENTS = 10;
export const TUNING_MIN_AUTHORITATIVE_SETTLEMENTS = 30;

/** Count only reconciliation-backed settlements toward ranking/tuning gates. */
export function isAuthoritativeSettlement(bet: SimBet): boolean {
  const source = bet.settlementSource;
  if (!source) return false;
  if (source === 'manual' || source === 'fixture') return false;
  return true;
}

export function brierForBet(bet: SimBet): number | undefined {
  const binary = outcomeToBinary(bet.result);
  const probability = bet.modelProbability ?? bet.userProbability;
  if (binary == null || probability == null || !Number.isFinite(probability)) return undefined;
  return calculateBrierScore(probability, binary);
}

export function logLossForBet(bet: SimBet): number | undefined {
  const binary = outcomeToBinary(bet.result);
  const probability = bet.modelProbability ?? bet.userProbability;
  if (binary == null || probability == null || !Number.isFinite(probability)) return undefined;
  const clamped = Math.min(1 - 1e-15, Math.max(1e-15, probability));
  return -(binary * Math.log(clamped) + (1 - binary) * Math.log(1 - clamped));
}

export function buildPerformanceSummary(input: {
  bets: SimBet[];
  initialBankroll: number;
  providerByRunId?: Record<string, string>;
  promptVersionByRunId?: Record<string, string>;
  runMetadataByRunId?: Record<string, PerformanceRunMetadata>;
  filters?: PerformanceFilters;
  filterOptions?: PerformanceFilterOptions;
}): PerformanceSummary {
  const openCount = input.bets.filter((bet) => bet.status === 'open').length;
  const settled = input.bets.filter(
    (bet) => bet.status === 'settled' && (bet.result === 'won' || bet.result === 'lost'),
  );
  const authoritativeSettled = settled.filter(isAuthoritativeSettlement);
  const wins = authoritativeSettled.filter((bet) => bet.result === 'won').length;
  const losses = authoritativeSettled.filter((bet) => bet.result === 'lost').length;
  const totalPnl = authoritativeSettled.reduce((sum, bet) => sum + bet.pnl, 0);
  const totalStake = authoritativeSettled.reduce((sum, bet) => sum + bet.stake, 0);
  const briers = authoritativeSettled
    .map(brierForBet)
    .filter((value): value is number => value != null);
  const logLosses = authoritativeSettled
    .map(logLossForBet)
    .filter((value): value is number => value != null);
  const returns = returnsForBets(authoritativeSettled);
  const clvs = authoritativeSettled
    .map((bet) => bet.clv)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const avgBrier =
    briers.length > 0 ? briers.reduce((a, b) => a + b, 0) / briers.length : undefined;
  const winRate = authoritativeSettled.length > 0 ? wins / authoritativeSettled.length : 0;
  const winRateInterval = wilsonInterval(wins, authoritativeSettled.length);
  const equityCurve = buildEquityCurve(authoritativeSettled, input.initialBankroll);

  return {
    settledCount: authoritativeSettled.length,
    openCount,
    wins,
    losses,
    winRate,
    winRateInterval,
    totalPnl,
    totalStake,
    roi: totalStake > 0 ? totalPnl / totalStake : 0,
    avgBrier,
    avgLogLoss: average(logLosses),
    calibrationError: expectedCalibrationError(authoritativeSettled),
    avgClv: clvs.length > 0 ? clvs.reduce((a, b) => a + b, 0) / clvs.length : undefined,
    clvSampleCount: clvs.length,
    clvMissingCount: authoritativeSettled.length - clvs.length,
    equity: input.initialBankroll + totalPnl,
    maxDrawdown: maxDrawdown(equityCurve),
    returnVolatility: sampleStandardDeviation(returns),
    sharpeRatio: sampleSharpe(returns),
    closingCoverage: closingCoverage(authoritativeSettled),
    sampleStatus: getSampleStatus(authoritativeSettled.length),
    rankingStatus: getRankingStatus(authoritativeSettled.length),
    tuningEligible: authoritativeSettled.length >= TUNING_MIN_AUTHORITATIVE_SETTLEMENTS,
    filters: input.filters ?? {},
    filterOptions: input.filterOptions ?? {
      games: [],
      providers: [],
      marketKinds: [],
      policyVersions: [],
      promptVersions: [],
    },
    equityCurve,
    byGame: attribute(authoritativeSettled, (bet) => bet.game ?? 'unknown', 'game', input.providerByRunId),
    byProvider: attribute(
      authoritativeSettled,
      (bet) => providerForBet(bet, input.providerByRunId),
      'provider',
      input.providerByRunId,
    ),
    byMarketKind: attribute(
      authoritativeSettled,
      (bet) => bet.marketKind ?? 'unknown',
      'market_kind',
      input.providerByRunId,
    ),
    byPolicy: attribute(
      authoritativeSettled,
      (bet) => bet.policyVersion ?? 'unknown',
      'policy',
      input.providerByRunId,
    ),
    byPromptVersion: attribute(
      authoritativeSettled,
      (bet) => (bet.runId ? input.promptVersionByRunId?.[bet.runId] : undefined) ?? 'manual',
      'prompt_version',
      input.providerByRunId,
    ),
    byEventTier: attribute(authoritativeSettled, (bet) => bet.matchTier ?? 'unknown', 'event_tier'),
    byDataQuality: attribute(
      authoritativeSettled,
      (bet) => qualityBand(metadataForBet(bet, input.runMetadataByRunId)?.dataQuality),
      'data_quality',
    ),
    byConfidenceBand: attribute(
      authoritativeSettled,
      (bet) => confidenceBand(metadataForBet(bet, input.runMetadataByRunId)?.confidence),
      'confidence_band',
    ),
    byEdgeBand: attribute(
      authoritativeSettled,
      (bet) => edgeBand(bet.edgeAtEntry ?? bet.edge),
      'edge_band',
    ),
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
  const rows = [...map.entries()].map(([key, rows]) => {
    const wins = rows.filter((bet) => bet.result === 'won').length;
    const losses = rows.filter((bet) => bet.result === 'lost').length;
    const briers = rows.map(brierForBet).filter((value): value is number => value != null);
    const logLosses = rows.map(logLossForBet).filter((value): value is number => value != null);
    const edges = rows
      .map((bet) => bet.edgeAtEntry ?? bet.edge)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const clvs = rows
      .map((bet) => bet.clv)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const totalStake = rows.reduce((sum, bet) => sum + bet.stake, 0);
    const totalPnl = rows.reduce((sum, bet) => sum + bet.pnl, 0);
    const returns = returnsForBets(rows);
    const captured = rows.filter((bet) => bet.clvStatus === 'captured').length;
    const unavailable = rows.filter((bet) => bet.clvStatus === 'unavailable').length;
    const latencies = rows
      .map((bet) => bet.closingLatencySeconds)
      .filter((value): value is number => value != null && Number.isFinite(value));
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
      avgLogLoss: average(logLosses),
      avgEdge: edges.length > 0 ? edges.reduce((a, b) => a + b, 0) / edges.length : undefined,
      avgClv: clvs.length > 0 ? clvs.reduce((a, b) => a + b, 0) / clvs.length : undefined,
      returnVolatility: sampleStandardDeviation(returns),
      sharpeRatio: sampleSharpe(returns),
      clvCapturedCount: captured,
      clvUnavailableCount: unavailable,
      clvCoverageRate: rows.length > 0 ? captured / rows.length : 0,
      avgClosingAttempts:
        rows.length > 0
          ? rows.reduce((sum, bet) => sum + (bet.closingAttemptCount ?? 0), 0) / rows.length
          : 0,
      avgClosingLatencySeconds: average(latencies),
      sampleStatus: getSampleStatus(rows.length),
      rankingStatus: getRankingStatus(rows.length),
      tuningEligible: rows.length >= TUNING_MIN_AUTHORITATIVE_SETTLEMENTS,
      items: rows
        .map((bet) => ({
          betId: bet.id,
          runId: bet.runId,
          reportId: bet.reportId,
          matchId: bet.matchId,
          game: bet.game,
          marketKind: bet.marketKind,
          placedAt: bet.placedAt,
          result: bet.result,
          stake: bet.stake,
          pnl: bet.pnl,
        }))
        .sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)),
    };
  });
  const rankByKey = new Map(
    rows
      .filter((row) => row.settledCount >= RANKING_MIN_AUTHORITATIVE_SETTLEMENTS)
      .sort((a, b) => b.roi - a.roi || b.totalPnl - a.totalPnl || a.key.localeCompare(b.key))
      .map((row, index) => [row.key, index + 1]),
  );
  return rows
    .map((row) => ({ ...row, rank: rankByKey.get(row.key) }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

function metadataForBet(
  bet: SimBet,
  runMetadataByRunId?: Record<string, PerformanceRunMetadata>,
): PerformanceRunMetadata | undefined {
  return bet.runId ? runMetadataByRunId?.[bet.runId] : undefined;
}

function qualityBand(value?: number): string {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= 0.85) return 'high (>=85%)';
  if (value >= 0.7) return 'medium (70-85%)';
  return 'low (<70%)';
}

function confidenceBand(value?: number): string {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= 0.75) return 'high (>=75%)';
  if (value >= 0.55) return 'medium (55-75%)';
  return 'low (<55%)';
}

function edgeBand(value?: number): string {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 0) return 'negative';
  if (value < 0.05) return '0-5%';
  if (value < 0.1) return '5-10%';
  return '10%+';
}

function providerForBet(bet: SimBet, providerByRunId?: Record<string, string>): string {
  return bet.provider ?? (bet.runId ? providerByRunId?.[bet.runId] : undefined) ?? 'user';
}

function getSampleStatus(count: number): 'insufficient' | 'caution' | 'reliable' {
  return count < RANKING_MIN_AUTHORITATIVE_SETTLEMENTS
    ? 'insufficient'
    : count < TUNING_MIN_AUTHORITATIVE_SETTLEMENTS
      ? 'caution'
      : 'reliable';
}

function getRankingStatus(count: number): 'hidden' | 'provisional' | 'eligible' {
  return count < RANKING_MIN_AUTHORITATIVE_SETTLEMENTS
    ? 'hidden'
    : count < TUNING_MIN_AUTHORITATIVE_SETTLEMENTS
      ? 'provisional'
      : 'eligible';
}

function returnsForBets(bets: SimBet[]): number[] {
  return bets
    .filter((bet) => Number.isFinite(bet.stake) && bet.stake > 0 && Number.isFinite(bet.pnl))
    .map((bet) => bet.pnl / bet.stake);
}

function average(values: number[]): number | undefined {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

function sampleStandardDeviation(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = average(values)!;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sampleSharpe(values: number[]): number | undefined {
  const volatility = sampleStandardDeviation(values);
  if (volatility == null || volatility <= 1e-12) return undefined;
  return (average(values)! / volatility) * Math.sqrt(values.length);
}

function closingCoverage(bets: SimBet[]): ClosingCoverageSummary {
  const captured = bets.filter((bet) => bet.clvStatus === 'captured');
  const unavailable = bets.filter((bet) => bet.clvStatus === 'unavailable');
  const pendingCount = Math.max(0, bets.length - captured.length - unavailable.length);
  const latencies = captured
    .map((bet) => bet.closingLatencySeconds)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const reasonCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const bet of captured) {
    const source = bet.closingSource ?? 'UNKNOWN';
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }
  for (const bet of unavailable) {
    const reason = bet.clvUnavailableReason ?? 'UNKNOWN';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  return {
    eligibleCount: bets.length,
    capturedCount: captured.length,
    unavailableCount: unavailable.length,
    pendingCount,
    coverageRate: bets.length > 0 ? captured.length / bets.length : 0,
    averageAttempts:
      bets.length > 0
        ? bets.reduce((sum, bet) => sum + (bet.closingAttemptCount ?? 0), 0) / bets.length
        : 0,
    averageCaptureLatencySeconds: average(latencies),
    sources: [...sourceCounts.entries()]
      .map(([source, count]) => ({
        source,
        count,
        coverageRate: bets.length > 0 ? count / bets.length : 0,
      }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    unavailableReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
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
  const usable = bets
    .map((bet) => ({
      probability: bet.modelProbability ?? bet.userProbability,
      outcome: outcomeToBinary(bet.result),
    }))
    .filter(
      (item): item is { probability: number; outcome: 0 | 1 } =>
        item.probability != null && Number.isFinite(item.probability) && item.outcome != null,
    );
  if (usable.length === 0) return undefined;
  let weightedError = 0;
  for (let index = 0; index < 10; index++) {
    const low = index / 10;
    const high = (index + 1) / 10;
    const bucket = usable.filter(
      (item) =>
        item.probability >= low &&
        (index === 9 ? item.probability <= high : item.probability < high),
    );
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
