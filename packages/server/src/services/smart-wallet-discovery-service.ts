import type { PolymarketLeaderboardEntry, PolymarketUserPosition } from '@polyrader/core';
import { PolymarketDataClient, WhaleRepository } from '@polyrader/infra';
import { logger } from '../utils/logger';

const EMPTY_SUSPICIOUS_SCORE = {
  total: 0,
  volumeAnomaly: 0,
  timingAnomaly: 0,
  patternAnomaly: 0,
  correlationAnomaly: 0,
};

export interface SmartWalletDiscoveryResult {
  discovered: number;
  qualified: number;
  failedProfiles: number;
}

export class SmartWalletDiscoveryService {
  constructor(
    private dataClient = new PolymarketDataClient(),
    private whaleRepo = new WhaleRepository(),
  ) {}

  async discoverTopWallets(limit = 12): Promise<SmartWalletDiscoveryResult> {
    const leaders = await this.dataClient.getLeaderboard({
      limit,
      orderBy: 'PNL',
      timePeriod: 'ALL',
    });

    let discovered = 0;
    let qualified = 0;
    let failedProfiles = 0;

    await mapWithConcurrency(leaders, 4, async (leader) => {
      try {
        const positions = await this.dataClient.getClosedPositions(leader.address, 100);
        const metrics = calculateClosedPositionPerformance(positions);
        this.persistLeader(leader, metrics);
        discovered += 1;
        if (isQualifiedSmartWallet(metrics)) qualified += 1;
      } catch (err) {
        failedProfiles += 1;
        logger.warn('[SmartWalletDiscovery] Failed to load wallet performance', {
          address: leader.address,
          error: (err as Error).message,
        });
      }
    });

    logger.info('[SmartWalletDiscovery] Refresh complete', { discovered, qualified, failedProfiles });
    return { discovered, qualified, failedProfiles };
  }

  private persistLeader(
    leader: PolymarketLeaderboardEntry,
    metrics: ReturnType<typeof calculateClosedPositionPerformance>,
  ): void {
    const existing = this.whaleRepo.findByAddress(leader.address);
    const existingTrades = this.whaleRepo.getTrades(leader.address, 100);
    this.whaleRepo.upsert({
      address: leader.address,
      label: leader.userName ?? existing?.label,
      totalVolume: Math.max(leader.volume, existing?.totalVolume ?? 0),
      totalPositions: Math.max(metrics.settledBets, existing?.totalPositions ?? 0),
      activePositions: existing?.activePositions ?? 0,
      winRate: metrics.winRate,
      pnl: metrics.totalPnl,
      suspiciousScore: existing?.suspiciousScore ?? EMPTY_SUSPICIOUS_SCORE,
      recentTrades: existingTrades.length > 0 ? existingTrades.slice(0, 20) : (existing?.recentTrades ?? []),
      lastActive: existing?.lastActive ?? new Date().toISOString(),
    });
    this.whaleRepo.updatePerformance(leader.address, metrics);
  }
}

export function isQualifiedSmartWallet(metrics: ReturnType<typeof calculateClosedPositionPerformance>): boolean {
  return metrics.settledBets >= 10 && metrics.winRate >= 0.6 && metrics.roi >= 0.02;
}

export function calculateClosedPositionPerformance(positions: PolymarketUserPosition[]): {
  winRate: number;
  totalPnl: number;
  settledBets: number;
  wins: number;
  losses: number;
  totalWagered: number;
  roi: number;
} {
  const settled = positions.filter((position) => (
    position.cashPnl !== undefined && Number.isFinite(position.cashPnl) && position.cashPnl !== 0
  ));
  const wins = settled.filter((position) => (position.cashPnl ?? 0) > 0).length;
  const losses = settled.filter((position) => (position.cashPnl ?? 0) < 0).length;
  const totalPnl = settled.reduce((sum, position) => sum + (position.cashPnl ?? 0), 0);
  const totalWagered = settled.reduce((sum, position) => sum + Math.max(0, position.initialValue ?? 0), 0);
  const settledBets = wins + losses;
  return {
    winRate: settledBets > 0 ? wins / settledBets : 0,
    totalPnl,
    settledBets,
    wins,
    losses,
    totalWagered,
    roi: totalWagered > 0 ? totalPnl / totalWagered : 0,
  };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

export const sharedSmartWalletDiscovery = new SmartWalletDiscoveryService();
