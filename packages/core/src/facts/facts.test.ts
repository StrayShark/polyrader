import { describe, expect, it } from 'vitest';
import {
  buildCs2FixtureFacts,
  buildDota2FixtureFacts,
  buildBoardValidationSummary,
  buildLolFixtureFacts,
  buildValorantFixtureFacts,
  normalizeCs2MatchFacts,
  normalizeDota2MatchFacts,
  resolveDotaSeriesIdentity,
  resolveDotaTeamIdentity,
  normalizeValorantMatchFacts,
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
  it('resolves Dota team aliases while preserving ambiguous candidates', () => {
    const candidates = [
      { teamId: '2163', name: 'Team Liquid', tag: 'Liquid' },
      { teamId: '9247354', name: 'Team Falcons', tag: 'FLCN' },
    ];
    expect(resolveDotaTeamIdentity({ name: 'Liquid' }, candidates)).toMatchObject({
      status: 'matched',
      teamId: '2163',
    });
    expect(resolveDotaTeamIdentity({ name: 'Team Falcons' }, candidates)).toMatchObject({
      status: 'matched',
      teamId: '9247354',
    });
    expect(
      resolveDotaTeamIdentity({ name: 'Liquid' }, [
        ...candidates,
        { teamId: 'other-liquid', name: 'Liquid Esports' },
      ]),
    ).toMatchObject({
      status: 'ambiguous',
      candidateIds: ['2163', 'other-liquid'],
    });
  });

  it('uses event context to disambiguate Dota series inside the time tolerance', () => {
    const resolution = resolveDotaSeriesIdentity(
      {
        teamAName: 'Team Liquid',
        teamBName: 'Team Falcons',
        startsAt: '2026-07-22T12:20:00.000Z',
        eventName: 'Riyadh Masters',
      },
      [
        {
          seriesId: 'riyadh-series',
          teamAName: 'Liquid',
          teamBName: 'Falcons',
          startsAt: '2026-07-22T12:00:00.000Z',
          eventName: 'Riyadh Masters',
        },
        {
          seriesId: 'other-series',
          teamAName: 'Team Liquid',
          teamBName: 'Team Falcons',
          startsAt: '2026-07-22T12:00:00.000Z',
          eventName: 'DreamLeague',
        },
      ],
    );
    expect(resolution).toMatchObject({ status: 'matched', seriesId: 'riyadh-series' });
  });

  it('builds a complete, fresh CS2 release fixture', () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    const facts = buildCs2FixtureFacts(now);

    expect(facts.adapterVersion).toBe('cs2.facts.v2');
    expect(facts.startsAt).toBe('2026-07-22T18:00:00.000Z');
    expect(facts.completeness).toBe(1);
    expect(facts.freshnessSeconds).toBe(0);
    expect(facts.players).toHaveLength(10);
    expect(facts.mapPool).toEqual(['Mirage', 'Nuke', 'Inferno']);
    expect(facts.missing).toEqual([]);
  });

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
        evidenceType: 'real',
        realMarketCount: 1,
        syntheticMarketCount: 0,
        lowLiquidityMarketIds: [],
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
    expect(facts.adapterVersion).toBe('dota2.facts.v3');
    expect(facts.format).toBe('BO1');
    expect(facts.completeness).toBe(1);
    expect(facts.players).toHaveLength(10);
    expect(facts.patchVersion).toBe('7.41');
    expect(facts.missing).toEqual([]);
    expect(facts.facts.map((fact) => fact.factId)).toEqual(
      expect.arrayContaining([
        'team-a-roster',
        'team-b-roster',
        'team-a-player-stats',
        'team-b-player-stats',
        'team-a-recent-form',
        'team-b-recent-form',
        'team-a-hero-pool',
        'team-b-hero-pool',
        'dota-data-quality',
        'draft-context',
      ]),
    );
    expect(facts.facts.find((fact) => fact.factId === 'dota-data-quality')?.value).toMatchObject({
      contractVersion: 'dota-quality.v1',
      bothTeamsComplete: true,
      bothTeamsFresh: true,
    });
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

  it('joins a Liquipedia future series to OpenDota ratings and roster payloads', () => {
    const observedAt = '2026-07-21T12:00:00.000Z';
    const team = (
      teamId: string,
      name: string,
      rating: number,
      heroOffset: number,
    ): SourceSnapshotLike => ({
      game: 'dota2',
      source: 'opendota',
      entityType: 'team',
      externalId: teamId,
      name,
      status: 'active',
      payload: {
        teamId,
        name,
        rating,
        form: { sampleSize: 5, wins: 3, losses: 2, winRate: 0.6 },
        recentMatches: [{ matchId: `${teamId}-recent`, result: 'win' }],
        heroPool: [{ heroId: heroOffset, matches: 3, wins: 2, winRate: 2 / 3 }],
        playerMetrics: Array.from({ length: 5 }, (_, index) => ({
          accountId: `${teamId}-p${index + 1}`,
          nickname: `${name} ${index + 1}`,
          matches: 3,
          kills: 8 - index * 0.5,
        })),
      },
      observedAt,
    });
    const roster = (teamId: string, name: string): SourceSnapshotLike => ({
      game: 'dota2',
      source: 'liquipedia',
      entityType: 'team',
      externalId: name,
      name,
      status: 'active',
      payload: {
        players: Array.from({ length: 5 }, (_, index) => ({
          playerId: `${teamId}-p${index + 1}`,
          nickname: `${name} ${index + 1}`,
          position: String(index + 1),
        })),
      },
      observedAt,
    });
    const facts = normalizeDota2MatchFacts(
      [
        {
          game: 'dota2',
          source: 'liquipedia',
          entityType: 'match',
          externalId: 'lp-series-1',
          name: 'Liquid vs Falcons',
          startsAt: '2026-07-22T12:00:00.000Z',
          status: 'scheduled',
          payload: {
            teamAId: 'Team Liquid',
            teamBId: 'Team Falcons',
            teamAName: 'Liquid',
            teamBName: 'Falcons',
            teamAOpenDotaId: '2163',
            teamBOpenDotaId: '9247354',
            teamAIdentity: { status: 'matched', score: 0.95 },
            teamBIdentity: { status: 'matched', score: 0.95 },
            eventName: 'Riyadh Masters',
            format: 'BO3',
          },
          observedAt,
        },
        {
          game: 'dota2',
          source: 'opendota',
          entityType: 'patch',
          externalId: '60',
          name: '7.41',
          status: 'current',
          payload: {},
          observedAt,
        },
        team('2163', 'Team Liquid', 1542, 1),
        team('9247354', 'Team Falcons', 1510, 6),
        roster('2163', 'Team Liquid'),
        roster('9247354', 'Team Falcons'),
      ],
      { now: new Date(observedAt) },
    );

    expect(facts).toMatchObject({
      adapterVersion: 'dota2.facts.v3',
      completeness: 1,
      participants: [
        expect.objectContaining({ participantId: '2163', rating: 1542 }),
        expect.objectContaining({ participantId: '9247354', rating: 1510 }),
      ],
    });
    expect(facts?.players).toHaveLength(10);
    expect(facts?.facts.find((fact) => fact.factId === 'team-a-roster')?.source).toBe('liquipedia');
    expect(facts?.facts.find((fact) => fact.factId === 'team-a-rating')?.source).toBe('opendota');
  });

  it('merges current Dota rosters by player identity and preserves mismatch evidence', () => {
    const observedAt = '2026-07-21T12:00:00.000Z';
    const players = (prefix: string) =>
      Array.from({ length: 5 }, (_, index) => ({
        accountId: `${prefix}-${index + 1}`,
        nickname: `${prefix} player ${index + 1}`,
        status: 'active',
      }));
    const match: SourceSnapshotLike = {
      game: 'dota2',
      source: 'liquipedia',
      entityType: 'match',
      externalId: 'merge-series',
      name: 'Liquid vs Falcons',
      startsAt: '2026-07-22T12:00:00.000Z',
      status: 'scheduled',
      payload: {
        teamAId: 'Liquid',
        teamBId: 'Falcons',
        teamAName: 'Liquid',
        teamBName: 'Falcons',
        teamAOpenDotaId: '2163',
        teamBOpenDotaId: '9247354',
        teamAIdentity: { status: 'matched', score: 0.98 },
        teamBIdentity: { status: 'matched', score: 0.98 },
        format: 'BO3',
      },
      observedAt,
    };
    const openDotaTeam = (id: string, name: string, prefix: string): SourceSnapshotLike => ({
      game: 'dota2',
      source: 'opendota',
      entityType: 'team',
      externalId: id,
      name,
      status: 'active',
      payload: { rating: 1500, roster: players(prefix) },
      observedAt,
    });
    const liquidPlayers = players('liquid');
    const liquipediaRoster: SourceSnapshotLike = {
      game: 'dota2',
      source: 'liquipedia',
      entityType: 'team',
      externalId: 'Liquid',
      name: 'Liquid',
      status: 'active',
      payload: { players: liquidPlayers.slice(0, 3) },
      observedAt,
    };
    const base = [
      match,
      {
        game: 'dota2',
        source: 'opendota',
        entityType: 'patch',
        externalId: '60',
        name: '7.41',
        status: 'current',
        payload: {},
        observedAt,
      } satisfies SourceSnapshotLike,
      openDotaTeam('2163', 'Team Liquid', 'liquid'),
      openDotaTeam('9247354', 'Team Falcons', 'falcons'),
    ];
    const merged = normalizeDota2MatchFacts([...base, liquipediaRoster], {
      now: new Date(observedAt),
    });
    const liquid = merged?.players.filter((player) => player.participantId === '2163') ?? [];

    expect(liquid).toHaveLength(5);
    expect(liquid.map((player) => player.source)).toEqual([
      'liquipedia',
      'liquipedia',
      'liquipedia',
      'opendota',
      'opendota',
    ]);
    expect(merged?.conflictFlags).not.toContain('roster_mismatch');

    const conflicted = normalizeDota2MatchFacts(
      [
        ...base,
        {
          ...liquipediaRoster,
          payload: {
            players: ['alpha', 'bravo', 'charlie'].map((nickname) => ({ nickname })),
          },
        },
      ],
      { now: new Date(observedAt) },
    );
    expect(conflicted?.conflictFlags).toContain('roster_mismatch');
  });

  it('builds LoL and Valorant fixtures with immutable snapshot hashes', () => {
    const now = new Date('2026-07-21T12:00:00.000Z');
    const lol = buildLolFixtureFacts(now);
    const valorant = buildValorantFixtureFacts(now);
    expect(lol.game).toBe('lol');
    expect(lol.players.length).toBe(10);
    expect(lol.adapterVersion).toBe('lol.facts.v2');
    expect(Date.parse(lol.startsAt)).toBeGreaterThan(now.getTime());
    expect(lol.dataSnapshotHash.startsWith('sha256:')).toBe(true);
    expect(valorant.game).toBe('valorant');
    expect(valorant.mapPool.length).toBeGreaterThan(0);
    expect(valorant.adapterVersion).toBe('valorant.facts.v2');
    expect(Date.parse(valorant.startsAt)).toBeGreaterThan(now.getTime());
    expect(valorant.dataSnapshotHash.startsWith('sha256:')).toBe(true);
  });

  it('uses Riot content maps when a Valorant schedule has no embedded map pool', () => {
    const observedAt = '2026-07-21T12:00:00.000Z';
    const facts = normalizeValorantMatchFacts([
      {
        game: 'valorant',
        source: 'grid',
        entityType: 'match',
        externalId: 'vct-grid-1',
        name: 'Alpha vs Bravo',
        startsAt: '2026-07-22T12:00:00.000Z',
        status: 'scheduled',
        payload: { teamAName: 'Alpha', teamBName: 'Bravo', teamAId: 'a', teamBId: 'b' },
        observedAt,
      },
      {
        game: 'valorant',
        source: 'riot',
        entityType: 'content',
        externalId: 'content-1',
        name: 'VALORANT current',
        payload: { maps: [{ name: 'Ascent' }, { localizedName: 'Bind' }] },
        observedAt,
      },
    ]);

    expect(facts?.mapPool).toEqual(['Ascent', 'Bind']);
    expect(facts?.missing).not.toContain('map_pool');
  });
});
