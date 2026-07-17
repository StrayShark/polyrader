import { describe, expect, it } from 'vitest';
import type { MatchInfo, Team } from '@polyrader/core';
import { estimateLocalOdds } from '../services/local-odds';

function team(teamId: string, rank: number, winRate: number): Team {
  return {
    teamId, name: teamId, logo: '', rank, region: '', players: [], headToHead: [],
    recentForm: { last10Matches: [{ opponent: 'x', result: 'win', score: '2-0', date: '', event: '' }], winRate, streak: 1, averageRating: 1 },
    mapPool: { maps: [{ map: 'Mirage', winRate, matchesPlayed: 10, roundsWon: 0, roundsLost: 0 }] },
  };
}

function match(teamA?: Team, teamB?: Team): MatchInfo {
  return {
    matchId: 'm1', teamA: { teamId: 'a', name: 'A', logo: '', rank: teamA?.rank ?? 0, region: '' },
    teamB: { teamId: 'b', name: 'B', logo: '', rank: teamB?.rank ?? 0, region: '' }, eventName: 'Event',
    eventType: 'Online', format: 'BO3', scheduledAt: new Date().toISOString(), status: 'scheduled',
    teamDetails: teamA && teamB ? { teamA, teamB, source: 'database', isComplete: true } : undefined,
  };
}

describe('estimateLocalOdds', () => {
  it('stays neutral without factual team inputs', () => {
    expect(estimateLocalOdds(match())).toMatchObject({ teamAProbability: 0.5, teamBProbability: 0.5, confidence: 0 });
  });

  it('prices the stronger ranked and recent-form team above 50%', () => {
    const result = estimateLocalOdds(match(team('A', 5, 0.8), team('B', 40, 0.3)));
    expect(result.teamAProbability).toBeGreaterThan(0.6);
    expect(result.teamAProbability + result.teamBProbability).toBeCloseTo(1);
    expect(result.factors.map((factor) => factor.name)).toEqual(['rank', 'recent-form', 'map-pool']);
  });
});
