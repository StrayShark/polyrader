import { describe, expect, it } from 'vitest';
import type { AnalysisRunRepository, SimBetRepository } from '@polyrader/infra';
import type { BoardReleaseGateSummary, SimBet } from '@polyrader/core';
import { ReleaseLifecycleService } from '../services/release-lifecycle-service';

describe('Sprint H release lifecycle tracking', () => {
  it('stays non-applicable until a current-source run exists', () => {
    const service = serviceFor(gate(), undefined, undefined);

    expect(service.get('cs2')).toMatchObject({
      closing: 'not_applicable',
      settlement: 'not_applicable',
      statistics: 'not_applicable',
      nextAction: 'market: no aligned current market',
    });
  });

  it('does not force an order after a rejected deterministic decision', () => {
    const service = serviceFor(gate('run-1'), { action: 'rejected', betId: null }, undefined);

    expect(service.get('cs2')).toMatchObject({
      runId: 'run-1',
      decisionAction: 'rejected',
      closing: 'not_applicable',
      nextAction: 'Wait for an aligned, policy-eligible current market; do not force an order.',
    });
  });

  it('reports a complete linked-bet lifecycle after closing and settlement', () => {
    const settledBet = {
      id: 'bet-1',
      accountId: 'default',
      betType: 'single',
      stake: 10,
      totalOdds: 2,
      status: 'settled',
      result: 'won',
      pnl: 10,
      clvStatus: 'captured',
      clv: 0.04,
      placedAt: '2026-07-22T00:00:00.000Z',
    } satisfies SimBet;
    const service = serviceFor(
      gate('run-1', true),
      { action: 'paper_bet', betId: 'bet-1' },
      settledBet,
    );

    expect(service.get('cs2')).toMatchObject({
      betId: 'bet-1',
      closing: 'captured',
      settlement: 'settled',
      statistics: 'complete',
      nextAction: 'Current-source release evidence is complete.',
    });
  });

  it('maps a voided paper bet to a void release settlement', () => {
    const voidedBet = {
      id: 'bet-voided',
      accountId: 'default',
      betType: 'single',
      stake: 10,
      totalOdds: 2,
      status: 'voided',
      result: 'push',
      pnl: 0,
      clvStatus: 'unavailable',
      placedAt: '2026-07-22T00:00:00.000Z',
    } satisfies SimBet;
    const service = serviceFor(
      gate('run-voided'),
      { action: 'paper_bet', betId: 'bet-voided' },
      voidedBet,
    );

    expect(service.get('cs2')).toMatchObject({
      closing: 'unavailable',
      settlement: 'void',
      statistics: 'waiting',
    });
  });
});

function serviceFor(
  releaseGate: BoardReleaseGateSummary,
  decision: { action: string; betId: string | null } | undefined,
  bet: SimBet | undefined,
) {
  return new ReleaseLifecycleService({
    gates: { get: () => releaseGate },
    runs: {
      getPaperDecisionByRun: () => decision,
    } as unknown as AnalysisRunRepository,
    bets: { getById: () => bet } as unknown as SimBetRepository,
  });
}

function gate(runId?: string, verified = false): BoardReleaseGateSummary {
  return {
    game: 'cs2',
    status: verified ? 'verified' : 'blocked',
    fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
    currentSource: {
      status: verified ? 'passed' : 'blocked',
      runId,
      checkedAt: '',
      stages: [
        {
          stage: 'statistics',
          status: verified ? 'passed' : 'missing',
          detail: verified ? 'complete' : 'waiting',
        },
      ],
      blockers: verified ? [] : ['market: no aligned current market'],
    },
  };
}
