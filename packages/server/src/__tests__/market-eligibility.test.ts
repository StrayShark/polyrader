import { describe, expect, it } from 'vitest';
import type { Market } from '@polyrader/core';
import { isOpenMarket } from '../services/market-eligibility';

function market(overrides: Partial<Market> = {}): Market {
  return {
    conditionId: 'm1',
    slug: 'm1',
    question: 'Counter-Strike: A vs B',
    description: '',
    outcomes: ['A', 'B'],
    outcomePrices: ['0.5', '0.5'],
    volume: 0,
    volume24h: 0,
    liquidity: 0,
    endDate: '2026-07-13T12:00:00.000Z',
    startDate: '2026-07-13T10:00:00.000Z',
    status: 'active',
    tags: ['cs2'],
    ...overrides,
  };
}

describe('market eligibility', () => {
  const now = new Date('2026-07-13T03:00:00.000Z');

  it('keeps active future markets', () => {
    expect(isOpenMarket(market(), now)).toBe(true);
  });

  it('rejects active markets whose end date is already stale', () => {
    expect(isOpenMarket(market({ endDate: '2026-05-14T15:00:00.000Z' }), now)).toBe(false);
  });

  it('rejects closed or resolved markets', () => {
    expect(isOpenMarket(market({ status: 'closed' }), now)).toBe(false);
    expect(isOpenMarket(market({ resolvedOutcome: 'A', resolvedPrice: 1 }), now)).toBe(false);
  });
});
