import { describe, expect, it } from 'vitest';
import {
  alignMarketsForMatch,
  buildCanonicalMarketIdentity,
  findSettlementRule,
} from './identity';

describe('market identity + settlement rules', () => {
  it('builds canonical CS2 match-winner identity with settlement support', () => {
    const market = buildCanonicalMarketIdentity({
      game: 'cs2',
      matchId: '2395534',
      question: 'Counter-Strike: NaVi vs FaZe (BO3) - IEM',
      outcomes: [
        { outcomeId: 'navi', label: 'NaVi' },
        { outcomeId: 'faze', label: 'FaZe' },
      ],
    });
    expect(market.kind).toBe('match_winner');
    expect(market.settlementSupported).toBe(true);
    expect(findSettlementRule('cs2', 'match_winner')?.ruleId).toBe('cs2.match_winner.v1');
  });

  it('blocks Dota boards until the runtime result settler is implemented', () => {
    const result = alignMarketsForMatch({
      game: 'dota2',
      matchId: '8906069414',
      markets: [
        {
          kind: 'match_winner',
          outcomes: [
            { outcomeId: 'liquid', label: 'Team Liquid' },
            { outcomeId: 'falcons', label: 'Team Falcons' },
          ],
          liquidityUsd: 5000,
        },
      ],
    });
    expect(result.aligned).toBe(false);
    expect(result.status).toBe('unsupported');
    expect(findSettlementRule('dota2', 'match_winner')?.supported).toBe(false);
  });
});
