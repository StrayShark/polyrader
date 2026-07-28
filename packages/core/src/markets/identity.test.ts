import { describe, expect, it } from 'vitest';
import { alignMarketsForMatch, buildCanonicalMarketIdentity, findSettlementRule } from './identity';

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

  it('supports Dota 2 match-winner markets through OpenDota or GRID settlement', () => {
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
    expect(result.aligned).toBe(true);
    expect(result.status).toBe('aligned');
    expect(findSettlementRule('dota2', 'match_winner')).toMatchObject({
      supported: true,
      authoritativeSources: ['opendota', 'grid'],
    });
  });

  it('aligns Dota winner, handicap and total markets independently', () => {
    const result = alignMarketsForMatch({
      game: 'dota2',
      matchId: 'series-1',
      markets: [
        {
          question: 'Liquid vs Falcons (BO3) - Match Winner',
          outcomes: [{ label: 'Liquid' }, { label: 'Falcons' }],
          liquidityUsd: 5_000,
        },
        {
          question: 'Map Handicap Liquid -1.5 vs Falcons (BO3)',
          outcomes: [{ label: 'Liquid -1.5' }, { label: 'Falcons +1.5' }],
          liquidityUsd: 800,
        },
        {
          question: 'Total Maps 2.5: Liquid vs Falcons (BO3)',
          outcomes: [{ label: 'Over 2.5' }, { label: 'Under 2.5' }],
          liquidityUsd: 3_000,
        },
        {
          question: 'Liquid vs Falcons - Game 1 Winner',
          outcomes: [{ label: 'Liquid' }, { label: 'Falcons' }],
          liquidityUsd: 2_000,
        },
      ],
    });

    expect(result.aligned).toBe(true);
    expect(result.markets.map((market) => market.kind)).toEqual([
      'match_winner',
      'handicap',
      'total_maps',
      'map_winner',
    ]);
    expect(result.lowLiquidityMarketIds).toHaveLength(1);
    expect(result.markets[1]).toMatchObject({
      settlementRuleId: 'dota2.handicap.v1',
      liquidityStatus: 'low',
      warnings: ['low_liquidity'],
    });
    expect(result.markets[3]).toMatchObject({
      settlementRuleId: 'dota2.map_winner.v1',
      settlementSupported: true,
    });
  });

  it('marks local Dota markets as synthetic instead of real low-liquidity evidence', () => {
    const result = alignMarketsForMatch({
      game: 'dota2',
      matchId: 'series-2',
      markets: [
        {
          kind: 'match_winner',
          outcomes: [{ label: 'A' }, { label: 'B' }],
          liquidityUsd: 0,
          tags: ['practice', 'local-sim'],
        },
      ],
    });

    expect(result).toMatchObject({
      evidenceType: 'synthetic',
      realMarketCount: 0,
      syntheticMarketCount: 1,
      lowLiquidityMarketIds: [],
    });
    expect(result.markets[0].liquidityStatus).toBe('synthetic');
  });

  it.each(['lol', 'valorant'] as const)(
    'supports %s match-winner markets through GRID settlement',
    (game) => {
      const market = buildCanonicalMarketIdentity({
        game,
        matchId: `${game}:series-1`,
        kind: 'match_winner',
        outcomes: [{ label: 'Team A' }, { label: 'Team B' }],
      });

      expect(market.settlementSupported).toBe(true);
      expect(findSettlementRule(game, 'match_winner')?.authoritativeSources).toEqual(['grid']);
    },
  );

  it.each(['lol', 'valorant'] as const)(
    'aligns %s winner, map, handicap and total markets when settlement rules exist',
    (game) => {
      const prefix = game === 'lol' ? 'LoL' : 'Valorant';
      const result = alignMarketsForMatch({
        game,
        matchId: `${game}:series-mix`,
        markets: [
          {
            question: `${prefix}: Team A vs Team B (BO3) - Event`,
            outcomes: [{ label: 'Team A' }, { label: 'Team B' }],
            liquidityUsd: 5_000,
          },
          {
            question: `${prefix}: Team A vs Team B - Game 1 Winner`,
            outcomes: [{ label: 'Team A' }, { label: 'Team B' }],
            liquidityUsd: 2_000,
          },
          {
            question: `Game Handicap: Team A (-1.5) vs Team B (+1.5)`,
            outcomes: [{ label: 'Team A -1.5' }, { label: 'Team B +1.5' }],
            liquidityUsd: 1_500,
          },
          {
            question: `Games Total: Team A vs Team B O/U 2.5`,
            outcomes: [{ label: 'Over' }, { label: 'Under' }],
            liquidityUsd: 1_200,
          },
        ],
      });

      expect(result.aligned).toBe(true);
      expect(result.status).toBe('aligned');
      expect(result.markets.map((market) => market.kind)).toEqual([
        'match_winner',
        'map_winner',
        'handicap',
        'total_maps',
      ]);
      expect(result.markets.every((market) => market.settlementSupported)).toBe(true);
    },
  );
});
