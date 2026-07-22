import { describe, expect, it } from 'vitest';
import {
  buildDota2FixtureFacts,
  buildBoardValidationSummary,
  buildLolFixtureFacts,
  buildValorantFixtureFacts,
  normalizeCs2MatchFacts,
  normalizeDota2MatchFacts,
  repairAnalysisResponse,
  validateWithOptionalRepair,
  type AnalysisRequestEnvelope,
  type SourceSnapshotLike,
} from '../index';

function envelope(): AnalysisRequestEnvelope {
  return {
    contractVersion: 'analysis.v1',
    runId: 'ar_cs2_1',
    promptVersion: 'cs2.match-winner.v1.0.0',
    game: 'cs2',
    locale: 'zh-CN',
    generatedAt: '2026-07-21T12:00:00.000Z',
    match: {
      matchId: '1',
      eventName: 'Test',
      startsAt: '2026-07-21T20:00:00.000Z',
      format: 'BO3',
      status: 'scheduled',
      participants: [
        { participantId: 'a', name: 'A', side: 'a' },
        { participantId: 'b', name: 'B', side: 'b' },
      ],
    },
    market: {
      marketId: 'm1',
      kind: 'match_winner',
      line: null,
      outcomes: [
        { outcomeId: 'a', label: 'A', marketProbability: 0.55 },
        { outcomeId: 'b', label: 'B', marketProbability: 0.45 },
      ],
      liquidityUsd: 5000,
      observedAt: '2026-07-21T12:00:00.000Z',
    },
    dataSnapshot: {
      dataSnapshotHash: 'sha256:x',
      completeness: 0.9,
      freshnessSeconds: 10,
      facts: [
        {
          factId: 'f1',
          entityType: 'team',
          source: 'hltv',
          observedAt: '2026-07-21T12:00:00.000Z',
          field: 'rank',
          value: 1,
        },
      ],
      missing: [],
    },
    policy: {
      minimumCompleteness: 0.7,
      maximumFreshnessSeconds: 3600,
      minimumConfidence: 0.6,
      minimumEdge: 0.05,
      lowLiquidityThresholdUsd: 1000,
      allowedActions: ['recommend_outcome', 'pass'],
    },
  };
}

describe('repairAnalysisResponse', () => {
  it('repairs probability sum and forbidden fields in one pass', () => {
    const env = envelope();
    const raw = {
      contractVersion: 'wrong',
      runId: 'nope',
      stake: 99,
      prediction: { outcomes: [{ outcomeId: 'a', probability: 0.8 }] },
      confidence: { score: 0.7, grade: 'medium', reasonCodes: [] },
      recommendation: { action: 'recommend_outcome', outcomeId: 'a' },
      evidence: [{ factIds: ['f1'], direction: 'supports', impact: 'medium', summary: 'ok' }],
      risks: [],
      rationaleSummary: 'edge',
    };
    const { repaired, changes } = repairAnalysisResponse(raw, env);
    const result = validateWithOptionalRepair(JSON.stringify(repaired), env, false);
    expect(changes.length).toBeGreaterThan(0);
    expect(result.validation.ok).toBe(true);
  });

  it('extracts JSON object from noisy provider text once', () => {
    const env = envelope();
    const body = {
      contractVersion: 'analysis-response.v1',
      runId: env.runId,
      prediction: {
        outcomes: [
          { outcomeId: 'a', probability: 0.6 },
          { outcomeId: 'b', probability: 0.4 },
        ],
      },
      confidence: { score: 0.7, grade: 'medium', reasonCodes: [] },
      recommendation: { action: 'recommend_outcome', outcomeId: 'a' },
      evidence: [{ factIds: ['f1'], direction: 'supports', impact: 'low', summary: 'form' }],
      risks: [],
      rationaleSummary: 'A is ahead',
    };
    const noisy = `Here you go:\n${JSON.stringify(body)}\nThanks`;
    const result = validateWithOptionalRepair(noisy, env, true);
    expect(result.repairAttempted).toBe(true);
    expect(result.validation.ok).toBe(true);
  });
});

describe('four-game fact adapters', () => {
  it('blocks a complete aligned board when facts exceed the freshness policy', () => {
    const sample = buildDota2FixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    sample.freshnessSeconds = 3601;
    const summary = buildBoardValidationSummary({
      game: 'dota2',
      snapshots: [],
      sampleMatch: sample,
      sourcesConfigured: 1,
      maximumFreshnessSeconds: 3600,
      marketAlignment: {
        aligned: true,
        status: 'aligned',
        detail: 'aligned',
        markets: [],
      },
    });

    expect(summary.boardState).toBe('needs_data');
    expect(summary.stages.find((stage) => stage.stage === 'source_sync')?.status).toBe('warning');
    expect(summary.stages.find((stage) => stage.stage === 'paper_decision')?.detail).toContain(
      'stale',
    );
  });

  it('normalizes a CS2 match with source precedence', () => {
    const snapshots: SourceSnapshotLike[] = [
      {
        game: 'cs2',
        source: 'hltv',
        entityType: 'match',
        externalId: '2395534',
        name: 'NaVi vs FaZe',
        startsAt: '2026-07-21T20:00:00.000Z',
        status: 'scheduled',
        payload: {
          teamAName: 'Natus Vincere',
          teamBName: 'FaZe Clan',
          teamAId: 'navi',
          teamBId: 'faze',
          format: 'BO3',
          eventName: 'IEM Cologne',
        },
        observedAt: '2026-07-21T12:00:00.000Z',
      },
      {
        game: 'cs2',
        source: 'liquipedia',
        entityType: 'team',
        externalId: 'navi',
        name: 'Natus Vincere',
        status: 'active',
        payload: {
          players: [
            { nickname: 'b1t' },
            { nickname: 'jL' },
            { nickname: 'iM' },
            { nickname: 'Aleksib' },
            { nickname: 'w0nderful' },
          ],
        },
        observedAt: '2026-07-21T11:00:00.000Z',
      },
    ];
    const facts = normalizeCs2MatchFacts(snapshots);
    expect(facts).not.toBeNull();
    expect(facts!.dataSnapshotHash.startsWith('sha256:')).toBe(true);
    expect(facts!.participants).toHaveLength(2);
    expect(facts!.players.length).toBeGreaterThanOrEqual(5);
    expect(facts!.completeness).toBeLessThan(1);
    expect(facts!.missing).toContain('ranking_a');
  });

  it('promotes CS2 rankings, recent form, map records and lineup metrics into analysis facts', () => {
    const match: SourceSnapshotLike = {
      game: 'cs2',
      source: 'hltv',
      entityType: 'match',
      externalId: '2396005',
      name: '100 Thieves vs Falcons',
      startsAt: '2026-07-22T17:30:00.000Z',
      status: 'scheduled',
      payload: {
        teamAName: '100 Thieves',
        teamBName: 'Falcons',
        teamAId: '8474',
        teamBId: '11283',
        format: 'BO3',
        lineups: {
          teamA: {
            players: Array.from({ length: 5 }, (_, index) => ({
              playerId: `a${index}`,
              nickname: `A${index}`,
              rating: 1.01 + index / 100,
            })),
          },
          teamB: {
            players: Array.from({ length: 5 }, (_, index) => ({
              playerId: `b${index}`,
              nickname: `B${index}`,
              rating: 1.11 + index / 100,
            })),
          },
        },
      },
      observedAt: '2026-07-21T12:00:00.000Z',
    };
    const team = (
      externalId: string,
      name: string,
      rank: number,
      opponent: string,
    ): SourceSnapshotLike => ({
      game: 'cs2',
      source: 'hltv',
      entityType: 'team',
      externalId,
      name,
      status: 'active',
      payload: {
        rank,
        region: 'Europe',
        players: Array.from({ length: 5 }, (_, index) => ({
          playerId: `${externalId}-${index}`,
          nickname: `${name}-${index}`,
        })),
        recentForm: {
          winRate: 0.7,
          streak: 2,
          last10Matches: [{ opponent, result: 'win', score: '2-1', date: '2026-07-10' }],
        },
        mapPool: { maps: [{ map: 'Mirage', winRate: 0.67, matchesPlayed: 9 }] },
      },
      observedAt: '2026-07-21T11:00:00.000Z',
    });

    const facts = normalizeCs2MatchFacts([
      match,
      team('8474', '100 Thieves', 55, 'Falcons'),
      team('11283', 'Falcons', 1, '100 Thieves'),
    ]);

    expect(facts?.completeness).toBe(1);
    expect(facts?.facts.map((fact) => fact.factId)).toEqual(
      expect.arrayContaining([
        'team-a-ranking',
        'team-b-ranking',
        'team-a-recent-form',
        'team-b-recent-form',
        'team-a-map-pool',
        'team-b-map-pool',
        'team-a-player-stats',
        'team-b-player-stats',
        'head-to-head-recent',
      ]),
    );
    expect(facts?.mapPool).toEqual(['Mirage']);
  });

  it('builds a Dota 2 fixture with immutable snapshot hash', () => {
    const facts = buildDota2FixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    expect(facts.game).toBe('dota2');
    expect(facts.externalMatchId).toBe('8906069414');
    expect(facts.dataSnapshotHash.startsWith('sha256:')).toBe(true);
    expect(facts.missing).toContain('draft');
    const again = normalizeDota2MatchFacts([
      {
        game: 'dota2',
        source: 'opendota',
        entityType: 'match',
        externalId: '8906069414',
        name: 'Team Liquid vs Team Falcons',
        startsAt: '2026-07-22T10:00:00.000Z',
        status: 'scheduled',
        payload: {
          radiant_name: 'Team Liquid',
          dire_name: 'Team Falcons',
          radiant_team_id: 'liquid',
          dire_team_id: 'falcons',
          radiant_rating: 1542.5,
          dire_rating: 1510.2,
          league_name: 'Example League',
        },
        observedAt: '2026-07-21T12:00:00.000Z',
      },
      {
        game: 'dota2',
        source: 'opendota',
        entityType: 'patch',
        externalId: '7.39',
        name: '7.39',
        status: 'current',
        payload: {},
        observedAt: '2026-07-21T12:00:00.000Z',
      },
    ]);
    expect(again?.dataSnapshotHash).toBeTruthy();
  });

  it('builds LoL and Valorant fixtures with immutable snapshot hashes', () => {
    const lol = buildLolFixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    const valorant = buildValorantFixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    expect(lol.game).toBe('lol');
    expect(lol.players.length).toBe(10);
    expect(lol.dataSnapshotHash.startsWith('sha256:')).toBe(true);
    expect(valorant.game).toBe('valorant');
    expect(valorant.mapPool.length).toBeGreaterThan(0);
    expect(valorant.dataSnapshotHash.startsWith('sha256:')).toBe(true);
  });
});
