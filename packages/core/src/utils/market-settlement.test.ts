import { describe, expect, it } from 'vitest';
import {
  classifySettledMarketKind,
  settleLegAgainstStructuredResult,
} from './market-settlement';

describe('market settlement adapters', () => {
  const base = {
    winnerTeamName: 'SPARTA',
    teamAName: 'ENCE',
    teamBName: 'SPARTA',
    teamAMapsWon: 1,
    teamBMapsWon: 2,
    maps: [
      { mapNumber: 1, winnerTeamName: 'ENCE', teamARounds: 13, teamBRounds: 10 },
      { mapNumber: 2, winnerTeamName: 'SPARTA', teamARounds: 8, teamBRounds: 13 },
      { mapNumber: 3, winnerTeamName: 'SPARTA', teamARounds: 11, teamBRounds: 13 },
    ],
  };

  it('classifies map winner markets', () => {
    expect(classifySettledMarketKind('Counter-Strike: ENCE vs SPARTA - Map 2 Winner')).toBe('map_winner');
    expect(classifySettledMarketKind('Counter-Strike: ENCE vs SPARTA (BO3) - Event')).toBe('match_winner');
  });

  it('settles map winner only when that map result exists', () => {
    const won = settleLegAgainstStructuredResult({
      selection: 'SPARTA',
      marketQuestion: 'Counter-Strike: ENCE vs SPARTA - Map 2 Winner',
      result: base,
    });
    expect(won).toMatchObject({ kind: 'map_winner', result: 'won' });

    const pending = settleLegAgainstStructuredResult({
      selection: 'SPARTA',
      marketQuestion: 'Counter-Strike: ENCE vs SPARTA - Map 4 Winner',
      result: base,
    });
    expect(pending.result).toBe('pending');
  });

  it('settles total maps and correct score from series score', () => {
    const over = settleLegAgainstStructuredResult({
      selection: 'Over',
      marketQuestion: 'Counter-Strike: ENCE vs SPARTA - Total Maps O/U 2.5',
      result: base,
    });
    expect(over).toMatchObject({ kind: 'total_maps', result: 'won' });

    const score = settleLegAgainstStructuredResult({
      selection: '1-2',
      marketQuestion: 'Counter-Strike: ENCE vs SPARTA - Correct Score',
      result: base,
    });
    expect(score).toMatchObject({ kind: 'correct_score', result: 'won' });
  });

  it('keeps handicap pending without a line', () => {
    const decision = settleLegAgainstStructuredResult({
      selection: 'ENCE',
      marketQuestion: 'Counter-Strike: ENCE vs SPARTA - Handicap',
      result: { ...base, mapHandicapLine: undefined },
    });
    expect(decision.result).toBe('pending');
  });
});
