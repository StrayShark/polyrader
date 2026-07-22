import { describe, expect, it, vi } from 'vitest';
import type { EsportsGame, EsportsSourceSnapshot, EsportsSourceSyncResult } from '@polyrader/core';
import { EsportsSourceService } from '../services/esports-source-service';

function dependencies(options: { riotConfigured?: boolean } = {}) {
  const stored: EsportsSourceSnapshot[] = [];
  const runs: EsportsSourceSyncResult[] = [];
  return {
    stored,
    runs,
    deps: {
      repo: {
        upsertSnapshots: vi.fn((snapshots: EsportsSourceSnapshot[]) => { stored.push(...snapshots); return snapshots.length; }),
        recordSyncRun: vi.fn((result: EsportsSourceSyncResult) => { runs.push(result); }),
        getLatestSyncRun: vi.fn(() => null),
        listSnapshots: vi.fn(() => stored),
      },
      grid: {
        isConfiguredForGame: vi.fn(() => false),
        getUpcomingSeriesForGame: vi.fn(async () => []),
      },
      openDota: {
        getRecentProMatches: vi.fn(async () => [{
          matchId: 'dota-1', duration: 2400, startTime: '2026-07-21T00:00:00Z',
          radiantTeamId: 'a', radiantTeamName: 'Radiant', direTeamId: 'b', direTeamName: 'Dire',
          radiantWin: true, leagueId: 'league', leagueName: 'League',
        }]),
        getTeams: vi.fn(async () => [{
          teamId: 'a', name: 'Radiant', tag: 'RAD', rating: 1500,
          wins: 10, losses: 4, lastMatchTime: '2026-07-21T00:00:00Z', logoUrl: '',
        }]),
        getProPlayers: vi.fn(async () => [{
          accountId: 'player-1', steamId: 'steam-1', nickname: 'Carry', realName: '',
          countryCode: 'CN', teamId: 'a', teamName: 'Radiant', teamTag: 'RAD',
          lastMatchTime: '2026-07-21T00:00:00Z',
        }]),
      },
      riot: {
        isConfigured: vi.fn(() => options.riotConfigured ?? false),
        getLatestLolPatch: vi.fn(async () => ({ version: '16.14.1', sourceUrl: 'https://ddragon.test/champion.json' })),
        getValorantContent: vi.fn(async () => ({ version: 'v1', characters: [], maps: [], acts: [], raw: {} })),
      },
      liquipediaFactory: vi.fn((_game: EsportsGame) => ({
        searchTeams: vi.fn(async () => [{
          pageId: 1,
          title: 'Team Liquid',
          canonicalName: 'Team Liquid',
          sourceId: 'Team Liquid',
          sourceUrl: 'https://liquipedia.net/example/Team_Liquid',
          confidence: 1,
        }]),
        getCurrentRoster: vi.fn(async (title: string) => ({
          teamTitle: title,
          sourceId: title,
          sourceUrl: `https://liquipedia.net/example/${title.replace(/ /g, '_')}`,
          players: [{
            playerId: 'player-1', name: 'Player One', nickname: 'p1', rating: 1,
            kdRatio: 1, headshotPercent: 0, mapsPlayed: 0, role: 'Rifler' as const,
          }],
          fetchedAt: '2026-07-21T00:00:00Z',
          rawLength: 100,
        })),
      })),
      now: () => new Date('2026-07-21T00:00:00Z'),
    },
  };
}

describe('EsportsSourceService', () => {
  it('syncs public LoL patch data while GRID remains optional', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('lol');

    expect(result.status).toBe('success');
    expect(result.records).toBe(1);
    expect(fixture.stored[0]).toMatchObject({ game: 'lol', source: 'riot-data-dragon', entityType: 'patch' });
    expect(result.sources).toContainEqual(expect.objectContaining({ source: 'grid', status: 'skipped' }));
  });

  it('syncs OpenDota professional history into Dota snapshots', async () => {
    const fixture = dependencies();
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('dota2');

    expect(result.records).toBe(3);
    expect(fixture.stored[0]).toMatchObject({ game: 'dota2', source: 'opendota', externalId: 'dota-1' });
    expect(fixture.stored.map((item) => item.entityType)).toEqual(['match', 'team', 'player']);
  });

  it('returns a partial VALORANT sync instead of failing when keys are missing', async () => {
    const fixture = dependencies({ riotConfigured: false });
    const service = new EsportsSourceService(fixture.deps);

    const result = await service.syncGame('valorant');

    expect(result.status).toBe('partial');
    expect(result.records).toBe(0);
    expect(result.sources).toContainEqual(expect.objectContaining({ source: 'riot', status: 'skipped' }));
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
      game: 'lol', source: 'liquipedia', entityType: 'team', externalId: 'T1',
    });
    expect(fixture.stored[0].payload.players).toHaveLength(1);
  });
});
