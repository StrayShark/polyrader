import { describe, expect, it, vi } from 'vitest';
import type { BoardValidationSummary, EsportsGame } from '@polyrader/core';
import { CurrentSourceReleaseAuditService } from '../services/current-source-release-audit-service';

describe('Sprint G current-source release audit', () => {
  it('stops before provider execution while a real market is missing', async () => {
    const execute = vi.fn();
    const service = serviceFor(board('needs_data', 'waiting'), execute);

    const result = await service.run('dota2');

    expect(result.analysis.status).toBe('skipped');
    expect(result.analysis.detail).toContain('market alignment');
    expect(result.stageTimings.map((stage) => stage.stage)).toEqual([
      'source_sync',
      'fact_normalize',
      'provider_execute',
      'gate_evaluate',
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs the provider only after current facts and market alignment pass', async () => {
    const execute = vi.fn().mockResolvedValue({ run: { runId: 'current-run-1' } });
    const service = serviceFor(board('paper_ready', 'passed'), execute);

    const result = await service.run('cs2');

    expect(result.analysis).toMatchObject({ status: 'completed', runId: 'current-run-1' });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ game: 'cs2', matchId: 'current-match' }),
    );
  });

  it('enriches incomplete CS2 facts before provider execution', async () => {
    const incomplete = board('needs_data', 'passed');
    incomplete.stages = incomplete.stages.map((stage) =>
      stage.stage === 'fact_normalize' ? { ...stage, status: 'warning' } : stage,
    );
    const ready = board('paper_ready', 'passed');
    const normalizeGame = vi
      .fn()
      .mockReturnValueOnce({ summary: incomplete, persisted: [] })
      .mockReturnValueOnce({ summary: ready, persisted: [] })
      .mockReturnValue({ summary: ready, persisted: [] });
    const prepare = vi.fn().mockResolvedValue({
      game: 'cs2',
      externalMatchId: 'current-match',
      attemptedRefresh: true,
      refreshed: true,
      normalized: ready.sampleMatch,
    });
    const execute = vi.fn().mockResolvedValue({ run: { runId: 'enriched-run' } });
    const discoverForFacts = vi.fn().mockResolvedValue({
      scanned: 0,
      aligned: 0,
      marketIds: [],
      detail: 'no public markets',
    });
    const service = new CurrentSourceReleaseAuditService({
      sources: {
        syncGame: async () => ({
          game: 'cs2',
          status: 'success',
          records: 1,
          sources: [{ source: 'hltv', status: 'success', records: 1 }],
          startedAt: '2026-07-22T00:00:00.000Z',
          finishedAt: '2026-07-22T00:00:01.000Z',
        }),
      },
      normalization: { normalizeGame },
      preparation: { prepare },
      analysis: { execute },
      marketDiscovery: { discoverForFacts: vi.fn() },
      cs2MarketDiscovery: { discoverForFacts },
      gates: {
        get: () => ({
          game: 'cs2',
          status: 'blocked',
          fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
          currentSource: { status: 'blocked', checkedAt: '', stages: [], blockers: ['waiting'] },
        }),
      },
      history: { save: vi.fn() },
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });

    const result = await service.run('cs2');

    expect(prepare).toHaveBeenCalledWith('cs2', 'current-match');
    expect(discoverForFacts).toHaveBeenCalled();
    expect(normalizeGame.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.analysis).toMatchObject({ status: 'completed', runId: 'enriched-run' });
  });

  it('refreshes CS2 facts when the board is paper-ready but the source snapshot is stale', async () => {
    const staleReady = board('needs_data', 'passed');
    staleReady.freshnessSeconds = 20 * 60 * 60;
    staleReady.stages = staleReady.stages.map((stage) =>
      stage.stage === 'source_sync' ? { ...stage, status: 'warning' } : stage,
    );
    const freshReady = board('paper_ready', 'passed');
    const normalizeGame = vi
      .fn()
      .mockReturnValueOnce({ summary: staleReady, persisted: [] })
      .mockReturnValue({ summary: freshReady, persisted: [] });
    const prepare = vi.fn().mockResolvedValue({
      game: 'cs2',
      externalMatchId: 'current-match',
      attemptedRefresh: true,
      refreshed: true,
      normalized: freshReady.sampleMatch,
    });
    const execute = vi.fn().mockResolvedValue({ run: { runId: 'fresh-run' } });
    const service = new CurrentSourceReleaseAuditService({
      sources: {
        syncGame: async () => ({
          game: 'cs2',
          status: 'success',
          records: 1,
          sources: [{ source: 'hltv', status: 'success', records: 1 }],
          startedAt: '2026-07-22T00:00:00.000Z',
          finishedAt: '2026-07-22T00:00:01.000Z',
        }),
      },
      normalization: { normalizeGame },
      preparation: { prepare },
      analysis: { execute },
      marketDiscovery: { discoverForFacts: vi.fn() },
      cs2MarketDiscovery: {
        discoverForFacts: vi.fn().mockResolvedValue({
          scanned: 1,
          aligned: 1,
          marketIds: ['m1'],
          detail: '1/1 public CS2 markets aligned',
        }),
      },
      gates: {
        get: () => ({
          game: 'cs2',
          status: 'blocked',
          fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
          currentSource: { status: 'blocked', checkedAt: '', stages: [], blockers: ['waiting'] },
        }),
      },
      history: { save: vi.fn() },
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });

    const result = await service.run('cs2');

    expect(prepare).toHaveBeenCalledWith('cs2', 'current-match');
    expect(result.analysis).toMatchObject({ status: 'completed', runId: 'fresh-run' });
  });

  it('does not execute a provider for a stale scheduled match', async () => {
    const execute = vi.fn();
    const stale = board('paper_ready', 'passed');
    stale.sampleMatch!.startsAt = '2026-07-21T00:00:00.000Z';
    const service = serviceFor(stale, execute);

    const result = await service.run('cs2');

    expect(result.analysis.detail).toContain('no longer an eligible pre-match');
    expect(execute).not.toHaveBeenCalled();
  });

  it('redacts provider account metadata from a failed audit', async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Doubao API error: InvalidSubscription for account (123456). Request id: abc123. See https://provider.example/renew',
        ),
      );
    const service = serviceFor(board('paper_ready', 'passed'), execute);

    const result = await service.run('cs2');

    expect(result.analysis.status).toBe('failed');
    expect(result.analysis.detail).toContain('InvalidSubscription');
    expect(result.analysis.detail).toContain('account [redacted]');
    expect(result.analysis.detail).toContain('request id: [redacted]');
    expect(result.analysis.failure?.category).toBe('subscription');
    expect(result.analysis.detail).not.toContain('123456');
    expect(result.analysis.detail).not.toContain('provider.example');
  });

  it('discovers LoL markets during a current-source audit before gate evaluation', async () => {
    const execute = vi.fn();
    const discoverForCandidates = vi.fn().mockResolvedValue({
      scanned: 2,
      aligned: 1,
      marketIds: ['lol-1'],
      detail: '1/2 LoL markets aligned',
    });
    const ready = board('paper_ready', 'passed');
    ready.game = 'lol';
    ready.sampleMatch = {
      ...ready.sampleMatch!,
      game: 'lol',
      id: 'lol:current-match',
      adapterVersion: 'lol.facts.v2',
    };
    const service = new CurrentSourceReleaseAuditService({
      sources: {
        syncGame: async () => ({
          game: 'lol',
          status: 'success',
          records: 1,
          sources: [{ source: 'liquipedia', status: 'success', records: 1 }],
          startedAt: '2026-07-22T00:00:00.000Z',
          finishedAt: '2026-07-22T00:00:01.000Z',
        }),
      },
      normalization: { normalizeGame: () => ({ summary: ready, persisted: [] }) },
      preparation: { prepare: vi.fn() },
      analysis: { execute },
      marketDiscovery: { discoverForFacts: vi.fn() },
      cs2MarketDiscovery: { discoverForFacts: vi.fn() },
      lolMarketDiscovery: { discoverForFacts: vi.fn(), discoverForCandidates },
      valorantMarketDiscovery: { discoverForFacts: vi.fn(), discoverForCandidates: vi.fn() },
      gates: {
        get: () => ({
          game: 'lol',
          status: 'blocked',
          fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
          currentSource: { status: 'blocked', checkedAt: '', stages: [], blockers: ['waiting'] },
        }),
      },
      history: { save: vi.fn() },
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });

    const result = await service.run('lol');

    expect(discoverForCandidates).toHaveBeenCalledWith([ready.sampleMatch]);
    expect(result.stageTimings.find((stage) => stage.stage === 'fact_normalize')?.detail).toContain(
      '1/2 LoL markets aligned',
    );
    expect(
      result.board.stages.find((stage) => stage.stage === 'market_align')?.detail,
    ).toContain('discovery 1/2');
  });
});

function serviceFor(boardSummary: BoardValidationSummary, execute: ReturnType<typeof vi.fn>) {
  const history = { save: vi.fn() };
  return new CurrentSourceReleaseAuditService({
    sources: {
      syncGame: async (game: EsportsGame) => ({
        game,
        status: 'success',
        records: 1,
        sources: [{ source: 'grid', status: 'success', records: 1 }],
        startedAt: '2026-07-22T00:00:00.000Z',
        finishedAt: '2026-07-22T00:00:01.000Z',
      }),
    },
    normalization: { normalizeGame: () => ({ summary: boardSummary, persisted: [] }) },
    preparation: { prepare: vi.fn() },
    analysis: { execute },
    marketDiscovery: { discoverForFacts: vi.fn() },
    cs2MarketDiscovery: { discoverForFacts: vi.fn() },
    lolMarketDiscovery: { discoverForFacts: vi.fn(), discoverForCandidates: vi.fn() },
    valorantMarketDiscovery: { discoverForFacts: vi.fn(), discoverForCandidates: vi.fn() },
    gates: {
      get: (game) => ({
        game,
        status: 'blocked',
        fixture: { status: 'missing', checkedAt: '', stages: [], blockers: [] },
        currentSource: { status: 'blocked', checkedAt: '', stages: [], blockers: ['waiting'] },
      }),
    },
    history,
    now: () => new Date('2026-07-22T00:00:00.000Z'),
  });
}

function board(
  boardState: BoardValidationSummary['boardState'],
  marketStatus: BoardValidationSummary['stages'][number]['status'],
): BoardValidationSummary {
  return {
    game: 'cs2',
    boardState,
    completeness: 1,
    freshnessSeconds: 10,
    missing: [],
    conflictFlags: [],
    sourceCount: 1,
    matchCount: 1,
    sampleMatch: {
      id: 'cs2:current-match',
      game: 'cs2',
      externalMatchId: 'current-match',
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
      dataSnapshotHash: 'sha256:current',
      adapterVersion: 'cs2.v1',
    },
    stages: [
      { stage: 'source_sync', status: 'passed', detail: 'fresh' },
      { stage: 'fact_normalize', status: 'passed', detail: 'complete' },
      { stage: 'market_align', status: marketStatus, detail: 'market' },
    ],
  };
}
