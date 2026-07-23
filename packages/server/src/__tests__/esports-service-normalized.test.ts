import { describe, expect, it } from 'vitest';
import { buildDota2FixtureFacts } from '@polyrader/core';
import { matchInfoFromNormalizedFacts } from '../services/esports-service';

describe('matchInfoFromNormalizedFacts', () => {
  it('opens a Dota future series without a legacy CS2 match row', () => {
    const match = matchInfoFromNormalizedFacts(
      buildDota2FixtureFacts(new Date('2026-07-21T12:00:00.000Z')),
    );

    expect(match).toMatchObject({
      matchId: '8906069414',
      canonicalMatchId: 'dota2:8906069414',
      status: 'scheduled',
      teamA: { teamId: 'liquid', name: 'Team Liquid' },
      teamB: { teamId: 'falcons', name: 'Team Falcons' },
    });
  });
});
