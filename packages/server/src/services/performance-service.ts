import { buildPerformanceSummary, type PerformanceSummary } from '@polyrader/core';
import { AnalysisRunRepository, SimAccountRepository, SimBetRepository } from '@polyrader/infra';

export class PerformanceService {
  private bets = new SimBetRepository();
  private accounts = new SimAccountRepository();
  private runs = new AnalysisRunRepository();

  getSummary(accountId = 'default'): PerformanceSummary {
    const account = accountId === 'default'
      ? this.accounts.getDefault()
      : this.accounts.getById(accountId) ?? this.accounts.getDefault();
    const allBets = this.bets.getAllBets(account.id);
    const providerByRunId: Record<string, string> = {};
    for (const bet of allBets) {
      if (!bet.runId || providerByRunId[bet.runId]) continue;
      const run = this.runs.getRun(bet.runId);
      if (run?.provider) providerByRunId[bet.runId] = run.provider;
    }
    return buildPerformanceSummary({
      bets: allBets,
      initialBankroll: account.initialBankroll,
      providerByRunId,
    });
  }
}
