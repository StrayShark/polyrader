import { describe, expect, it } from 'vitest';
import type { Market } from '@polyrader/core';
import { isLobbyVisibleMarket, isOpenMarket } from '../services/market-eligibility';

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

  it('hides scheduled markets whose start is past the 15-minute grace window', () => {
    expect(
      isLobbyVisibleMarket(
        market({
          endDate: '2026-07-13T08:00:00.000Z',
          match: {
            matchId: 'hltv-1',
            teamA: { teamId: 'a', name: 'A', rank: 1, logo: '', region: '' },
            teamB: { teamId: 'b', name: 'B', rank: 2, logo: '', region: '' },
            eventName: 'Test',
            eventType: 'Online',
            format: 'BO3',
            scheduledAt: '2026-07-13T02:30:00.000Z',
            status: 'scheduled',
          },
        }),
        now,
      ),
    ).toBe(false);
  });

  it('keeps live markets and prematch markets inside the grace window', () => {
    expect(
      isLobbyVisibleMarket(
        market({
          match: {
            matchId: 'hltv-live',
            teamA: { teamId: 'a', name: 'A', rank: 1, logo: '', region: '' },
            teamB: { teamId: 'b', name: 'B', rank: 2, logo: '', region: '' },
            eventName: 'Test',
            eventType: 'Online',
            format: 'BO3',
            scheduledAt: '2026-07-13T01:00:00.000Z',
            status: 'live',
          },
        }),
        now,
      ),
    ).toBe(true);
    expect(
      isLobbyVisibleMarket(
        market({
          match: {
            matchId: 'hltv-grace',
            teamA: { teamId: 'a', name: 'A', rank: 1, logo: '', region: '' },
            teamB: { teamId: 'b', name: 'B', rank: 2, logo: '', region: '' },
            eventName: 'Test',
            eventType: 'Online',
            format: 'BO3',
            scheduledAt: '2026-07-13T02:50:00.000Z',
            status: 'scheduled',
          },
        }),
        now,
      ),
    ).toBe(true);
  });
});
