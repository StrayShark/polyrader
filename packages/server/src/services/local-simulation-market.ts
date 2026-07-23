import { buildCanonicalMatchId, type Market, type NormalizedMatchFacts } from '@polyrader/core';

export interface LocalSimulationMarketInput {
  source: 'db' | 'hltv';
  matchId: string;
  teamAName: string;
  teamBName: string;
  teamAId?: string;
  teamBId?: string;
  eventName: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  scheduledAt: string;
  today: string;
  index: number;
  hltvMatchId?: string;
}

export function buildLocalSimulationMarket(input: LocalSimulationMarketInput): Market {
  const sourceMatchId = input.matchId || `${input.today}-${input.index}`;
  const conditionId =
    sourceMatchId.startsWith('local-') || sourceMatchId.startsWith('daily-')
      ? sourceMatchId
      : `local-${input.source}-${sourceMatchId}`;
  const teamAName = normalizeLabel(input.teamAName, 'Team A');
  const teamBName = normalizeLabel(input.teamBName, 'Team B');
  const eventName = normalizeLabel(input.eventName, 'HLTV Upcoming');
  const teamAId = input.teamAId || localTeamId(teamAName, 'a');
  const teamBId = input.teamBId || localTeamId(teamBName, 'b');
  const canonicalMatchId = buildCanonicalMatchId({
    hltvMatchId: input.hltvMatchId,
    teamAId,
    teamBId,
    teamAName,
    teamBName,
    eventName,
    scheduledAt: input.scheduledAt,
  });

  return {
    conditionId,
    canonicalMatchId,
    slug: conditionId,
    question: `Counter-Strike: ${teamAName} vs ${teamBName} (${input.format}) - ${eventName}`,
    description: `Local ${input.source.toUpperCase()} simulation market for CS2 practice analysis.`,
    outcomes: [teamAName, teamBName],
    outcomePrices: ['0.50', '0.50'],
    clobTokenIds: [],
    volume: 0,
    volume24h: 0,
    liquidity: 0,
    startDate: input.scheduledAt,
    endDate: addHours(input.scheduledAt, input.format === 'BO1' ? 2 : 4),
    status: 'active',
    tags: ['cs2', 'practice', 'local-sim', 'local-odds-v1', input.source],
    match: {
      matchId: conditionId,
      canonicalMatchId,
      teamA: { teamId: teamAId, name: teamAName, rank: 0, logo: '', region: '' },
      teamB: { teamId: teamBId, name: teamBName, rank: 0, logo: '', region: '' },
      eventName,
      eventType: input.eventType,
      format: input.format,
      scheduledAt: input.scheduledAt,
      status: 'scheduled',
      maps: [],
    },
  };
}

/** Build an explicit zero-liquidity practice market from normalized game facts. */
export function buildMultigamePracticeMarket(facts: NormalizedMatchFacts): Market {
  if (facts.participants.length !== 2) {
    throw new Error(`Practice market ${facts.externalMatchId} requires exactly two participants`);
  }
  const [teamA, teamB] = facts.participants;
  const conditionId = `local-${facts.game}-${facts.externalMatchId}`;
  const canonicalMatchId =
    facts.game === 'cs2'
      ? `hltv:${facts.externalMatchId}`
      : `${facts.game}:${facts.externalMatchId}`;
  const eventName = normalizeLabel(facts.eventName, `${facts.game.toUpperCase()} Practice`);
  const teamAName = normalizeLabel(teamA.name, 'Team A');
  const teamBName = normalizeLabel(teamB.name, 'Team B');
  return {
    conditionId,
    canonicalMatchId,
    slug: conditionId,
    question:
      facts.game === 'cs2'
        ? `Counter-Strike: ${teamAName} vs ${teamBName} (${facts.format}) - ${eventName}`
        : `${teamAName} vs ${teamBName} (${facts.format}) - ${gameLabel(facts.game)} · ${eventName}`,
    description: `Local ${gameLabel(facts.game)} practice market generated from normalized facts.`,
    outcomes: [teamAName, teamBName],
    outcomePrices: ['0.50', '0.50'],
    clobTokenIds: [],
    volume: 0,
    volume24h: 0,
    liquidity: 0,
    startDate: facts.startsAt,
    endDate: addHours(facts.startsAt, facts.format === 'BO1' ? 2 : facts.format === 'BO5' ? 6 : 4),
    status: 'active',
    tags: [facts.game, 'practice', 'local-sim', 'local-odds-v1', 'normalized-facts'],
    match: {
      matchId: facts.externalMatchId,
      canonicalMatchId,
      teamA: {
        teamId: teamA.participantId,
        name: teamAName,
        rank: teamA.rating ?? 0,
        logo: '',
        region: '',
      },
      teamB: {
        teamId: teamB.participantId,
        name: teamBName,
        rank: teamB.rating ?? 0,
        logo: '',
        region: '',
      },
      eventName,
      eventType: 'Online',
      format: facts.format,
      scheduledAt: facts.startsAt,
      status: 'scheduled',
      maps: facts.mapPool,
    },
  };
}

/** Build independently auditable Dota winner, handicap and total-games practice markets. */
export function buildMultigamePracticeMarkets(facts: NormalizedMatchFacts): Market[] {
  const winner = buildMultigamePracticeMarket(facts);
  if (facts.game !== 'dota2' || facts.format === 'BO1') return [winner];
  const [teamAName, teamBName] = winner.outcomes;
  const handicapLine = facts.format === 'BO5' ? -2.5 : -1.5;
  const totalLine = facts.format === 'BO5' ? 4.5 : 2.5;
  const sharedTags = [...winner.tags, 'dota-series-market'];
  const handicap: Market = {
    ...winner,
    conditionId: `${winner.conditionId}-handicap`,
    slug: `${winner.slug}-handicap`,
    question: `Map Handicap ${teamAName} ${handicapLine} vs ${teamBName} (${facts.format})`,
    description: 'Synthetic Dota series game-handicap practice market.',
    outcomes: [`${teamAName} ${handicapLine}`, `${teamBName} +${Math.abs(handicapLine)}`],
    tags: [...sharedTags, 'market:handicap'],
  };
  const total: Market = {
    ...winner,
    conditionId: `${winner.conditionId}-total-maps`,
    slug: `${winner.slug}-total-maps`,
    question: `Total Maps ${totalLine}: ${teamAName} vs ${teamBName} (${facts.format})`,
    description: 'Synthetic Dota series total-games practice market.',
    outcomes: [`Over ${totalLine}`, `Under ${totalLine}`],
    tags: [...sharedTags, 'market:total_maps'],
  };
  return [winner, handicap, total];
}

/** Generate Map Winner practice markets that stay independent of the series winner market. */
export function buildLocalMapWinnerMarkets(seriesMarket: Market): Market[] {
  const format = seriesMarket.match?.format ?? 'BO3';
  const mapCount = format === 'BO1' ? 1 : format === 'BO5' ? 5 : 3;
  const teamAName = seriesMarket.outcomes[0] ?? seriesMarket.match?.teamA.name ?? 'Team A';
  const teamBName = seriesMarket.outcomes[1] ?? seriesMarket.match?.teamB.name ?? 'Team B';
  const eventName = seriesMarket.match?.eventName ?? 'Local Practice';
  // Keep series matchId so map legs settle with the same match reconciliation key.
  const seriesMatchId = seriesMarket.match?.matchId ?? seriesMarket.conditionId;

  return Array.from({ length: mapCount }, (_, index) => {
    const mapNumber = index + 1;
    const conditionId = `${seriesMarket.conditionId}-map-${mapNumber}`;
    return {
      ...seriesMarket,
      conditionId,
      slug: conditionId,
      // Include event + format so lobby grouping and match-parser stay aligned with series.
      question: `Counter-Strike: ${teamAName} vs ${teamBName} (${format}) - ${eventName} - Map ${mapNumber} Winner`,
      description: `Local map-winner practice market (Map ${mapNumber}). Independent from series winner settlement.`,
      tags: [...new Set([...(seriesMarket.tags ?? []), 'map-winner', 'local-sim'])],
      clobTokenIds: [],
      volume: 0,
      volume24h: 0,
      liquidity: 0,
      match: seriesMarket.match
        ? {
            ...seriesMarket.match,
            matchId: seriesMatchId,
            maps: [],
          }
        : undefined,
    } satisfies Market;
  });
}

function normalizeLabel(value: string, fallback: string): string {
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function localTeamId(name: string, side: 'a' | 'b'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `local-team-${side}-${slug || 'unknown'}`;
}

function addHours(iso: string, hours: number): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return iso;
  return new Date(timestamp + hours * 60 * 60 * 1000).toISOString();
}

function gameLabel(game: NormalizedMatchFacts['game']): string {
  if (game === 'dota2') return 'Dota 2';
  if (game === 'lol') return 'League of Legends';
  if (game === 'valorant') return 'VALORANT';
  return 'Counter-Strike 2';
}
