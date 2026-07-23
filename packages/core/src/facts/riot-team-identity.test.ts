import { describe, expect, it } from 'vitest';
import { normalizeRiotTeamAlias, resolveRiotTeamIdentity } from './riot-team-identity';
import { normalizeLolTeamAlias } from './lol-identity';
import { normalizeValorantTeamAlias } from './valorant-identity';

describe('Riot team identity', () => {
  it('normalizes LoL and Valorant aliases with game-specific noise words', () => {
    expect(normalizeLolTeamAlias('T1 Esports')).toBe('t1');
    expect(normalizeValorantTeamAlias('Sentinels VCT')).toBe('sentinels');
    expect(normalizeRiotTeamAlias('Hanwha Life Esports', 'lol')).toBe('hanwhalife');
  });

  it('matches by alias and refuses to guess on ambiguous collisions', () => {
    const matched = resolveRiotTeamIdentity(
      { name: 'T1' },
      [
        { teamId: 't1', name: 'T1', aliases: ['skt t1'] },
        { teamId: 'gen', name: 'Gen.G' },
      ],
      'lol',
    );
    expect(matched).toMatchObject({ status: 'matched', teamId: 't1' });

    const ambiguous = resolveRiotTeamIdentity(
      { name: 'Falcons' },
      [
        { teamId: 'a', name: 'Team Falcons' },
        { teamId: 'b', name: 'Falcons Esports' },
      ],
      'lol',
    );
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.candidateIds).toHaveLength(2);
  });
});
