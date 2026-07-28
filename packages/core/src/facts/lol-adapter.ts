import type {
  AnalysisFact,
  NormalizedMatchFacts,
  RiotGameDataQuality,
  RiotGameFieldQuality,
  SourceSnapshotLike,
} from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';
import { normalizeLolTeamAlias, resolveLolTeamIdentity } from './lol-identity';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'patch',
  'roster_a',
  'roster_b',
];
const FIELD_FRESHNESS_SECONDS = 6 * 60 * 60;

/** Promote LoL GRID / Riot / Liquipedia snapshots into game-neutral facts. */
export function normalizeLolMatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const now = options?.now ?? new Date();
  const matchSnapshots = snapshots.filter(
    (item) => item.game === 'lol' && item.entityType === 'match',
  );
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'liquipedia', 'riot']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.teamAName ?? payload.blue_name ?? payload.team_a ?? 'Blue');
  const teamBName = String(payload.teamBName ?? payload.red_name ?? payload.team_b ?? 'Red');
  const teamAId = String(payload.teamAId ?? payload.blue_team_id ?? `${selected.externalId}-a`);
  const teamBId = String(payload.teamBId ?? payload.red_team_id ?? `${selected.externalId}-b`);
  const startsAt =
    selected.startsAt || String(payload.startsAt ?? payload.date ?? new Date().toISOString());
  const patch = snapshots.find((item) => item.game === 'lol' && item.entityType === 'patch');
  const rosterSnapshots = snapshots.filter(
    (item) => item.game === 'lol' && item.entityType === 'team',
  );
  const identityA = payload.teamAIdentity ?? resolveAgainstRosters(teamAName, teamAId, rosterSnapshots);
  const identityB = payload.teamBIdentity ?? resolveAgainstRosters(teamBName, teamBId, rosterSnapshots);
  const rosterSnapshotA = findRosterSnapshot(rosterSnapshots, teamAName, teamAId, identityA);
  const rosterSnapshotB = findRosterSnapshot(rosterSnapshots, teamBName, teamBId, identityB);
  const rosterA = rosterFromSnapshot(rosterSnapshotA, teamAId);
  const rosterB = rosterFromSnapshot(rosterSnapshotB, teamBId);

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (!patch) missing.push('patch');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  missing.push('draft');

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
  if (patch) {
    facts.push({
      factId: 'patch-version',
      entityType: 'patch',
      source: patch.source,
      observedAt: patch.observedAt,
      field: 'version',
      value: patch.name || patch.externalId,
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
    contractVersion: 'lol-quality.v1',
    now,
    patch,
    mapPoolAvailable: false,
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
    factId: 'lol-data-quality',
    entityType: 'quality',
    source: selected.source,
    observedAt: selected.observedAt,
    field: 'quality',
    value: quality,
  });

  const base = {
    game: 'lol' as const,
    externalMatchId: selected.externalId,
    eventId: payload.eventId ? String(payload.eventId) : undefined,
    eventName: String(payload.eventName ?? payload.tournament ?? selected.name),
    startsAt,
    format: normalizeFormat(payload.format),
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: patch ? patch.name || patch.externalId : undefined,
    mapPool: [],
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
      ...(patch ? [link(patch)] : []),
    ],
    facts,
    missing,
    conflictFlags,
    completeness: computeCompleteness(
      REQUIRED,
      missing.filter((item) => item !== 'draft'),
    ),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, patch?.observedAt].filter((value): value is string => Boolean(value)),
      now,
    ),
    adapterVersion: 'lol.facts.v2',
  };

  return {
    id: `fm_lol_${selected.externalId}`,
    ...base,
    dataSnapshotHash: hashNormalizedFacts(base),
  };
}

export function buildLolFixtureSnapshots(now = new Date()): SourceSnapshotLike[] {
  const observedAt = now.toISOString();
  const startsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  return [
      {
        game: 'lol',
        source: 'grid',
        entityType: 'match',
        externalId: 'lck-104',
        name: 'T1 vs Hanwha Life Esports',
        startsAt,
        status: 'scheduled',
        payload: {
          teamAName: 'T1',
          teamBName: 'Hanwha Life Esports',
          teamAId: 't1',
          teamBId: 'hle',
          format: 'BO3',
          eventName: 'LCK',
          eventId: 'lck-2026-summer',
        },
        observedAt,
      },
      {
        game: 'lol',
        source: 'riot-data-dragon',
        entityType: 'patch',
        externalId: '14.14',
        name: '14.14',
        status: 'current',
        payload: { version: '14.14' },
        observedAt,
      },
      {
        game: 'lol',
        source: 'liquipedia',
        entityType: 'team',
        externalId: 't1',
        name: 'T1',
        status: 'active',
        payload: {
          players: [
            { nickname: 'Doran', role: 'TOP' },
            { nickname: 'Oner', role: 'JGL' },
            { nickname: 'Faker', role: 'MID' },
            { nickname: 'Gumayusi', role: 'BOT' },
            { nickname: 'Keria', role: 'SUP' },
          ],
        },
        observedAt,
      },
      {
        game: 'lol',
        source: 'liquipedia',
        entityType: 'team',
        externalId: 'hle',
        name: 'Hanwha Life Esports',
        status: 'active',
        payload: {
          players: [
            { nickname: 'Zeus', role: 'TOP' },
            { nickname: 'Peanut', role: 'JGL' },
            { nickname: 'Zeka', role: 'MID' },
            { nickname: 'Viper', role: 'BOT' },
            { nickname: 'Delight', role: 'SUP' },
          ],
        },
        observedAt,
      },
  ];
}

export function buildLolFixtureFacts(now = new Date()): NormalizedMatchFacts {
  return normalizeLolMatchFacts(buildLolFixtureSnapshots(now), { now })!;
}

export function buildRiotGameDataQuality(input: {
  contractVersion: RiotGameDataQuality['contractVersion'];
  now: Date;
  patch?: SourceSnapshotLike;
  mapPoolAvailable: boolean;
  mapPoolSource?: SourceSnapshotLike;
  sides: Array<{
    side: 'a' | 'b';
    participantId: string;
    name: string;
    identity: unknown;
    rosterSnapshot?: SourceSnapshotLike;
    rosterCount: number;
  }>;
}): RiotGameDataQuality {
  const sides = input.sides.map((side) => {
    const fields: RiotGameFieldQuality[] = [
      identityField(side.identity),
      rosterField(side.rosterSnapshot, side.rosterCount, input.now),
    ];
    return {
      side: side.side,
      participantId: side.participantId,
      name: side.name,
      complete: fields.every((field) => field.status !== 'missing' && field.status !== 'conflict'),
      fresh: fields.every((field) => field.status === 'available'),
      fields,
    };
  });
  const match: RiotGameDataQuality['match'] = {};
  if (input.contractVersion === 'lol-quality.v1') {
    match.patch = staticField('patch', input.patch, Boolean(input.patch), input.now, 'PATCH_MISSING');
  } else {
    match.mapPool = staticField(
      'map_pool',
      input.mapPoolSource ?? input.patch,
      input.mapPoolAvailable,
      input.now,
      'MAP_POOL_MISSING',
    );
  }
  return {
    contractVersion: input.contractVersion,
    freshnessLimitSeconds: FIELD_FRESHNESS_SECONDS,
    bothTeamsComplete: sides.every((side) => side.complete),
    bothTeamsFresh: sides.every((side) => side.fresh),
    sides,
    match,
  };
}

function resolveAgainstRosters(
  teamName: string,
  sourceId: string,
  rosterSnapshots: SourceSnapshotLike[],
) {
  return resolveLolTeamIdentity(
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
  const resolvedId = identityTeamId(identity);
  if (resolvedId) {
    const byId = snapshots.find((item) => item.externalId === resolvedId);
    if (byId) return byId;
  }
  const query = normalizeLolTeamAlias(teamName);
  return snapshots.find(
    (item) =>
      item.externalId === participantId ||
      item.name.toLowerCase() === teamName.toLowerCase() ||
      normalizeLolTeamAlias(item.name) === query,
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

function identityField(identity: unknown): RiotGameFieldQuality {
  const status = identityStatus(identity);
  if (status === 'matched') {
    return { field: 'identity', status: 'available', reason: 'matched' };
  }
  if (status === 'ambiguous') {
    return { field: 'identity', status: 'conflict', reason: 'IDENTITY_AMBIGUOUS' };
  }
  return { field: 'identity', status: 'missing', reason: 'IDENTITY_UNMATCHED' };
}

function rosterField(
  snapshot: SourceSnapshotLike | undefined,
  count: number,
  now: Date,
): RiotGameFieldQuality {
  if (!snapshot || count < 5) {
    return {
      field: 'roster',
      status: 'missing',
      source: snapshot?.source,
      observedAt: snapshot?.observedAt,
      reason: count > 0 ? 'ROSTER_INCOMPLETE' : 'ROSTER_MISSING',
    };
  }
  const ageSeconds = ageOf(snapshot.observedAt, now);
  if (ageSeconds != null && ageSeconds > FIELD_FRESHNESS_SECONDS) {
    return {
      field: 'roster',
      status: 'stale',
      source: snapshot.source,
      observedAt: snapshot.observedAt,
      ageSeconds,
      reason: 'ROSTER_STALE',
    };
  }
  return {
    field: 'roster',
    status: 'available',
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    ageSeconds: ageSeconds ?? undefined,
  };
}

function staticField(
  field: 'patch' | 'map_pool',
  snapshot: SourceSnapshotLike | undefined,
  available: boolean,
  now: Date,
  missingReason: string,
): RiotGameFieldQuality {
  if (!available || !snapshot) {
    return { field, status: 'missing', reason: missingReason };
  }
  const ageSeconds = ageOf(snapshot.observedAt, now);
  if (ageSeconds != null && ageSeconds > FIELD_FRESHNESS_SECONDS) {
    return {
      field,
      status: 'stale',
      source: snapshot.source,
      observedAt: snapshot.observedAt,
      ageSeconds,
      reason: `${field.toUpperCase()}_STALE`,
    };
  }
  return {
    field,
    status: 'available',
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    ageSeconds: ageSeconds ?? undefined,
  };
}

function identityStatus(identity: unknown): string {
  if (!identity || typeof identity !== 'object') return 'unmatched';
  return String((identity as Record<string, unknown>).status ?? 'unmatched');
}

function identityTeamId(identity: unknown): string | undefined {
  if (!identity || typeof identity !== 'object') return undefined;
  const teamId = (identity as Record<string, unknown>).teamId;
  return typeof teamId === 'string' && teamId ? teamId : undefined;
}

function ageOf(observedAt: string | undefined, now: Date): number | null {
  const ts = Date.parse(observedAt ?? '');
  return Number.isFinite(ts) ? Math.max(0, Math.floor((now.getTime() - ts) / 1000)) : null;
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
      item.source === 'grid'
        ? 10
        : item.source === 'riot-data-dragon' || item.source === 'riot'
          ? 20
          : 30,
    observedAt: item.observedAt,
  };
}

function normalizeFormat(value: unknown): 'BO1' | 'BO3' | 'BO5' {
  const text = String(value ?? 'BO3').toUpperCase();
  if (text.includes('1')) return 'BO1';
  if (text.includes('5')) return 'BO5';
  return 'BO3';
}
