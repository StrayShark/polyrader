import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CurrentSourceReleaseAuditResult, EsportsGame } from '@polyrader/core';
import { ValidationLabController } from '../controllers/validation-lab-controller';

describe('ValidationLabController current-source smoke', () => {
  afterEach(() => {
    delete process.env.POLYRADER_CURRENT_SOURCE_SMOKE_BOARD_TIMEOUT_MS;
  });

  it('runs all boards with provider execution disabled by default', async () => {
    const run = vi
      .fn()
      .mockImplementation(async (game: EsportsGame) => {
        if (game === 'valorant') throw new Error('GRID title unavailable');
        return auditResult(game, game === 'cs2' ? 'verified' : 'fixture_ready');
      });
    const controller = new ValidationLabController();
    (controller as unknown as { releaseAudit: { run: typeof run } }).releaseAudit = { run };
    const response = mockResponse();

    await controller.runCurrentSourceSmoke({ body: {} } as never, response.res as never);

    expect(run).toHaveBeenCalledTimes(4);
    expect(run).toHaveBeenCalledWith('cs2', { executeAnalysis: false, preferredExternalMatchId: undefined });
    expect(response.status).toHaveBeenCalledWith(201);
    const payload = response.json.mock.calls[0]?.[0].data;
    expect(payload.releaseReady).toBe(false);
    expect(payload.verifiedCount).toBe(1);
    expect(payload.boards.map((board: { game: string }) => board.game)).toEqual([
      'cs2',
      'lol',
      'dota2',
      'valorant',
    ]);
    expect(payload.boards.find((board: { game: string }) => board.game === 'valorant')).toMatchObject({
      status: 'failed',
      blocker: 'GRID title unavailable',
    });
  });

  it('returns a failed board when a smoke audit exceeds the board timeout', async () => {
    process.env.POLYRADER_CURRENT_SOURCE_SMOKE_BOARD_TIMEOUT_MS = '1000';
    const run = vi.fn().mockImplementation(async (game: EsportsGame) => {
      if (game === 'lol') return new Promise(() => undefined);
      return auditResult(game, 'fixture_ready');
    });
    const controller = new ValidationLabController();
    (controller as unknown as { releaseAudit: { run: typeof run } }).releaseAudit = { run };
    const response = mockResponse();

    await controller.runCurrentSourceSmoke({ body: {} } as never, response.res as never);

    const payload = response.json.mock.calls[0]?.[0].data;
    expect(payload.boards.find((board: { game: string }) => board.game === 'lol')).toMatchObject({
      status: 'failed',
      gate: 'failed',
      blocker: 'current-source smoke lol timed out after 1000ms',
    });
    expect(payload.boards).toHaveLength(4);
  });
});

function mockResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    status,
    json,
    res: { status, json },
  };
}

function auditResult(
  game: EsportsGame,
  gateStatus: CurrentSourceReleaseAuditResult['gate']['status'],
): CurrentSourceReleaseAuditResult {
  return {
    auditId: `audit-${game}`,
    game,
    startedAt: '2026-07-22T12:00:00.000Z',
    finishedAt: '2026-07-22T12:00:01.000Z',
    sync: {
      game,
      status: 'success',
      records: 1,
      sources: [{ source: 'grid', status: 'success', records: 1 }],
      startedAt: '2026-07-22T12:00:00.000Z',
      finishedAt: '2026-07-22T12:00:01.000Z',
    },
    board: {
      game,
      boardState: gateStatus === 'verified' ? 'paper_ready' : 'needs_data',
      completeness: gateStatus === 'verified' ? 1 : 0.4,
      freshnessSeconds: 120,
      sourceCount: 1,
      matchCount: 1,
      sampleMatch: undefined,
      missing: [],
      missingFacts: [],
      conflictFlags: [],
      stages: [{ stage: 'market_align', status: 'blocked', detail: 'market missing' }],
    } as unknown as CurrentSourceReleaseAuditResult['board'],
    analysis: {
      status: 'skipped',
      detail: 'provider execution disabled for this audit',
    },
    stageTimings: [],
    gate: {
      game,
      status: gateStatus,
      fixture: { status: 'passed', checkedAt: '', stages: [], blockers: [] },
      currentSource: {
        status: gateStatus === 'verified' ? 'passed' : 'blocked',
        checkedAt: '',
        stages: [],
        blockers: gateStatus === 'verified' ? [] : ['market: current source market is missing'],
      },
    },
  };
}
