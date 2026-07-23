import type { EsportsGame, ReleaseLifecycleSummary } from '@polyrader/core';
import { AnalysisRunRepository, SimBetRepository } from '@polyrader/infra';
import { ReleaseGateService } from './release-gate-service';

export class ReleaseLifecycleService {
  private readonly gates: Pick<ReleaseGateService, 'get'>;
  private readonly runs: Pick<AnalysisRunRepository, 'getPaperDecisionByRun'>;
  private readonly bets: Pick<SimBetRepository, 'getById'>;

  constructor(deps?: {
    gates?: Pick<ReleaseGateService, 'get'>;
    runs?: Pick<AnalysisRunRepository, 'getPaperDecisionByRun'>;
    bets?: Pick<SimBetRepository, 'getById'>;
  }) {
    this.gates = deps?.gates ?? new ReleaseGateService();
    this.runs = deps?.runs ?? new AnalysisRunRepository();
    this.bets = deps?.bets ?? new SimBetRepository();
  }

  get(game: EsportsGame): ReleaseLifecycleSummary {
    const gate = this.gates.get(game);
    const runId = gate.currentSource.runId;
    if (!runId) {
      return {
        game,
        checkedAt: new Date().toISOString(),
        closing: 'not_applicable',
        settlement: 'not_applicable',
        statistics: 'not_applicable',
        nextAction: gate.currentSource.blockers[0] ?? 'Run a current-source audit.',
      };
    }

    const decision = this.runs.getPaperDecisionByRun(runId);
    const bet = decision?.betId ? this.bets.getById(decision.betId) : undefined;
    const decisionAction = decision?.action as ReleaseLifecycleSummary['decisionAction'];
    const closing = !bet
      ? 'not_applicable'
      : bet.clvStatus === 'captured'
        ? 'captured'
        : bet.clvStatus === 'unavailable'
          ? 'unavailable'
          : 'waiting';
    const settlement = !bet
      ? 'not_applicable'
      : bet.status === 'open'
        ? 'waiting'
        : bet.status === 'voided'
          ? 'void'
          : 'settled';
    const statisticsStage = gate.currentSource.stages.find((stage) => stage.stage === 'statistics');
    const statistics = !bet
      ? 'not_applicable'
      : statisticsStage?.status === 'passed'
        ? 'complete'
        : 'waiting';

    return {
      game,
      checkedAt: new Date().toISOString(),
      runId,
      betId: bet?.id,
      decisionAction,
      closing,
      settlement,
      statistics,
      nextAction: nextAction({ gateStatus: gate.status, decisionAction, closing, settlement }),
    };
  }
}

function nextAction(input: {
  gateStatus: 'verified' | 'fixture_ready' | 'blocked';
  decisionAction?: ReleaseLifecycleSummary['decisionAction'];
  closing: ReleaseLifecycleSummary['closing'];
  settlement: ReleaseLifecycleSummary['settlement'];
}): string {
  if (input.gateStatus === 'verified') return 'Current-source release evidence is complete.';
  if (input.decisionAction !== 'paper_bet') {
    return 'Wait for an aligned, policy-eligible current market; do not force an order.';
  }
  if (input.closing === 'waiting')
    return 'Wait for the closing boundary and capture a reliable price.';
  if (input.closing === 'unavailable')
    return 'Record the closing coverage gap and use a future eligible sample.';
  if (input.settlement === 'waiting')
    return 'Wait for the authoritative result and reconcile idempotently.';
  return 'Verify linked-bet Brier, CLV, PnL, ROI, and equity attribution.';
}
