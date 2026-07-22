import { describe, expect, it } from 'vitest';
import { buildLocalMapWinnerMarkets, buildLocalSimulationMarket } from '../services/local-simulation-market';

describe('buildLocalSimulationMarket', () => {
  it('builds a canonical HLTV practice market and normalizes display labels', () => {
    const market = buildLocalSimulationMarket({
      source: 'hltv',
      matchId: '2396046',
      teamAName: 'Strael Bora',
      teamBName: 'Citronnade',
      teamAId: '13546',
      teamBId: '13918',
      eventName: 'HopLan 2026\n      Playoffs',
      eventType: 'LAN',
      format: 'BO1',
      scheduledAt: '2026-07-19T15:45:00.000Z',
      today: '2026-07-19',
      index: 0,
      hltvMatchId: '2396046',
    });

    expect(market).toMatchObject({
      conditionId: 'local-hltv-2396046',
      canonicalMatchId: 'hltv:2396046',
      question: 'Counter-Strike: Strael Bora vs Citronnade (BO1) - HopLan 2026 Playoffs',
      outcomes: ['Strael Bora', 'Citronnade'],
      outcomePrices: ['0.50', '0.50'],
      endDate: '2026-07-19T17:45:00.000Z',
      status: 'active',
    });
    expect(market.tags).toEqual(expect.arrayContaining(['local-sim', 'hltv']));
    expect(market.match?.eventName).toBe('HopLan 2026 Playoffs');
  });

  it('builds independent Map Winner markets that keep the series matchId', () => {
    const series = buildLocalSimulationMarket({
      source: 'hltv',
      matchId: '2395534',
      teamAName: 'ENCE',
      teamBName: 'SPARTA',
      eventName: 'European Pro League',
      eventType: 'Online',
      format: 'BO3',
      scheduledAt: '2026-07-14T08:00:00.000Z',
      today: '2026-07-14',
      index: 0,
      hltvMatchId: '2395534',
    });

    const maps = buildLocalMapWinnerMarkets(series);
    expect(maps).toHaveLength(3);
    expect(maps[0]).toMatchObject({
      conditionId: 'local-hltv-2395534-map-1',
      canonicalMatchId: series.canonicalMatchId,
      question: 'Counter-Strike: ENCE vs SPARTA (BO3) - European Pro League - Map 1 Winner',
    });
    expect(maps[0].match?.matchId).toBe(series.conditionId);
    expect(maps[0].tags).toEqual(expect.arrayContaining(['map-winner', 'local-sim']));
  });
});
