import type { AnalysisFact, NormalizedMatchFacts, SourceSnapshotLike } from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'roster_a',
  'roster_b',
  'ranking_a',
  'ranking_b',
  'recent_form_a',
  'recent_form_b',
  'map_pool_a',
  'map_pool_b',
  'player_stats_a',
  'player_stats_b',
];

/** Promote CS2 source snapshots (HLTV/GRID/Liquipedia) into game-neutral facts. */
export function normalizeCs2MatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const matchSnapshots = snapshots.filter(
    (item) => item.game === 'cs2' && item.entityType === 'match',
  );
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'hltv', 'liquipedia']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.teamAName ?? payload.team_a ?? 'Team A');
  const teamBName = String(payload.teamBName ?? payload.team_b ?? 'Team B');
  const teamAId = String(payload.teamAId ?? payload.team_a_id ?? `${selected.externalId}-a`);
  const teamBId = String(payload.teamBId ?? payload.team_b_id ?? `${selected.externalId}-b`);
  const format = normalizeFormat(payload.format);
  const startsAt =
    selected.startsAt || String(payload.date ?? payload.startsAt ?? new Date().toISOString());

  const rosterSnapshots = snapshots.filter(
    (item) => item.game === 'cs2' && item.entityType === 'team',
  );
  const rosterSnapshotA = findRosterSnapshot(rosterSnapshots, teamAName, teamAId);
  const rosterSnapshotB = findRosterSnapshot(rosterSnapshots, teamBName, teamBId);
  const relatedRosters = [rosterSnapshotA, rosterSnapshotB].filter(
    (item): item is SourceSnapshotLike => Boolean(item),
  );
  const lineupA = lineupPlayers(payload.lineups, 'teamA');
  const lineupB = lineupPlayers(payload.lineups, 'teamB');
  const rosterA = rosterFromSnapshot(rosterSnapshotA, teamAId, lineupA);
  const rosterB = rosterFromSnapshot(rosterSnapshotB, teamBId, lineupB);
  const contextA = teamContext(rosterSnapshotA, lineupA);
  const contextB = teamContext(rosterSnapshotB, lineupB);
  const relatedMatches = matchSnapshots.filter((item) =>
    isSameMatch(item, selected, teamAName, teamBName),
  );

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  if (contextA.rank === undefined) missing.push('ranking_a');
  if (contextB.rank === undefined) missing.push('ranking_b');
  if (!contextA.recentMatches.length) missing.push('recent_form_a');
  if (!contextB.recentMatches.length) missing.push('recent_form_b');
  if (!contextA.mapPool.length) missing.push('map_pool_a');
  if (!contextB.mapPool.length) missing.push('map_pool_b');
  if (!contextA.playerStats.length) missing.push('player_stats_a');
  if (!contextB.playerStats.length) missing.push('player_stats_b');

  const headToHead = findHeadToHead(contextA.recentMatches, teamBName);
  if (!headToHead.length) missing.push('head_to_head');

  const conflictFlags = detectIdentityConflicts(relatedMatches, selected);
  const facts: AnalysisFact[] = [
    {
      factId: 'match-identity',
      entityType: 'match',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'external_match_id',
      value: selected.externalId,
    },
    {
      factId: 'team-a-name',
      entityType: 'team',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'name',
      value: teamAName,
    },
    {
      factId: 'team-b-name',
      entityType: 'team',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'name',
      value: teamBName,
    },
  ];
  if (rosterA.length) {
    facts.push({
      factId: 'team-a-roster',
      entityType: 'roster',
      source: rosterSnapshotA?.source ?? selected.source,
      observedAt: rosterSnapshotA?.observedAt ?? selected.observedAt,
      field: 'players',
      value: rosterA.map((p) => p.displayName),
    });
  }
  if (rosterB.length) {
    facts.push({
      factId: 'team-b-roster',
      entityType: 'roster',
      source: rosterSnapshotB?.source ?? selected.source,
      observedAt: rosterSnapshotB?.observedAt ?? selected.observedAt,
      field: 'players',
      value: rosterB.map((p) => p.displayName),
    });
  }
  appendTeamContextFacts(facts, 'a', contextA, rosterSnapshotA ?? selected);
  appendTeamContextFacts(facts, 'b', contextB, rosterSnapshotB ?? selected);
  if (headToHead.length) {
    facts.push({
      factId: 'head-to-head-recent',
      entityType: 'match_history',
      source: rosterSnapshotA?.source ?? selected.source,
      observedAt: rosterSnapshotA?.observedAt ?? selected.observedAt,
      field: 'recent_meetings',
      value: headToHead,
    });
  }

  const matchMaps = asStringArray(payload.mapPool ?? payload.maps);
  const availableMaps =
    matchMaps.length > 0
      ? matchMaps
      : [...new Set([...contextA.mapPool, ...contextB.mapPool].map((item) => item.map))];

  const base = {
    game: 'cs2' as const,
    externalMatchId: selected.externalId,
    eventId: payload.eventId ? String(payload.eventId) : undefined,
    eventName: String(payload.eventName ?? payload.tournament ?? selected.name),
    startsAt,
    format,
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: undefined,
    mapPool: availableMaps,
    participants: [
      { participantId: teamAId, side: 'a' as const, name: teamAName, source: selected.source },
      { participantId: teamBId, side: 'b' as const, name: teamBName, source: selected.source },
    ],
    players: [...rosterA, ...rosterB],
    sourceLinks: relatedMatches
      .map((item) => ({
        source: item.source,
        entityType: item.entityType,
        externalId: item.externalId,
        precedence: precedenceFor(item.source),
        observedAt: item.observedAt,
      }))
      .concat(
        relatedRosters.map((item) => ({
          source: item.source,
          entityType: item.entityType,
          externalId: item.externalId,
          precedence: precedenceFor(item.source),
          observedAt: item.observedAt,
        })),
      ),
    facts,
    missing,
    conflictFlags,
    completeness: computeCompleteness(REQUIRED, missing),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, ...relatedRosters.map((item) => item.observedAt)],
      options?.now,
    ),
    adapterVersion: 'cs2.facts.v2',
  };

  const dataSnapshotHash = hashNormalizedFacts(base);
  return {
    id: `fm_cs2_${selected.externalId}`,
    ...base,
    dataSnapshotHash,
  };
}

function pickPreferred(
  items: SourceSnapshotLike[],
  order: string[],
): SourceSnapshotLike | undefined {
  for (const source of order) {
    const hit = items.find((item) => item.source === source);
    if (hit) return hit;
  }
  return items[0];
}

function precedenceFor(source: string): number {
  if (source === 'grid') return 10;
  if (source === 'hltv') return 20;
  if (source === 'liquipedia') return 30;
  return 100;
}

function normalizeFormat(value: unknown): 'BO1' | 'BO3' | 'BO5' {
  const text = String(value ?? 'BO3').toUpperCase();
  if (text.includes('1')) return 'BO1';
  if (text.includes('5')) return 'BO5';
  return 'BO3';
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function findRosterSnapshot(
  snapshots: SourceSnapshotLike[],
  teamName: string,
  participantId: string,
): SourceSnapshotLike | undefined {
  return snapshots.find(
    (item) =>
      item.name.toLowerCase() === teamName.toLowerCase() || item.externalId === participantId,
  );
}

function rosterFromSnapshot(
  hit: SourceSnapshotLike | undefined,
  participantId: string,
  lineup: Array<Record<string, unknown>> = [],
): NormalizedMatchFacts['players'] {
  const players =
    lineup.length > 0
      ? lineup
      : hit && Array.isArray(hit.payload.players)
        ? hit.payload.players
        : [];
  return players.slice(0, 5).map((player, index) => {
    const row = player && typeof player === 'object' ? (player as Record<string, unknown>) : {};
    return {
      participantId,
      playerId: String(row.playerId ?? row.id ?? `${participantId}-p${index}`),
      displayName: String(row.nickname ?? row.name ?? `Player ${index + 1}`),
      position: row.role ? String(row.role) : undefined,
      isStarter: true,
      source: hit?.source ?? 'hltv',
    };
  });
}

interface Cs2TeamContext {
  rank?: number;
  region?: string;
  recentMatches: Array<Record<string, unknown>>;
  recentSummary?: Record<string, unknown>;
  mapPool: Array<{ map: string; winRate: number; matchesPlayed: number }>;
  playerStats: Array<Record<string, unknown>>;
}

function teamContext(
  hit: SourceSnapshotLike | undefined,
  lineup: Array<Record<string, unknown>>,
): Cs2TeamContext {
  const payload = hit?.payload ?? {};
  const rankValue = Number(payload.rank);
  const recent = asRecord(payload.recentForm ?? payload.recent_form);
  const recentMatches = asRecordArray(recent.last10Matches ?? recent.matches).slice(0, 10);
  const mapPoolObject = asRecord(payload.mapPool ?? payload.map_pool);
  const mapPool = asRecordArray(mapPoolObject.maps)
    .map((item) => ({
      map: String(item.map ?? item.name ?? ''),
      winRate: Number(item.winRate ?? item.win_rate ?? 0),
      matchesPlayed: Number(item.matchesPlayed ?? item.matches_played ?? 0),
    }))
    .filter((item) => item.map && item.matchesPlayed > 0 && Number.isFinite(item.winRate));
  const profilePlayers = asRecordArray(payload.players);
  const playerStats = playerMetrics(lineup.length > 0 ? lineup : profilePlayers);
  const recentSummary =
    recentMatches.length > 0
      ? {
          winRate: finiteNumber(recent.winRate ?? recent.win_rate),
          streak: finiteNumber(recent.streak),
          averageRating: positiveNumber(recent.averageRating ?? recent.average_rating),
          matches: recentMatches,
        }
      : undefined;
  return {
    rank: rankValue > 0 && rankValue < 999 ? rankValue : undefined,
    region: typeof payload.region === 'string' && payload.region ? payload.region : undefined,
    recentMatches,
    recentSummary,
    mapPool,
    playerStats,
  };
}

function appendTeamContextFacts(
  facts: AnalysisFact[],
  side: 'a' | 'b',
  context: Cs2TeamContext,
  source: SourceSnapshotLike,
): void {
  const prefix = `team-${side}`;
  if (context.rank !== undefined) {
    facts.push({
      factId: `${prefix}-ranking`,
      entityType: 'team',
      source: source.source,
      observedAt: source.observedAt,
      field: 'world_rank',
      value: context.rank,
    });
  }
  if (context.region) {
    facts.push({
      factId: `${prefix}-region`,
      entityType: 'team',
      source: source.source,
      observedAt: source.observedAt,
      field: 'region',
      value: context.region,
    });
  }
  if (context.recentSummary) {
    facts.push({
      factId: `${prefix}-recent-form`,
      entityType: 'match_history',
      source: source.source,
      observedAt: source.observedAt,
      field: 'last_10_matches',
      value: context.recentSummary,
    });
  }
  if (context.mapPool.length) {
    facts.push({
      factId: `${prefix}-map-pool`,
      entityType: 'map_pool',
      source: source.source,
      observedAt: source.observedAt,
      field: 'map_records',
      value: context.mapPool,
    });
  }
  if (context.playerStats.length) {
    facts.push({
      factId: `${prefix}-player-stats`,
      entityType: 'player',
      source: source.source,
      observedAt: source.observedAt,
      field: 'lineup_metrics',
      value: context.playerStats,
    });
  }
}

function lineupPlayers(value: unknown, side: 'teamA' | 'teamB'): Array<Record<string, unknown>> {
  const lineups = asRecord(value);
  const lineup = asRecord(lineups[side]);
  return asRecordArray(lineup.players);
}

function playerMetrics(players: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return players.slice(0, 5).flatMap((player) => {
    const rating = positiveNumber(player.rating ?? player.numericRating);
    const kdRatio = positiveNumber(player.kdRatio ?? player.kd_ratio);
    const headshotPercent = positiveNumber(player.headshotPercent ?? player.headshot_percent);
    const mapsPlayed = positiveNumber(
      player.mapsPlayed ?? player.mapsOnRecord ?? player.maps_played,
    );
    if ([rating, kdRatio, headshotPercent, mapsPlayed].every((value) => value === undefined))
      return [];
    return [
      {
        playerId: String(player.playerId ?? player.id ?? ''),
        nickname: String(player.nickname ?? player.name ?? ''),
        ...(rating !== undefined ? { rating } : {}),
        ...(kdRatio !== undefined ? { kdRatio } : {}),
        ...(headshotPercent !== undefined ? { headshotPercent } : {}),
        ...(mapsPlayed !== undefined ? { mapsPlayed } : {}),
        ...(player.role ? { role: String(player.role) } : {}),
      },
    ];
  });
}

function findHeadToHead(
  recentMatches: Array<Record<string, unknown>>,
  opponentName: string,
): Array<Record<string, unknown>> {
  const normalizedOpponent = normalizeName(opponentName);
  return recentMatches.filter(
    (item) => normalizeName(String(item.opponent ?? '')) === normalizedOpponent,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSameMatch(
  item: SourceSnapshotLike,
  selected: SourceSnapshotLike,
  teamAName: string,
  teamBName: string,
): boolean {
  if (item.externalId === selected.externalId) return true;
  const selectedCanonical = String(
    selected.payload.canonicalMatchId ?? selected.payload.canonical_match_id ?? '',
  );
  const itemCanonical = String(
    item.payload.canonicalMatchId ?? item.payload.canonical_match_id ?? '',
  );
  if (selectedCanonical && itemCanonical && selectedCanonical === itemCanonical) return true;
  const itemPair = [
    String(item.payload.teamAName ?? item.payload.team_a ?? ''),
    String(item.payload.teamBName ?? item.payload.team_b ?? ''),
  ]
    .map((name) => name.trim().toLowerCase())
    .sort();
  const selectedPair = [teamAName, teamBName].map((name) => name.trim().toLowerCase()).sort();
  if (!itemPair[0] || itemPair[0] !== selectedPair[0] || itemPair[1] !== selectedPair[1])
    return false;
  const left = Date.parse(item.startsAt ?? '');
  const right = Date.parse(selected.startsAt ?? '');
  return (
    Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 6 * 60 * 60 * 1000
  );
}

function detectIdentityConflicts(
  matchSnapshots: SourceSnapshotLike[],
  selected: SourceSnapshotLike,
): NormalizedMatchFacts['conflictFlags'] {
  const flags: NormalizedMatchFacts['conflictFlags'] = [];
  const names = new Set(matchSnapshots.map((item) => item.name.toLowerCase()));
  if (names.size > 1) flags.push('identity_collision');
  const starts = matchSnapshots
    .map((item) => item.startsAt)
    .filter((value): value is string => Boolean(value));
  if (starts.length > 1 && new Set(starts).size > 1) flags.push('schedule_mismatch');
  if (
    selected.source === 'hltv' &&
    matchSnapshots.some((item) => item.source === 'grid' && item.externalId !== selected.externalId)
  ) {
    flags.push('identity_collision');
  }
  return flags;
}
