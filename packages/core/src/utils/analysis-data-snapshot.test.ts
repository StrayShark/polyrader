import { describe, expect, it } from 'vitest';
import type { MatchInfo, Team } from '../types/index';
import { buildAnalysisDataSnapshot } from './analysis-data-snapshot';

function team(teamId: string, rank: number): Team {
  return {
    teamId,
    name: teamId,
    logo: '',
    rank,
    region: 'EU',
    players: Array.from({ length: 5 }, (_value, index) => ({
      playerId: `${teamId}-${index}`,
      name: '',
      nickname: `P${index}`,
      rating: 1 + index / 100,
      kdRatio: 1,
      headshotPercent: 50,
      mapsPlayed: 20,
      role: 'Rifler',
    })),
    recentForm: {
      last10Matches: [{ opponent: 'Other', result: 'win', score: '2-0', date: '2026-07-18', event: 'Test' }],
      winRate: 1,
      streak: 1,
      averageRating: 1.02,
    },
    mapPool: { maps: [{ map: 'Mirage', winRate: 0.6, matchesPlayed: 5, roundsWon: 0, roundsLost: 0 }] },
    headToHead: [],
  };
}

function match(): MatchInfo {
  const players = Array.from({ length: 5 }, (_value, index) => ({
    playerId: `p-${index}`,
    nickname: `P${index}`,
    rating: 1,
    role: 'Rifler' as const,
    isStandin: false,
    impactScore: 80,
    mapsOnRecord: 20,
  }));
  return {
    matchId: 'match-1',
    teamA: { teamId: 'a', name: 'A', logo: '', rank: 1, region: '' },
    teamB: { teamId: 'b', name: 'B', logo: '', rank: 2, region: '' },
    eventName: 'Event',
    eventType: 'LAN',
    format: 'BO3',
    scheduledAt: '2026-07-20T10:00:00Z',
    status: 'scheduled',
    lineups: {
      teamA: { players, isConfirmed: true, hasStandin: false, standinCount: 0, missingKeyPlayers: [] },
      teamB: { players, isConfirmed: true, hasStandin: false, standinCount: 0, missingKeyPlayers: [] },
    },
  };
}

describe('buildAnalysisDataSnapshot', () => {
  it('records a complete immutable analysis input', () => {
    const teamA = team('a', 1);
    const snapshot = buildAnalysisDataSnapshot(match(), teamA, team('b', 2), {
      source: 'hltv',
      capturedAt: '2026-07-19T10:00:00Z',
    });

    expect(snapshot).toMatchObject({
      source: 'hltv',
      completeness: 1,
      isComplete: true,
      lineupConfirmed: true,
      missingFields: [],
    });
    teamA.players[0].rating = 9;
    expect(snapshot.teamA.players[0].rating).toBe(1);
  });

  it('lists missing competitive inputs without inventing defaults', () => {
    const incomplete = team('a', 999);
    incomplete.players = [];
    incomplete.recentForm.last10Matches = [];
    incomplete.mapPool.maps = [];
    const snapshot = buildAnalysisDataSnapshot({ ...match(), lineups: undefined }, incomplete, team('b', 2));

    expect(snapshot.isComplete).toBe(false);
    expect(snapshot.completeness).toBe(0.4);
    expect(snapshot.missingFields).toEqual(expect.arrayContaining([
      'team_a_rank',
      'team_a_recent_matches',
      'team_a_roster',
      'team_a_map_pool',
      'team_a_lineup',
      'team_b_lineup',
    ]));
  });
});
