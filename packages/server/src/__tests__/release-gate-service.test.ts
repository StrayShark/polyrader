import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, runMigrations } from '@polyrader/infra';
import type { EsportsGame } from '@polyrader/core';
import type { BoardValidationSummary, SimBet } from '@polyrader/core';
import type { AnalysisRunRepository, SimBetRepository } from '@polyrader/infra';
import { AnalysisRunService } from '../services/analysis-run-service';
import { ReleaseGateService } from '../services/release-gate-service';
import { SettlementService } from '../services/settlement-service';
import { SimBetService } from '../services/sim-bet-service';

const testDbPath = path.join(process.cwd(), 'data', 'release-gate-service-test.db');
const games: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

describe('Sprint F four-board release gate', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('requires all nine fixture and current-source stages independently', () => {
    const runs = new AnalysisRunService();
    const settlement = new SettlementService();
    const bets = new SimBetService();
    for (const game of games) {
      const detail = runs.runFixturePipeline({
        game,
        provider: 'fixture-release-gate',
        model: `${game}-release-gate`,
        nonce: `release-${game}`,
      });
      expect(detail.linkedBet?.id).toBeTruthy();
      bets.captureClosingPrice(detail.linkedBet!.id, {
        closingOdds: 1.7,
        source: 'fixture-release-close',
      });
      settlement.settleBet(detail.linkedBet!.id, 'won');
    }

    const gates = new ReleaseGateService().list();
    expect(gates).toHaveLength(4);
    for (const gate of gates) {
      expect(gate.status).toBe('fixture_ready');
      expect(gate.fixture.status).toBe('passed');
      expect(gate.fixture.stages.map((stage) => stage.stage)).toEqual([
        'source',
        'facts',
        'market',
        'prompt',
        'response',
        'report',
        'decision',
        'settlement',
        'statistics',
      ]);
      expect(gate.fixture.stages.every((stage) => stage.status === 'passed')).toBe(true);
      expect(gate.currentSource.status).not.toBe('passed');
      expect(gate.currentSource.blockers.length).toBeGreaterThan(0);
    }
    const report = new ReleaseGateService().report();
    expect(report.releaseReady).toBe(false);
    expect(report.fixtureReadyCount).toBe(4);
    expect(report.verifiedCount).toBe(0);
  });

  it('does not reuse a provider run from a different match or data snapshot', () => {
    const board = readyBoard('cs2', 'current-match', 'sha256:current');
    const staleRun = runRecord({ matchId: 'old-match', dataSnapshotHash: 'sha256:old' });
    const service = new ReleaseGateService({
      normalization: { getBoard: () => ({ summary: board, persisted: [] }) },
      runs: {
        listRuns: () => [staleRun],
      } as unknown as AnalysisRunRepository,
      bets: {} as SimBetRepository,
    });

    const gate = service.get('cs2');
    expect(gate.currentSource.runId).toBeUndefined();
    expect(gate.currentSource.blockers).toContain('prompt: no current-source provider run');
  });

  it('reuses a same-match current-source run when the snapshot hash drifts after refresh', () => {
    const board = readyBoard('cs2', 'current-match', 'sha256:after-refresh');
    const driftedRun = runRecord({
      matchId: 'current-match',
      dataSnapshotHash: 'sha256:before-refresh',
      runId: 'drifted-run',
    });
    const service = new ReleaseGateService({
      normalization: { getBoard: () => ({ summary: board, persisted: [] }) },
      runs: {
        listRuns: () => [driftedRun],
        getPromptArtifact: () => ({ promptHash: 'prompt-hash' }),
        listResponseArtifacts: () => [{ isValid: true }],
        getReportByRun: () => ({ id: 'report-1' }),
        getPaperDecisionByRun: () => ({
          action: 'paper_bet',
          policyVersion: 'policy.v1',
          betId: 'linked-bet',
        }),
      } as unknown as AnalysisRunRepository,
      bets: {
        getById: () => ({
          id: 'linked-bet',
          accountId: 'default',
          betType: 'single',
          stake: 10,
          totalOdds: 2,
          status: 'open',
          result: null,
          pnl: 0,
          placedAt: '2026-07-22T00:00:00.000Z',
        }),
      } as unknown as SimBetRepository,
    });

    const gate = service.get('cs2');
    expect(gate.currentSource.runId).toBe('drifted-run');
    expect(gate.currentSource.blockers).toContain('settlement: linked bet is not settled');
  });

  it('prefers an explicit audit runId over a re-normalized board lookup', () => {
    const board = readyBoard('lol', 'other-match', 'sha256:other');
    const auditRun = runRecord({
      runId: 'audit-run',
      matchId: 'audit-match',
      dataSnapshotHash: 'sha256:audit',
      marketId: 'real-market-1',
    });
    const service = new ReleaseGateService({
      normalization: { getBoard: () => ({ summary: board, persisted: [] }) },
      runs: {
        listRuns: () => [auditRun],
        getPromptArtifact: () => ({ promptHash: 'prompt-hash' }),
        listResponseArtifacts: () => [{ isValid: true }],
        getReportByRun: () => ({ id: 'report-1' }),
        getPaperDecisionByRun: () => ({
          action: 'pass',
          policyVersion: 'policy.v1',
        }),
      } as unknown as AnalysisRunRepository,
      bets: {} as SimBetRepository,
    });

    const gate = service.get('lol', { board, runId: 'audit-run' });
    expect(gate.currentSource.runId).toBe('audit-run');
    expect(gate.currentSource.blockers.some((item) => item.startsWith('prompt:'))).toBe(false);
  });

  it('requires Brier, CLV, and PnL from the linked bet itself', () => {
    const board = readyBoard('cs2', 'current-match', 'sha256:current');
    const currentRun = runRecord({ matchId: 'current-match', dataSnapshotHash: 'sha256:current' });
    const linkedBet = {
      id: 'linked-bet',
      accountId: 'default',
      betType: 'single',
      stake: 10,
      totalOdds: 2,
      status: 'settled',
      result: 'won',
      pnl: 10,
      clvStatus: 'captured',
      clv: 0.05,
      placedAt: '2026-07-22T00:00:00.000Z',
    } satisfies SimBet;
    const service = new ReleaseGateService({
      normalization: { getBoard: () => ({ summary: board, persisted: [] }) },
      runs: {
        listRuns: () => [currentRun],
        getPromptArtifact: () => ({ promptHash: 'prompt-hash' }),
        listResponseArtifacts: () => [{ isValid: true }],
        getReportByRun: () => ({ id: 'report-1' }),
        getPaperDecisionByRun: () => ({
          action: 'paper_bet',
          policyVersion: 'policy.v1',
          betId: 'linked-bet',
        }),
      } as unknown as AnalysisRunRepository,
      bets: { getById: () => linkedBet } as unknown as SimBetRepository,
    });

    const gate = service.get('cs2');
    expect(gate.currentSource.stages.find((stage) => stage.stage === 'settlement')?.status).toBe(
      'passed',
    );
    expect(gate.currentSource.stages.find((stage) => stage.stage === 'statistics')?.status).toBe(
      'missing',
    );
  });
});

function readyBoard(
  game: EsportsGame,
  externalMatchId: string,
  dataSnapshotHash: string,
): BoardValidationSummary {
  return {
    game,
    boardState: 'paper_ready',
    completeness: 1,
    freshnessSeconds: 10,
    missing: [],
    conflictFlags: [],
    sourceCount: 1,
    matchCount: 1,
    sampleMatch: {
      id: `${game}:${externalMatchId}`,
      game,
      externalMatchId,
      eventName: 'Current event',
      startsAt: '2026-07-23T00:00:00.000Z',
      format: 'BO3',
      status: 'scheduled',
      mapPool: [],
      participants: [
        { participantId: 'a', side: 'a', name: 'A', source: 'test' },
        { participantId: 'b', side: 'b', name: 'B', source: 'test' },
      ],
      players: [],
      sourceLinks: [],
      facts: [],
      missing: [],
      conflictFlags: [],
      completeness: 1,
      freshnessSeconds: 10,
      dataSnapshotHash,
      adapterVersion: `${game}.v1`,
    },
    stages: [
      { stage: 'source_sync', status: 'passed', detail: 'fresh source' },
      { stage: 'fact_normalize', status: 'passed', detail: 'complete facts' },
      { stage: 'market_align', status: 'passed', detail: 'real market aligned' },
    ],
  };
}

function runRecord(
  overrides: Partial<{
    runId: string;
    matchId: string;
    dataSnapshotHash: string;
    marketId: string;
  }> & { matchId: string; dataSnapshotHash: string },
) {
  return {
    runId: overrides.runId ?? `run-${overrides.matchId}`,
    game: 'cs2',
    matchId: overrides.matchId,
    marketId: overrides.marketId ?? 'real-market-1',
    marketKind: 'match_winner',
    contractVersion: 'analysis.v1',
    promptVersion: 'cs2.match_winner.v1.0.0',
    responseSchemaVersion: 'analysis-response.v1',
    gameAdapterVersion: 'cs2.v1',
    marketAdapterVersion: 'market.v1',
    dataSnapshotHash: overrides.dataSnapshotHash,
    promptHash: 'prompt-hash',
    status: 'decision_ready' as const,
    validationStatus: 'valid' as const,
    provider: 'minimax',
    model: 'model',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  };
}
