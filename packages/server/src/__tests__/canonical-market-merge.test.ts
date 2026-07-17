import { describe, expect, it } from 'vitest';
import type { Market } from '@polyrader/core';
import { mergeCanonicalMarkets } from '../services/canonical-market-merge';

function market(input: Partial<Market> & Pick<Market, 'conditionId' | 'question'>): Market {
  return {
    slug: input.conditionId, description: '', outcomes: ['ENCE', 'SPARTA'], outcomePrices: ['0.5', '0.5'],
    volume: 0, volume24h: 0, liquidity: 0, startDate: '2026-07-14T08:00:00Z', endDate: '2026-07-14T12:00:00Z',
    status: 'active', tags: [], ...input,
  };
}

describe('mergeCanonicalMarkets', () => {
  it('merges a real market with its HLTV local simulation and keeps real prices', () => {
    const local = market({
      conditionId: 'local-hltv-2395534', canonicalMatchId: 'hltv:2395534',
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - European Pro League', tags: ['local-sim'],
      match: { matchId: 'local-hltv-2395534', canonicalMatchId: 'hltv:2395534', teamA: { teamId: '4869', name: 'ENCE', logo: '', rank: 163, region: '' }, teamB: { teamId: '13214', name: 'SPARTA', logo: '', rank: 103, region: '' }, eventName: 'European Pro League', eventType: 'Online', format: 'BO3', scheduledAt: '2026-07-14T08:00:00Z', status: 'scheduled' },
    });
    const real = market({
      conditionId: 'poly-1', question: 'Counter-Strike: ENCE vs SPARTA (BO3) - European Pro League',
      outcomePrices: ['0.42', '0.58'], clobTokenIds: ['yes', 'no'], volume24h: 1000, tags: ['polymarket'],
    });
    const merged = mergeCanonicalMarkets([local, real]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ conditionId: 'poly-1', canonicalMatchId: 'hltv:2395534', outcomePrices: ['0.42', '0.58'] });
    expect(merged[0].match?.matchId).toBe('local-hltv-2395534');
  });

  it('does not merge map winner markets into the series winner', () => {
    const base = market({ conditionId: 'base', question: 'Counter-Strike: ENCE vs SPARTA (BO3) - Event' });
    const mapOne = market({ conditionId: 'map-1', question: 'Counter-Strike: ENCE vs SPARTA - Map 1 Winner' });
    expect(mergeCanonicalMarkets([base, mapOne])).toHaveLength(2);
  });
});
