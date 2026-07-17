import type { Market } from '@polyrader/core';

export function getLocalSeedMarkets(limit = 50, offset = 0): Market[] {
  if (process.env.POLYRADER_DISABLE_LOCAL_SEED === '1') return [];

  const now = new Date();
  const isoAt = (days: number, hour: number) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  const markets: Market[] = [
    buildSeedMarket({
      conditionId: 'local-seed-navi-faze-bo3',
      slug: 'local-seed-navi-faze-bo3',
      question: 'Counter-Strike: Natus Vincere vs FaZe Clan (BO3) - IEM Cologne Practice',
      description: 'Local practice market used when live Polymarket data is unavailable.',
      teamA: { id: 'seed-navi', name: 'Natus Vincere', rank: 4 },
      teamB: { id: 'seed-faze', name: 'FaZe Clan', rank: 7 },
      eventName: 'IEM Cologne Practice',
      eventType: 'LAN',
      format: 'BO3',
      startDate: isoAt(1, 12),
      endDate: isoAt(1, 16),
      outcomePrices: ['0.56', '0.44'],
      volume: 184500,
      volume24h: 27500,
      liquidity: 19800,
    }),
    buildSeedMarket({
      conditionId: 'local-seed-vitality-spirit-bo3',
      slug: 'local-seed-vitality-spirit-bo3',
      question: 'Counter-Strike: Team Vitality vs Team Spirit (BO3) - BLAST Practice',
      description: 'Local practice market used when live Polymarket data is unavailable.',
      teamA: { id: 'seed-vitality', name: 'Team Vitality', rank: 1 },
      teamB: { id: 'seed-spirit', name: 'Team Spirit', rank: 2 },
      eventName: 'BLAST Practice',
      eventType: 'LAN',
      format: 'BO3',
      startDate: isoAt(2, 10),
      endDate: isoAt(2, 14),
      outcomePrices: ['0.52', '0.48'],
      volume: 226000,
      volume24h: 34200,
      liquidity: 22100,
    }),
    buildSeedMarket({
      conditionId: 'local-seed-g2-mouz-bo3',
      slug: 'local-seed-g2-mouz-bo3',
      question: 'Counter-Strike: G2 Esports vs MOUZ (BO3) - ESL Practice',
      description: 'Local practice market used when live Polymarket data is unavailable.',
      teamA: { id: 'seed-g2', name: 'G2 Esports', rank: 6 },
      teamB: { id: 'seed-mouz', name: 'MOUZ', rank: 5 },
      eventName: 'ESL Practice',
      eventType: 'Online',
      format: 'BO3',
      startDate: isoAt(3, 13),
      endDate: isoAt(3, 17),
      outcomePrices: ['0.49', '0.51'],
      volume: 126000,
      volume24h: 18800,
      liquidity: 14600,
    }),
  ];

  return markets.slice(offset, offset + limit);
}

function buildSeedMarket(input: {
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  teamA: { id: string; name: string; rank: number };
  teamB: { id: string; name: string; rank: number };
  eventName: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  startDate: string;
  endDate: string;
  outcomePrices: [string, string];
  volume: number;
  volume24h: number;
  liquidity: number;
}): Market {
  return {
    conditionId: input.conditionId,
    slug: input.slug,
    question: input.question,
    description: input.description,
    outcomes: [input.teamA.name, input.teamB.name],
    outcomePrices: input.outcomePrices,
    clobTokenIds: [],
    volume: input.volume,
    volume24h: input.volume24h,
    liquidity: input.liquidity,
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'active',
    tags: ['cs2', 'practice', 'local-seed'],
    match: {
      matchId: input.conditionId,
      teamA: { teamId: input.teamA.id, name: input.teamA.name, rank: input.teamA.rank, logo: '', region: 'EU' },
      teamB: { teamId: input.teamB.id, name: input.teamB.name, rank: input.teamB.rank, logo: '', region: 'EU' },
      eventName: input.eventName,
      eventType: input.eventType,
      format: input.format,
      scheduledAt: input.startDate,
      status: 'scheduled',
      maps: ['Mirage', 'Inferno', 'Nuke'],
    },
  };
}
