import type { AnalysisFact, NormalizedMatchFacts, SourceSnapshotLike } from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';
import { normalizeValorantTeamAlias, resolveValorantTeamIdentity } from './valorant-identity';
import { buildRiotGameDataQuality } from './lol-adapter';

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
  const now = options?.now ?? new Date();
  const matchSnapshots = snapshots.filter(
    (item) => item.game === 'valorant' && item.entityType === 'match',
  );
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'liquipedia', 'riot']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.teamAName ?? payload.team_a ?? 'Team A');
  const teamBName = String(payload.teamBName ?? payload.team_b ?? 'Team B');
  const teamAId = String(payload.teamAId ?? payload.team_a_id ?? `${selected.externalId}-a`);
  const teamBId = String(payload.teamBId ?? payload.team_b_id ?? `${selected.externalId}-b`);
  const startsAt =
    selected.startsAt || String(payload.startsAt ?? payload.date ?? new Date().toISOString());
  const content = snapshots.find(
    (item) =>
      item.game === 'valorant' && (item.entityType === 'patch' || item.entityType === 'content'),
  );
  const mapPool = asMapNames(
    payload.mapPool ?? payload.maps ?? payload.maps_pool ?? content?.payload.maps,
  );
  const rosterSnapshots = snapshots.filter(
    (item) => item.game === 'valorant' && item.entityType === 'team',
  );
  const identityA =
    payload.teamAIdentity ?? resolveAgainstRosters(teamAName, teamAId, rosterSnapshots);
  const identityB =
    payload.teamBIdentity ?? resolveAgainstRosters(teamBName, teamBId, rosterSnapshots);
  const rosterSnapshotA = findRosterSnapshot(rosterSnapshots, teamAName, teamAId, identityA);
  const rosterSnapshotB = findRosterSnapshot(rosterSnapshots, teamBName, teamBId, identityB);
  const rosterA = rosterFromSnapshot(rosterSnapshotA, teamAId);
  const rosterB = rosterFromSnapshot(rosterSnapshotB, teamBId);

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (!mapPool.length) missing.push('map_pool');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  missing.push('agent_bans');

  const conflictFlags: NormalizedMatchFacts['conflictFlags'] = [];
  if (identityStatus(identityA) === 'ambiguous' || identityStatus(identityB) === 'ambiguous') {
    conflictFlags.push('identity_collision');
  }

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
      observedAt: rosterSnapshotA?.observedAt ?? selected.observedAt,
      field: 'players',
      value: rosterA.map((p) => p.displayName),
    });
  }
  if (rosterB.length) {
    facts.push({
      factId: 'team-b-roster',
      entityType: 'roster',
      source: rosterB[0]?.source ?? selected.source,
      observedAt: rosterSnapshotB?.observedAt ?? selected.observedAt,
      field: 'players',
      value: rosterB.map((p) => p.displayName),
    });
  }

  const quality = buildRiotGameDataQuality({
    contractVersion: 'valorant-quality.v1',
    now,
    patch: content,
    mapPoolAvailable: mapPool.length > 0,
    mapPoolSource: content ?? selected,
    sides: [
      {
        side: 'a',
        participantId: teamAId,
        name: teamAName,
        identity: identityA,
        rosterSnapshot: rosterSnapshotA,
        rosterCount: rosterA.length,
      },
      {
        side: 'b',
        participantId: teamBId,
        name: teamBName,
        identity: identityB,
        rosterSnapshot: rosterSnapshotB,
        rosterCount: rosterB.length,
      },
    ],
  });
  facts.push({
    factId: 'valorant-data-quality',
    entityType: 'quality',
    source: selected.source,
    observedAt: selected.observedAt,
    field: 'quality',
    value: quality,
  });

  const base = {
    game: 'valorant' as const,
    externalMatchId: selected.externalId,
    eventId: payload.eventId ? String(payload.eventId) : undefined,
    eventName: String(payload.eventName ?? payload.tournament ?? selected.name),
    startsAt,
    format: normalizeFormat(payload.format),
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: content ? content.name || content.externalId : undefined,
    mapPool,
    participants: [
      { participantId: teamAId, side: 'a' as const, name: teamAName, source: selected.source },
      { participantId: teamBId, side: 'b' as const, name: teamBName, source: selected.source },
    ],
    players: [...rosterA, ...rosterB],
    sourceLinks: [
      link(selected),
      ...[rosterSnapshotA, rosterSnapshotB]
        .filter((item): item is SourceSnapshotLike => Boolean(item))
        .map((item) => link(item)),
      ...(content ? [link(content)] : []),
    ],
    facts,
    missing,
    conflictFlags,
    completeness: computeCompleteness(
      REQUIRED,
      missing.filter((item) => item !== 'agent_bans'),
    ),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, content?.observedAt].filter((value): value is string => Boolean(value)),
      now,
    ),
    adapterVersion: 'valorant.facts.v2',
  };

  return {
    id: `fm_valorant_${selected.externalId}`,
    ...base,
    dataSnapshotHash: hashNormalizedFacts(base),
  };
}

export function buildValorantFixtureSnapshots(now = new Date()): SourceSnapshotLike[] {
  const observedAt = now.toISOString();
  const startsAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  return [
      {
        game: 'valorant',
        source: 'grid',
        entityType: 'match',
        externalId: 'vct-82',
        name: 'Sentinels vs G2 Esports',
        startsAt,
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
        source: 'valorant-api',
        entityType: 'content',
        externalId: 'val-9.0',
        name: 'Episode 9',
        status: 'current',
        payload: {
          version: '9.0',
          maps: ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Icebox', 'Sunset'],
        },
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
            { nickname: 'Zellsis' },
            { nickname: 'johnqt' },
            { nickname: 'zeybt' },
            { nickname: 'bang' },
            { nickname: 'N4RRATE' },
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
            { nickname: 'leaf' },
            { nickname: 'valyn' },
            { nickname: 'trent' },
            { nickname: 'jawgemo' },
            { nickname: 'JonahP' },
          ],
        },
        observedAt,
      },
  ];
}

export function buildValorantFixtureFacts(now = new Date()): NormalizedMatchFacts {
  return normalizeValorantMatchFacts(buildValorantFixtureSnapshots(now), { now })!;
}

function resolveAgainstRosters(
  teamName: string,
  sourceId: string,
  rosterSnapshots: SourceSnapshotLike[],
) {
  return resolveValorantTeamIdentity(
    { name: teamName, sourceId },
    rosterSnapshots.map((item) => ({
      teamId: item.externalId,
      name: item.name,
      aliases: [String(item.payload.teamName ?? ''), String(item.payload.tag ?? '')].filter(Boolean),
    })),
  );
}

function findRosterSnapshot(
  snapshots: SourceSnapshotLike[],
  teamName: string,
  participantId: string,
  identity: unknown,
): SourceSnapshotLike | undefined {
  const resolvedId =
    identity && typeof identity === 'object'
      ? String((identity as Record<string, unknown>).teamId ?? '')
      : '';
  if (resolvedId) {
    const byId = snapshots.find((item) => item.externalId === resolvedId);
    if (byId) return byId;
  }
  const query = normalizeValorantTeamAlias(teamName);
  return snapshots.find(
    (item) =>
      item.externalId === participantId ||
      item.name.toLowerCase() === teamName.toLowerCase() ||
      normalizeValorantTeamAlias(item.name) === query,
  );
}

function rosterFromSnapshot(
  hit: SourceSnapshotLike | undefined,
  participantId: string,
): NormalizedMatchFacts['players'] {
  if (!hit) return [];
  const players = Array.isArray(hit.payload.players) ? hit.payload.players : [];
  return players.slice(0, 5).map((player, index) => {
    const row = player && typeof player === 'object' ? (player as Record<string, unknown>) : {};
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

function identityStatus(identity: unknown): string {
  if (!identity || typeof identity !== 'object') return 'unmatched';
  return String((identity as Record<string, unknown>).status ?? 'unmatched');
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

function link(item: SourceSnapshotLike) {
  return {
    source: item.source,
    entityType: item.entityType,
    externalId: item.externalId,
    precedence:
      item.source === 'grid' ? 10 : item.source === 'riot' || item.source === 'valorant-api' ? 20 : 30,
    observedAt: item.observedAt,
  };
}

function normalizeFormat(value: unknown): 'BO1' | 'BO3' | 'BO5' {
  const text = String(value ?? 'BO3').toUpperCase();
  if (text.includes('1')) return 'BO1';
  if (text.includes('5')) return 'BO5';
  return 'BO3';
}

function asMapNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      const row = item as Record<string, unknown>;
      return String(row.name ?? row.displayName ?? row.localizedName ?? '');
    })
    .map((item) => item.trim())
    .filter(Boolean);
}
