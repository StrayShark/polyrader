import type { BankrollSummary, EquityCurvePoint, SimAccount, RiskMetrics, SimBet, EquityCurveGranularity } from '@polyrader/core';
import { SimAccountRepository, SimBetRepository } from '@polyrader/infra';
import { SimBetService } from './sim-bet-service';

export class BankrollService {
  private accountRepo = new SimAccountRepository();
  private betRepo = new SimBetRepository();
  private betService = new SimBetService();

  getSummary(accountId = 'default', granularity: EquityCurveGranularity = 'day'): BankrollSummary {
    const account = accountId === 'default'
      ? this.accountRepo.getDefault()
      : this.accountRepo.getById(accountId) ?? this.accountRepo.getDefault();

    const todayPnl = this.betRepo.getTodayPnl(account.id);
    const openExposure = this.betRepo.getOpenBetsTotalExposure(account.id);
    const equityCurve = this.getEquityCurve(account.id, account.initialBankroll, granularity);
    const openBets = this.betService.listBets(account.id, 'open');
    const settledBets = this.betService.listBets(account.id, 'settled');
    const voidedBets = this.betService.listBets(account.id, 'voided');
    const allBets = this.betRepo.getAllBets(account.id);

    return {
      account: { ...account, openExposure },
      todayPnl,
      openExposure,
      equityCurve,
      openBets,
      settledBets,
      voidedBets,
      riskMetrics: this.computeRiskMetrics(allBets, account.initialBankroll),
    };
  }

  getEquityCurve(accountId: string, initialBankroll: number, granularity: EquityCurveGranularity = 'day'): EquityCurvePoint[] {
    const settled = this.betRepo
      .getByAccount(accountId, 'settled')
      .filter((b) => b.settledAt)
      .sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : 1));

    if (settled.length === 0) return [];

    const points: EquityCurvePoint[] = [];
    let equity = initialBankroll;

    for (const bet of settled) {
      equity += bet.pnl;
      points.push({
        timestamp: bet.settledAt!,
        equity: Math.round(equity * 100) / 100,
        cumulativePnl: equity - initialBankroll,
        provider: 'user',
      });
    }

    if (granularity === 'all') return points;
    return this.aggregateEquityCurve(points, initialBankroll, granularity);
  }

  private aggregateEquityCurve(points: EquityCurvePoint[], initialBankroll: number, granularity: EquityCurveGranularity): EquityCurvePoint[] {
    if (points.length === 0) return [];

    const grouped = new Map<string, EquityCurvePoint>();
    for (const p of points) {
      const key = this.toPeriodKey(p.timestamp, granularity);
      // Keep the latest equity in each period
      grouped.set(key, p);
    }

    const sortedKeys = Array.from(grouped.keys()).sort();
    const result: EquityCurvePoint[] = [];
    for (const key of sortedKeys) {
      const p = grouped.get(key)!;
      result.push({
        timestamp: key,
        equity: p.equity,
        cumulativePnl: p.equity - initialBankroll,
        provider: 'user',
      });
    }
    return result;
  }

  private toPeriodKey(timestamp: string, granularity: EquityCurveGranularity): string {
    const d = new Date(timestamp);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');

    if (granularity === 'day') {
      return `${year}-${month}-${day}`;
    }

    if (granularity === 'week') {
      const oneJan = new Date(Date.UTC(year, 0, 1));
      const weekNum = String(Math.ceil((((d.getTime() - oneJan.getTime()) / 86400000) + oneJan.getUTCDay() + 1) / 7)).padStart(2, '0');
      return `${year}-W${weekNum}`;
    }

    // month
    return `${year}-${month}`;
  }

  private computeRiskMetrics(bets: SimBet[], initialBankroll: number): RiskMetrics {
    const settled = bets.filter((b) => b.status === 'settled');
    const totalBets = settled.length;
    const wins = settled.filter((b) => b.result === 'won').length;
    const winRate = totalBets > 0 ? wins / totalBets : 0;
    const totalPnl = settled.reduce((sum, b) => sum + b.pnl, 0);
    const totalStaked = bets.reduce((sum, b) => sum + b.stake, 0);
    const averageStake = bets.length > 0 ? totalStaked / bets.length : 0;
    const roi = totalStaked > 0 ? totalPnl / totalStaked : 0;

    // Max drawdown from settled equity curve
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let peak = initialBankroll;
    let equity = initialBankroll;
    for (const bet of settled.sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : 1))) {
      equity += bet.pnl;
      if (equity > peak) peak = equity;
      const drawdown = peak - equity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = peak > 0 ? drawdown / peak : 0;
      }
    }

    // Consecutive losses (max streak)
    let consecutiveLosses = 0;
    let currentStreak = 0;
    for (const bet of settled.sort((a, b) => (a.settledAt! < b.settledAt! ? -1 : 1))) {
      if (bet.result === 'lost') {
        currentStreak += 1;
        if (currentStreak > consecutiveLosses) consecutiveLosses = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    return {
      maxDrawdown,
      maxDrawdownPct,
      consecutiveLosses,
      averageStake,
      totalBets,
      winRate,
      roi,
    };
  }

  recalculateBankroll(accountId: string): SimAccount {
    const account = this.accountRepo.getById(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    const settledPnl = this.betRepo
      .getByAccount(accountId, 'settled')
      .reduce((sum, b) => sum + b.pnl, 0);
    const openExposure = this.betRepo.getOpenBetsTotalExposure(accountId);
    const currentBankroll = account.initialBankroll + settledPnl;

    return this.accountRepo.updateBankroll(
      accountId,
      currentBankroll,
      currentBankroll - openExposure,
      openExposure,
    );
  }
}
