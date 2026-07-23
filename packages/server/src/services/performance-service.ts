import {
  buildPerformanceSummary,
  type PerformanceFilterOptions,
  type PerformanceFilters,
  type PerformanceSummary,
  type SimBet,
  type AnalysisReport,
  type PerformanceRunMetadata,
} from '@polyrader/core';
import { AnalysisRunRepository, SimAccountRepository, SimBetRepository } from '@polyrader/infra';

export class PerformanceService {
  private bets = new SimBetRepository();
  private accounts = new SimAccountRepository();
  private runs = new AnalysisRunRepository();

  getSummary(accountId = 'default', filters: PerformanceFilters = {}): PerformanceSummary {
    const account =
      accountId === 'default'
        ? this.accounts.getDefault()
        : (this.accounts.getById(accountId) ?? this.accounts.getDefault());
    const allBets = this.bets.getAllBets(account.id);
    const providerByRunId: Record<string, string> = {};
    const promptVersionByRunId: Record<string, string> = {};
    const runMetadataByRunId: Record<string, PerformanceRunMetadata> = {};
    const loadedRuns = new Set<string>();
    for (const bet of allBets) {
      if (!bet.runId || loadedRuns.has(bet.runId)) continue;
      loadedRuns.add(bet.runId);
      const run = this.runs.getRun(bet.runId);
      if (run?.provider) providerByRunId[bet.runId] = run.provider;
      if (run?.promptVersion) promptVersionByRunId[bet.runId] = run.promptVersion;
      const report = this.runs.getReportByRun(bet.runId);
      if (report) {
        try {
          const parsed = JSON.parse(report.reportJson) as AnalysisReport;
          runMetadataByRunId[bet.runId] = {
            dataQuality: parsed.dataQuality?.completeness,
            confidence: parsed.confidence?.score,
          };
        } catch {
          // A malformed historical report remains visible under the unknown attribution bucket.
        }
      }
    }
    const filterOptions = this.buildFilterOptions(allBets, providerByRunId, promptVersionByRunId);
    const filteredBets = allBets.filter((bet) =>
      this.matchesFilters(bet, filters, providerByRunId, promptVersionByRunId),
    );
    return buildPerformanceSummary({
      bets: filteredBets,
      initialBankroll: account.initialBankroll,
      providerByRunId,
      promptVersionByRunId,
      runMetadataByRunId,
      filters,
      filterOptions,
    });
  }

  private buildFilterOptions(
    bets: SimBet[],
    providerByRunId: Record<string, string>,
    promptVersionByRunId: Record<string, string>,
  ): PerformanceFilterOptions {
    return {
      games: unique(bets.map((bet) => bet.game ?? 'unknown')),
      providers: unique(bets.map((bet) => this.providerForBet(bet, providerByRunId))),
      marketKinds: unique(bets.map((bet) => bet.marketKind ?? 'unknown')),
      policyVersions: unique(bets.map((bet) => bet.policyVersion ?? 'unknown')),
      promptVersions: unique(
        bets.map((bet) => (bet.runId ? (promptVersionByRunId[bet.runId] ?? 'unknown') : 'manual')),
      ),
    };
  }

  private matchesFilters(
    bet: SimBet,
    filters: PerformanceFilters,
    providerByRunId: Record<string, string>,
    promptVersionByRunId: Record<string, string>,
  ): boolean {
    if (filters.game && (bet.game ?? 'unknown') !== filters.game) return false;
    if (filters.provider && this.providerForBet(bet, providerByRunId) !== filters.provider) {
      return false;
    }
    if (filters.marketKind && (bet.marketKind ?? 'unknown') !== filters.marketKind) return false;
    if (filters.policyVersion && (bet.policyVersion ?? 'unknown') !== filters.policyVersion) {
      return false;
    }
    const promptVersion = bet.runId ? (promptVersionByRunId[bet.runId] ?? 'unknown') : 'manual';
    if (filters.promptVersion && promptVersion !== filters.promptVersion) return false;

    const placedAt = Date.parse(bet.placedAt);
    if (filters.from && placedAt < Date.parse(`${filters.from}T00:00:00.000Z`)) return false;
    if (filters.to && placedAt >= Date.parse(`${filters.to}T00:00:00.000Z`) + 86_400_000) {
      return false;
    }
    return true;
  }

  private providerForBet(bet: SimBet, providerByRunId: Record<string, string>): string {
    return bet.provider ?? (bet.runId ? providerByRunId[bet.runId] : undefined) ?? 'user';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
