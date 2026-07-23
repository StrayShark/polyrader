import { describe, expect, it, vi } from 'vitest';
import type {
  EsportsGame,
  EsportsMatchSourceIdentity,
  EsportsSourceSnapshot,
  EsportsSourceSyncResult,
  EsportsTeamAlias,
} from '@polyrader/core';
import type { OpenDotaTeamMatch, OpenDotaTeamPlayer } from '@polyrader/infra';
import { EsportsSourceService } from '../services/esports-source-service';

function dependencies(
  options: {
    riotConfigured?: boolean;
    gridConfigured?: boolean;
    liquipediaScheduleConfigured?: boolean;
    liquipediaPublicFails?: boolean;
    liquipediaPublicEmpty?: boolean;
    liquipediaRosterFails?: boolean;
    latestSync?: EsportsSourceSyncResult | null;
  } = {},
) {
  const stored: EsportsSourceSnapshot[] = [];
  const identities: EsportsMatchSourceIdentity[] = [];
  const runs: EsportsSourceSyncResult[] = [];
  return {
    stored,
    identities,
    runs,
    deps: {
      repo: {
        upsertSnapshots: vi.fn((snapshots: EsportsSourceSnapshot[]) => {
          stored.push(...snapshots);
          return snapshots.length;
        }),
        recordSyncRun: vi.fn((result: EsportsSourceSyncResult) => {
          runs.push(result);
        }),
        getLatestSyncRun: vi.fn(() => options.latestSync ?? null),
        listSnapshots: vi.fn(() => stored),
        upsertMatchIdentities: vi.fn((rows: EsportsMatchSourceIdentity[]) => {
          identities.push(...rows);
          return rows.length;
        }),
        listMatchIdentities: vi.fn(() => identities),
        countMatchIdentities: vi.fn(() => identities.length),
      },
      grid: {
        isConfiguredForGame: vi.fn(() => options.gridConfigured ?? false),
        getUpcomingSeriesForGame: vi.fn(async () => [
          {
            seriesId: 'grid-series-1',
            teamAId: 't1',
            teamBId: 'hle',
            teamAName: 'T1',
            teamBName: 'Hanwha Life Esports',
            date: '2026-07-22T12:00:00.000Z',
            eventName: 'LCK',
            format: 'BO3',
          },
        ]),
        getTeamRosterForGame: vi.fn(async (_game: EsportsGame, teamId: string) =>
          Array.from({ length: 5 }, (_, index) => ({
            playerId: `${teamId}-p${index + 1}`,
            nickname: `${teamId}-${index + 1}`,
            name: `${teamId}-${index + 1}`,
          })),
        ),
      },
      openDota: {
        getRecentProMatches: vi.fn(async () => [
          {
            matchId: 'dota-1',
            duration: 2400,
            startTime: '2026-07-21T00:00:00Z',
            radiantTeamId: 'a',
            radiantTeamName: 'Radiant',
            direTeamId: 'b',
            direTeamName: 'Dire',
            radiantWin: true,
            leagueId: 'league',
            leagueName: 'League',
          },
        ]),
        getTeams: vi.fn(async () => [
          {
            teamId: 'a',
            name: 'Radiant',
            tag: 'RAD',
            rating: 1500,
            wins: 10,
            losses: 4,
            lastMatchTime: '2026-07-21T00:00:00Z',
            logoUrl: '',
          },
        ]),
        getProPlayers: vi.fn(async () => [
          {
            accountId: 'player-1',
            steamId: 'steam-1',
            nickname: 'Carry',
            realName: '',
            countryCode: 'CN',
            teamId: 'a',
            teamName: 'Radiant',
            teamTag: 'RAD',
            lastMatchTime: '2026-07-21T00:00:00Z',
          },
        ]),
        getTeamPlayers: vi.fn(
          async (_teamId: string, _limit?: number): Promise<OpenDotaTeamPlayer[]> => [],
        ),
        getTeamMatches: vi.fn(
          async (_teamId: string, _limit?: number): Promise<OpenDotaTeamMatch[]> => [],
        ),
        getMatchDetails: vi.fn(async () => ({
          matchId: 'dota-1',
          duration: 2400,
          startTime: '2026-07-21T00:00:00Z',
          radiantTeamId: 'a',
          radiantTeamName: 'Radiant',
          direTeamId: 'b',
          direTeamName: 'Dire',
          radiantWin: true,
          patchId: 59,
          picksBans: [{ isPick: true, heroId: 1, team: 0 as const, order: 0 }],
          players: [
            {
              accountId: 'player-1',
              playerSlot: 0,
              nickname: 'Carry',
              realName: '',
              heroId: 1,
              kills: 10,
              deaths: 2,
              assists: 8,
              goldPerMinute: 650,
              xpPerMinute: 700,
            },
          ],
        })),
        getPatches: vi.fn(async () => [
          { id: 59, name: '7.40c', date: '2026-02-10T00:00:00.000Z' },
          { id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' },
        ]),
      },
      riot: {
        isConfigured: vi.fn(() => options.riotConfigured ?? false),
        getLatestLolPatch: vi.fn(async () => ({
          version: '16.14.1',
          sourceUrl: 'https://ddragon.test/champion.json',
        })),
      },
      valorantApi: {
        getContent: vi.fn(async () => ({
          version: 'v1',
          manifestId: 'manifest-1',
          characters: [{ id: 'agent' }],
          maps: [{ id: 'map' }],
          sourceUrl: 'https://valorant-api.test',
        })),
      },
      liquipediaFactory: vi.fn((_game: EsportsGame) => ({
        isMatchScheduleConfigured: vi.fn(() => options.liquipediaScheduleConfigured ?? false),
        getUpcomingMatches: vi.fn(async () => [
          {
            matchId: 'liquipedia-series-1',
            teamAId: 'liquid',
            teamBId: 'falcons',
            teamAName: 'Team Liquid',
            teamBName: 'Team Falcons',
            date: '2026-07-22T12:00:00.000Z',
            eventId: 'riyadh-masters',
            eventName: 'Riyadh Masters',
            format: 'BO3' as const,
          },
        ]),
        getPublicUpcomingMatches: vi.fn(async () => {
          if (options.liquipediaPublicFails) throw new Error('Liquipedia public API HTTP 503');
          if (options.liquipediaPublicEmpty) return [];
          return [
            {
              matchId: 'liquipedia-series-1',
              teamAId: 'Team Liquid',
              teamBId: 'Team Falcons',
              teamAName: 'Team Liquid',
              teamBName: 'Team Falcons',
              date: '2026-07-22T12:00:00.000Z',
              eventId: 'riyadh-masters',
              eventName: 'Riyadh Masters',
              format: 'BO3' as const,
            },
          ];
        }),
        getPublicRecentMatches: vi.fn(async () => []),
        searchTeams: vi.fn(async () => [
          {
            pageId: 1,
            title: 'Team Liquid',
            canonicalName: 'Team Liquid',
            sourceId: 'Team Liquid',
            sourceUrl: 'https://liquipedia.net/example/Team_Liquid',
            confidence: 1,
          },
        ]),
        getCurrentRoster: vi.fn(async (title: string) => ({
          ...(options.liquipediaRosterFails
            ? await Promise.reject(new Error('roster unavailable'))
            : {}),
          teamTitle: title,
          sourceId: title,
          sourceUrl: `https://liquipedia.net/example/${title.replace(/ /g, '_')}`,
          players: [
            {
              playerId: 'player-1',
              name: 'Player One',
              nickname: 'p1',
              rating: 1,
              kdRatio: 1,
              headshotPercent: 0,
              mapsPlayed: 0,
              role: 'Rifler' as const,
            },
          ],
          fetchedAt: '2026-07-21T00:00:00Z',
          rawLength: 100,
        })),
      })),
      legacyCs2: {
        getUpcomingMatches: vi.fn(() => [
          {
            match_id: 'local-hltv-2396005',
            hltv_match_id: '2396005',
            team_a_id: '8474',
            team_b_id: '11283',
            team_a_name: '100 Thieves',
            team_b_name: 'Falcons',
            event_name: 'Test Event',
            format: 'BO3',
            scheduled_at: '2026-07-22T17:30:00.000Z',
            status: 'scheduled',
            updated_at: '2026-07-21 23:59:30',
          },
        ]),
        getTeam: vi.fn(() => null),
      },
      now: () => new Date('2026-07-21T00:00:00Z'),
    },
  };
}

describe('EsportsSourceService', () => {
  it('enriches legacy Dota alias candidates from persisted OpenDota team snapshots', () => {
    const fixture = dependencies();
    fixture.stored.push({
      game: 'dota2',
      source: 'opendota',
      entityType: 'team',
      externalId: '2163',
      name: 'Team Liquid',
      payload: { tag: 'Liquid' },
      observedAt: '2026-07-23T08:00:00.000Z',
    });
    const legacyAlias: EsportsTeamAlias = {
      game: 'dota2',
      source: 'liquipedia',
      sourceTeamId: 'Team_Liquid',
      alias: 'Liquid',
      normalizedAlias: 'liquid',
      targetSource: 'opendota',
      status: 'conflict',
      method: 'token_overlap',
      confidence: 0.84,
      candidateTeamIds: ['2163', '9999'],
      evidence: {},
      observedAt: '2026-07-23T08:00:00.000Z',
    };
    Object.assign(fixture.deps.repo, {
      listTeamAliases: vi.fn(() => [legacyAlias]),
    });

    const aliases = new EsportsSourceService(fixture.deps).listTeamAliases('dota2');

    expect(aliases[0]?.evidence.candidateTeams).toEqual([
      {
        teamId: '2163',
        name: 'Team Liquid',
        tag: 'Liquid',
        sourceUrl: 'https://www.opendota.com/teams/2163',
      },
      {
        teamId: '9999',
        name: '9999',
        tag: '',
        sourceUrl: 'https://www.opendota.com/teams/9999',
      },
    ]);
  });

  it('syncs public LoL patch data while GRID remains optional', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('lol');

    expect(result.status).toBe('success');
    expect(result.records).toBe(4);
    expect(fixture.stored).toContainEqual(
      expect.objectContaining({
        game: 'lol',
        source: 'riot-data-dragon',
        entityType: 'patch',
      }),
    );
    expect(result.sources).toContainEqual(
      expect.objectContaining({ source: 'grid', status: 'skipped' }),
    );
  });

  it.each(['lol', 'valorant'] as const)(
    'syncs a %s GRID future match and bounded team rosters',
    async (game) => {
      const fixture = dependencies({ gridConfigured: true, riotConfigured: true });
      const service = new EsportsSourceService(fixture.deps);

      const result = await service.syncGame(game);

      expect(result.sources).toContainEqual(
        expect.objectContaining({ source: 'grid', status: 'success', records: 3 }),
      );
      expect(fixture.stored).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ game, entityType: 'match', externalId: 'grid-series-1' }),
          expect.objectContaining({ game, entityType: 'team', externalId: 't1' }),
          expect.objectContaining({ game, entityType: 'team', externalId: 'hle' }),
        ]),
      );
    },
  );

  it('reports an explicit blocker when GRID has no future LoL series', async () => {
    const fixture = dependencies({ gridConfigured: true });
    fixture.deps.grid.getUpcomingSeriesForGame.mockResolvedValueOnce([]);
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('lol');

    expect(result.sources).toContainEqual({
      source: 'grid',
      status: 'success',
      records: 0,
      message: 'No upcoming GRID lol series are available for this account',
    });
  });

  it.each(['lol', 'dota2', 'valorant'] as const)(
    'keeps %s partial when only static or historical data is available',
    async (game) => {
      const fixture = dependencies({ liquipediaPublicEmpty: true });

      const result = await new EsportsSourceService(fixture.deps).syncGame(game);

      expect(result.status).toBe('partial');
      expect(result.sources).toContainEqual(
        expect.objectContaining({
          source: 'liquipedia',
          status: 'success',
          records: 0,
        }),
      );
    },
  );

  it('keeps a public schedule when targeted roster enrichment fails', async () => {
    const fixture = dependencies({ liquipediaRosterFails: true });

    const result = await new EsportsSourceService(fixture.deps).syncGame('lol');

    expect(result.status).toBe('success');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        source: 'liquipedia',
        status: 'success',
        records: 1,
      }),
    );
  });

  it('reports a public schedule failure when no licensed fallback is configured', async () => {
    const fixture = dependencies({ liquipediaPublicFails: true });

    const result = await new EsportsSourceService(fixture.deps).syncGame('lol');

    expect(result.status).toBe('partial');
    expect(result.sources).toContainEqual({
      source: 'liquipedia',
      status: 'failed',
      records: 0,
      message: 'Liquipedia public API HTTP 503',
    });
  });

  it('syncs OpenDota professional history into Dota snapshots', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('dota2');

    expect(result.records).toBe(8);
    expect(result.status).toBe('success');
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        source: 'liquipedia',
        status: 'success',
      }),
    );
    expect(fixture.stored).toContainEqual(
      expect.objectContaining({
        game: 'dota2',
        source: 'opendota',
        externalId: 'dota-1',
        payload: expect.objectContaining({ patchId: 59, radiantWin: true }),
      }),
    );
    expect(
      fixture.stored.filter((item) => item.source === 'opendota').map((item) => item.entityType),
    ).toEqual(['match', 'team', 'player', 'patch', 'patch']);
    expect(fixture.identities).toContainEqual(
      expect.objectContaining({
        canonicalMatchId: 'dota2:game:opendota:dota-1',
        scope: 'game',
        source: 'opendota',
      }),
    );
  });

  it('targets OpenDota details to resolved future-series teams and persists enrichment', async () => {
    const fixture = dependencies();
    fixture.deps.openDota.getTeams.mockResolvedValueOnce([
      {
        teamId: '2163',
        name: 'Team Liquid',
        tag: 'Liquid',
        rating: 1542,
        wins: 28,
        losses: 12,
        lastMatchTime: '2026-07-20T00:00:00Z',
        logoUrl: '',
      },
      {
        teamId: '9247354',
        name: 'Team Falcons',
        tag: 'FLCN',
        rating: 1510,
        wins: 24,
        losses: 15,
        lastMatchTime: '2026-07-20T00:00:00Z',
        logoUrl: '',
      },
    ]);
    fixture.deps.openDota.getRecentProMatches.mockResolvedValueOnce([
      {
        matchId: 'target-match',
        duration: 2400,
        startTime: '2026-07-20T00:00:00Z',
        radiantTeamId: '2163',
        radiantTeamName: 'Team Liquid',
        direTeamId: '9247354',
        direTeamName: 'Team Falcons',
        radiantWin: true,
        leagueId: 'riyadh',
        leagueName: 'Riyadh Masters',
      },
      {
        matchId: 'unrelated-match',
        duration: 2300,
        startTime: '2026-07-19T00:00:00Z',
        radiantTeamId: 'other-a',
        radiantTeamName: 'Other A',
        direTeamId: 'other-b',
        direTeamName: 'Other B',
        radiantWin: false,
        leagueId: 'other',
        leagueName: 'Other League',
      },
    ]);
    fixture.deps.openDota.getProPlayers.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, index) => ({
        accountId: `player-${index + 1}`,
        steamId: `steam-${index + 1}`,
        nickname: `Player ${index + 1}`,
        realName: '',
        countryCode: 'EU',
        teamId: index < 5 ? '2163' : '9247354',
        teamName: index < 5 ? 'Team Liquid' : 'Team Falcons',
        teamTag: index < 5 ? 'Liquid' : 'FLCN',
        lastMatchTime: '2026-07-20T00:00:00Z',
      })),
    );
    fixture.deps.openDota.getTeamPlayers.mockImplementationOnce(async () =>
      Array.from({ length: 5 }, (_, index) => ({
        accountId: `player-${index + 1}`,
        name: `Player ${index + 1}`,
        gamesPlayed: 20,
        wins: 12,
        isCurrentTeamMember: true,
      })),
    );
    fixture.deps.openDota.getTeamPlayers.mockImplementationOnce(async () =>
      Array.from({ length: 5 }, (_, index) => ({
        accountId: `player-${index + 6}`,
        name: `Player ${index + 6}`,
        gamesPlayed: 20,
        wins: 10,
        isCurrentTeamMember: true,
      })),
    );
    fixture.deps.openDota.getTeamMatches.mockImplementation(async (teamId: string) => [
      {
        matchId: 'target-match',
        duration: 2400,
        startTime: '2026-07-20T00:00:00Z',
        radiant: teamId === '2163',
        radiantWin: true,
        leagueId: 'riyadh',
        leagueName: 'Riyadh Masters',
        opposingTeamId: teamId === '2163' ? '9247354' : '2163',
        opposingTeamName: teamId === '2163' ? 'Team Falcons' : 'Team Liquid',
      },
    ]);
    fixture.deps.openDota.getMatchDetails.mockResolvedValueOnce({
      matchId: 'target-match',
      duration: 2400,
      startTime: '2026-07-20T00:00:00Z',
      radiantTeamId: '2163',
      radiantTeamName: 'Team Liquid',
      direTeamId: '9247354',
      direTeamName: 'Team Falcons',
      radiantWin: true,
      patchId: 60,
      picksBans: [],
      players: Array.from({ length: 10 }, (_, index) => ({
        accountId: `player-${index + 1}`,
        playerSlot: index < 5 ? index : 128 + index - 5,
        nickname: `Player ${index + 1}`,
        realName: '',
        heroId: index + 1,
        kills: 5 + index,
        deaths: 3,
        assists: 9,
        goldPerMinute: 500 + index,
        xpPerMinute: 600 + index,
      })),
    });

    await new EsportsSourceService(fixture.deps).syncGame('dota2');

    expect(fixture.deps.openDota.getMatchDetails).toHaveBeenCalledTimes(1);
    expect(fixture.deps.openDota.getMatchDetails).toHaveBeenCalledWith('target-match');
    expect(fixture.deps.openDota.getTeamPlayers).toHaveBeenCalledTimes(2);
    expect(fixture.deps.openDota.getTeamMatches).toHaveBeenCalledTimes(2);
    expect(fixture.stored).toContainEqual(
      expect.objectContaining({
        source: 'liquipedia',
        externalId: 'liquipedia-series-1',
        payload: expect.objectContaining({
          teamAOpenDotaId: '2163',
          teamBOpenDotaId: '9247354',
        }),
      }),
    );
    expect(fixture.stored).toContainEqual(
      expect.objectContaining({
        source: 'opendota',
        entityType: 'team',
        externalId: '2163',
        payload: expect.objectContaining({
          form: expect.objectContaining({ sampleSize: 1, winRate: 1 }),
          roster: expect.arrayContaining([expect.objectContaining({ accountId: 'player-1' })]),
          heroPool: expect.arrayContaining([expect.objectContaining({ heroId: 1 })]),
          playerMetrics: expect.arrayContaining([
            expect.objectContaining({ accountId: 'player-1' }),
          ]),
          targetEnrichment: expect.objectContaining({
            selected: true,
            rosterFetched: 5,
            matchesFetched: 1,
            detailSampleSize: 1,
            errors: [],
          }),
        }),
      }),
    );
  });

  it('uses the licensed Liquipedia DB fallback only when the public API fails', async () => {
    const fixture = dependencies({
      liquipediaScheduleConfigured: true,
      liquipediaPublicFails: true,
    });
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('dota2');

    expect(result.status).toBe('success');
    expect(result.sources).toContainEqual(
      expect.objectContaining({ source: 'liquipedia', status: 'success', records: 1 }),
    );
    expect(fixture.stored).toContainEqual(
      expect.objectContaining({
        source: 'liquipedia',
        entityType: 'match',
        status: 'scheduled',
        externalId: 'liquipedia-series-1',
      }),
    );
    expect(fixture.identities).toContainEqual(
      expect.objectContaining({
        source: 'liquipedia',
        scope: 'series',
        canonicalMatchId: 'dota2:series:202607221200:team-falcons:team-liquid',
      }),
    );
  });

  it('reports GRID credential access separately from Dota schedule availability', () => {
    const latestSync: EsportsSourceSyncResult = {
      game: 'dota2',
      status: 'partial',
      records: 5,
      sources: [
        {
          source: 'grid',
          status: 'failed',
          records: 0,
          message: 'GRID title dota2 is not available to this account',
        },
        { source: 'opendota', status: 'success', records: 5 },
      ],
      startedAt: '2026-07-21T00:00:00Z',
      finishedAt: '2026-07-21T00:00:01Z',
    };
    const fixture = dependencies({ gridConfigured: true, latestSync });

    const dota = new EsportsSourceService(fixture.deps)
      .getCatalog()
      .find((entry) => entry.game === 'dota2');
    const grid = dota?.sources.find((source) => source.source === 'grid');

    expect(grid).toMatchObject({
      configured: true,
      state: 'error',
      readiness: 'key_configured',
      note: 'GRID title dota2 is not available to this account',
    });
  });

  it('treats SQLite CS2 update timestamps as UTC at the snapshot boundary', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    await service.syncGame('cs2');

    expect(fixture.stored[0]).toMatchObject({
      game: 'cs2',
      externalId: '2396005',
      observedAt: '2026-07-21T23:59:30.000Z',
    });
  });

  it('syncs public VALORANT content and schedule without a Riot key', async () => {
    const fixture = dependencies({ riotConfigured: false });
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('valorant');

    expect(result.status).toBe('success');
    expect(result.records).toBe(4);
    expect(result.sources).toContainEqual(
      expect.objectContaining({ source: 'riot', status: 'skipped' }),
    );
    expect(result.sources).toContainEqual(
      expect.objectContaining({ source: 'valorant-api', status: 'success', records: 1 }),
    );
  });

  it('routes team search to the selected Liquipedia game wiki', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    await service.searchLiquipediaTeams('valorant', 'Team Liquid');

    expect(fixture.deps.liquipediaFactory).toHaveBeenCalledWith('valorant');
  });

  it('stores a Liquipedia roster snapshot for the selected game', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    const roster = await service.syncLiquipediaRoster('lol', 'T1');

    expect(roster.teamTitle).toBe('T1');
    expect(fixture.stored[0]).toMatchObject({
      game: 'lol',
      source: 'liquipedia',
      entityType: 'team',
      externalId: 'T1',
    });
    expect(fixture.stored[0].payload.players).toHaveLength(1);
  });
});
