import { describe, expect, it, vi } from 'vitest';
import type { Lineup, Team } from '@polyrader/core';
import { SourceAlignmentService } from '../services/source-alignment-service';

function lineup(prefix: string): Lineup {
  return {
    players: Array.from({ length: 5 }, (_value, index) => ({
      playerId: `${prefix}${index}`,
      nickname: `${prefix.toUpperCase()}${index}`,
      rating: 1 + index / 100,
      role: 'Rifler' as const,
      isStandin: false,
      impactScore: 80 + index,
      mapsOnRecord: 0,
    })),
    isConfirmed: true,
    hasStandin: false,
    standinCount: 0,
    missingKeyPlayers: [],
  };
}

function team(teamId: string, name: string, rank: number, prefix: string): Team {
  return {
    teamId,
    name,
    logo: '',
    rank,
    region: '',
    players: Array.from({ length: 5 }, (_value, index) => ({
      playerId: `${prefix}${index}`,
      name: `Player ${index}`,
      nickname: `${prefix.toUpperCase()}${index}`,
      rating: 0,
      kdRatio: 0,
      headshotPercent: 0,
      mapsPlayed: 0,
      role: '',
    })),
    recentForm: {
      last10Matches: [{ opponent: 'Opponent', result: 'win', score: '2-0', date: '2026-07-01T00:00:00.000Z', event: 'Event' }],
      winRate: 1,
      streak: 1,
      averageRating: 0,
    },
    mapPool: { maps: [{ map: 'Nuke', winRate: 0.6, matchesPlayed: 5, roundsWon: 0, roundsLost: 0 }] },
    headToHead: [],
  };
}

describe('SourceAlignmentService HLTV analysis enrichment', () => {
  it('replaces placeholder IDs and persists complete normalized inputs', async () => {
    const teamALineup = lineup('a');
    const teamBLineup = lineup('b');
    const hltv = {
      getMatches: vi.fn().mockResolvedValue([{
        matchId: '2395534', teamAId: '4869', teamBId: '13214', teamAName: 'ENCE', teamBName: 'SPARTA',
        event: 'European Pro League', eventType: 'Online', format: 'BO3', date: '2026-07-14T08:00:00.000Z', stars: 0,
        url: 'https://www.hltv.org/matches/2395534/ence-vs-sparta-event',
      }]),
      getMatchDetail: vi.fn().mockResolvedValue({
        matchId: '2395534', teamA: 'ENCE', teamB: 'SPARTA', maps: [], format: 'BO3', event: 'European Pro League',
        date: '2026-07-14T08:00:00.000Z', teamAId: '4869', teamBId: '13214', teamARank: 163, teamBRank: 103,
        url: 'https://www.hltv.org/matches/2395534/ence-vs-sparta-event', lineups: { teamA: teamALineup, teamB: teamBLineup },
      }),
      getTeam: vi.fn().mockImplementation((id: string) => Promise.resolve(
        id === '4869' ? team('4869', 'ENCE', 163, 'a') : team('13214', 'SPARTA', 103, 'b'),
      )),
    };
    const llmRepo = {
      upsertTeam: vi.fn(),
      upsertMatch: vi.fn(),
      updateMatchLineups: vi.fn(),
    };
    const esportsRepo = {
      upsertPlayer: vi.fn(),
      upsertTeamRoster: vi.fn().mockReturnValue('roster-hash'),
      upsertRosterSourceSnapshot: vi.fn(),
      upsertTeamMatchHistory: vi.fn(),
      upsertMapPool: vi.fn(),
      upsertTeamSourceLink: vi.fn(),
      upsertMatchLineup: vi.fn(),
      upsertMatchSourceLink: vi.fn(),
    };
    const service = new SourceAlignmentService({
      hltv: hltv as never,
      llmRepo: llmRepo as never,
      esportsRepo: esportsRepo as never,
    });

    const result = await service.enrichHltvMatchForAnalysis({
      match_id: 'local-hltv-2395534',
      hltv_match_id: '2395534',
      team_a_id: 'local-team-a-ence',
      team_b_id: 'local-team-b-sparta',
      status: 'scheduled',
    });

    expect(result).toMatchObject({
      refreshed: true,
      teamAId: '4869',
      teamBId: '13214',
      teamAPlayers: 5,
      teamBPlayers: 5,
      lineupsConfirmed: true,
    });
    expect(llmRepo.upsertMatch).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'local-hltv-2395534',
      teamAId: '4869',
      teamBId: '13214',
      hasTeamData: true,
      hltvMatchId: '2395534',
    }));
    expect(llmRepo.upsertTeam).toHaveBeenCalledTimes(2);
    expect(esportsRepo.upsertPlayer).toHaveBeenCalledTimes(10);
    expect(esportsRepo.upsertTeamMatchHistory).toHaveBeenCalledTimes(2);
    expect(esportsRepo.upsertMapPool).toHaveBeenCalledTimes(2);
    expect(esportsRepo.upsertMatchLineup).toHaveBeenCalledOnce();
    expect(esportsRepo.upsertMatchSourceLink).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: '2395534',
      sourceUrl: 'https://www.hltv.org/matches/2395534/ence-vs-sparta-event',
    }));
  });

  it('persists discovered matches and proactively enriches the nearest match', async () => {
    const teamALineup = lineup('a');
    const teamBLineup = lineup('b');
    const summary = {
      matchId: '2396000', teamAId: '100', teamBId: '200', teamAName: 'Alpha', teamBName: 'Beta',
      event: 'Test Cup', eventType: 'Online' as const, format: 'BO3' as const,
      date: '2026-07-15T08:00:00.000Z', stars: 2,
      url: 'https://www.hltv.org/matches/2396000/alpha-vs-beta-test-cup',
    };
    const hltv = {
      getMatches: vi.fn().mockResolvedValue([summary]),
      getMatchDetail: vi.fn().mockResolvedValue({
        matchId: summary.matchId, teamA: 'Alpha', teamB: 'Beta', maps: ['Nuke'], format: 'BO3', event: 'Test Cup',
        date: summary.date, teamAId: '100', teamBId: '200', teamARank: 10, teamBRank: 20,
        url: summary.url, lineups: { teamA: teamALineup, teamB: teamBLineup },
      }),
      getTeam: vi.fn().mockImplementation((id: string) => Promise.resolve(
        id === '100' ? team('100', 'Alpha', 10, 'a') : team('200', 'Beta', 20, 'b'),
      )),
      getMatchLineups: vi.fn(),
    };
    const storedMatches = new Map<string, Record<string, unknown>>();
    const llmRepo = {
      getMatch: vi.fn((id: string) => storedMatches.get(id) ?? null),
      getTeam: vi.fn().mockReturnValue(null),
      upsertTeam: vi.fn(),
      upsertMatch: vi.fn((input: Record<string, unknown>) => {
        storedMatches.set(String(input.matchId), {
          ...storedMatches.get(String(input.matchId)),
          ...input,
          match_id: input.matchId,
          hltv_match_id: input.hltvMatchId,
          team_a_id: input.teamAId,
          team_b_id: input.teamBId,
          status: input.status,
          maps: input.maps,
          lineups: input.lineups,
        });
      }),
      updateMatchLineups: vi.fn(),
    };
    const esportsRepo = {
      upsertPlayer: vi.fn(), upsertTeamRoster: vi.fn().mockReturnValue('hash'), upsertRosterSourceSnapshot: vi.fn(),
      upsertTeamMatchHistory: vi.fn(), upsertMapPool: vi.fn(), upsertTeamSourceLink: vi.fn(),
      upsertMatchLineup: vi.fn(), upsertMatchSourceLink: vi.fn(),
    };
    const service = new SourceAlignmentService({
      hltv: hltv as never,
      llmRepo: llmRepo as never,
      esportsRepo: esportsRepo as never,
    });

    const result = await service.syncDiscoveredHltvMatches([summary], { limit: 1, teamTtlHours: 6 });

    expect(result).toMatchObject({ discovered: 1, enriched: 1, failed: 0 });
    expect(hltv.getMatchDetail).toHaveBeenCalledWith(summary.matchId, summary.url);
    expect(hltv.getTeam).toHaveBeenCalledTimes(2);
    expect(llmRepo.upsertMatch).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'local-hltv-2396000',
      teamAId: '100',
      teamBId: '200',
      hasTeamData: true,
    }));
  });
});
