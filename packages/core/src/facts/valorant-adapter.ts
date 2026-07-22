import type { AnalysisFact, NormalizedMatchFacts, SourceSnapshotLike } from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'map_pool',
  'roster_a',
  'roster_b',
];

/** Promote Valorant GRID / Riot / Liquipedia snapshots into game-neutral facts. */
export function normalizeValorantMatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const matchSnapshots = snapshots.filter((item) => item.game === 'valorant' && item.entityType === 'match');
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'liquipedia', 'riot']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.teamAName ?? payload.team_a ?? 'Team A');
  const teamBName = String(payload.teamBName ?? payload.team_b ?? 'Team B');
  const teamAId = String(payload.teamAId ?? payload.team_a_id ?? `${selected.externalId}-a`);
  const teamBId = String(payload.teamBId ?? payload.team_b_id ?? `${selected.externalId}-b`);
  const startsAt = selected.startsAt || String(payload.startsAt ?? payload.date ?? new Date().toISOString());
  const mapPool = asStringArray(payload.mapPool ?? payload.maps ?? payload.maps_pool);
  const content = snapshots.find((item) => item.game === 'valorant' && (item.entityType === 'patch' || item.entityType === 'content'));
  const rosterSnapshots = snapshots.filter((item) => item.game === 'valorant' && item.entityType === 'team');
  const rosterSnapshotA = findRosterSnapshot(rosterSnapshots, teamAName, teamAId);
  const rosterSnapshotB = findRosterSnapshot(rosterSnapshots, teamBName, teamBId);
  const rosterA = rosterFromSnapshot(rosterSnapshotA, teamAId);
  const rosterB = rosterFromSnapshot(rosterSnapshotB, teamBId);

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (!mapPool.length) missing.push('map_pool');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  missing.push('agent_bans'); // agent/map veto placeholder

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
  if (mapPool.length) {
    facts.push({
      factId: 'map-pool',
      entityType: 'map',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'maps',
      value: mapPool,
    });
  }
  if (content) {
    facts.push({
      factId: 'content-version',
      entityType: 'patch',
      source: content.source,
      observedAt: content.observedAt,
      field: 'version',
      value: content.name || content.externalId,
    });
  }
  if (rosterA.length) {
    facts.push({
      factId: 'team-a-roster',
      entityType: 'roster',
      source: rosterA[0]?.source ?? selected.source,
      observedAt: selected.observedAt,
      field: 'players',
      value: rosterA.map((p) => p.displayName),
    });
  }
  if (rosterB.length) {
    facts.push({
      factId: 'team-b-roster',
      entityType: 'roster',
      source: rosterB[0]?.source ?? selected.source,
      observedAt: selected.observedAt,
      field: 'players',
      value: rosterB.map((p) => p.displayName),
    });
  }

  const base = {
    game: 'valorant' as const,
    externalMatchId: selected.externalId,
    eventId: payload.eventId ? String(payload.eventId) : undefined,
    eventName: String(payload.eventName ?? payload.tournament ?? selected.name),
    startsAt,
    format: normalizeFormat(payload.format),
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: content ? (content.name || content.externalId) : undefined,
    mapPool,
    participants: [
      { participantId: teamAId, side: 'a' as const, name: teamAName, source: selected.source },
      { participantId: teamBId, side: 'b' as const, name: teamBName, source: selected.source },
    ],
    players: [...rosterA, ...rosterB],
    sourceLinks: [
      link(selected),
      ...[rosterSnapshotA, rosterSnapshotB].filter((item): item is SourceSnapshotLike => Boolean(item)).map((item) => link(item)),
      ...(content ? [link(content)] : []),
    ],
    facts,
    missing,
    conflictFlags: [],
    completeness: computeCompleteness(REQUIRED, missing.filter((item) => item !== 'agent_bans')),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, content?.observedAt].filter((value): value is string => Boolean(value)),
      options?.now,
    ),
    adapterVersion: 'valorant.facts.v1',
  };

  return {
    id: `fm_valorant_${selected.externalId}`,
    ...base,
    dataSnapshotHash: hashNormalizedFacts(base),
  };
}

export function buildValorantFixtureFacts(now = new Date()): NormalizedMatchFacts {
  const observedAt = now.toISOString();
  return normalizeValorantMatchFacts([
    {
      game: 'valorant',
      source: 'grid',
      entityType: 'match',
      externalId: 'vct-82',
      name: 'Sentinels vs G2 Esports',
      startsAt: '2026-07-22T18:00:00.000Z',
      status: 'scheduled',
      payload: {
        teamAName: 'Sentinels',
        teamBName: 'G2 Esports',
        teamAId: 'sen',
        teamBId: 'g2',
        format: 'BO3',
        eventName: 'VCT Americas',
        mapPool: ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Icebox', 'Sunset'],
      },
      observedAt,
    },
    {
      game: 'valorant',
      source: 'riot',
      entityType: 'content',
      externalId: 'val-9.0',
      name: 'Episode 9',
      status: 'current',
      payload: { version: '9.0' },
      observedAt,
    },
    {
      game: 'valorant',
      source: 'liquipedia',
      entityType: 'team',
      externalId: 'sen',
      name: 'Sentinels',
      status: 'active',
      payload: {
        players: [
          { nickname: 'Zellsis' }, { nickname: 'johnqt' }, { nickname: 'zeybt' }, { nickname: 'bang' }, { nickname: 'N4RRATE' },
        ],
      },
      observedAt,
    },
    {
      game: 'valorant',
      source: 'liquipedia',
      entityType: 'team',
      externalId: 'g2',
      name: 'G2 Esports',
      status: 'active',
      payload: {
        players: [
          { nickname: 'leaf' }, { nickname: 'valyn' }, { nickname: 'trent' }, { nickname: 'jawgemo' }, { nickname: 'JonahP' },
        ],
      },
      observedAt,
    },
  ], { now })!;
}

function pickPreferred(items: SourceSnapshotLike[], order: string[]): SourceSnapshotLike | undefined {
  for (const source of order) {
    const hit = items.find((item) => item.source === source);
    if (hit) return hit;
  }
  return items[0];
}

function link(item: SourceSnapshotLike) {
  return {
    source: item.source,
    entityType: item.entityType,
    externalId: item.externalId,
    precedence: item.source === 'grid' ? 10 : item.source === 'riot' ? 20 : 30,
    observedAt: item.observedAt,
  };
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
  return snapshots.find((item) =>
    item.name.toLowerCase() === teamName.toLowerCase() || item.externalId === participantId,
  );
}

function rosterFromSnapshot(
  hit: SourceSnapshotLike | undefined,
  participantId: string,
): NormalizedMatchFacts['players'] {
  if (!hit) return [];
  const players = Array.isArray(hit.payload.players) ? hit.payload.players : [];
  return players.slice(0, 5).map((player, index) => {
    const row = (player && typeof player === 'object') ? player as Record<string, unknown> : {};
    return {
      participantId,
      playerId: String(row.playerId ?? row.id ?? `${participantId}-p${index}`),
      displayName: String(row.nickname ?? row.name ?? `Player ${index + 1}`),
      position: row.role ? String(row.role) : undefined,
      isStarter: true,
      source: hit.source,
    };
  });
}
