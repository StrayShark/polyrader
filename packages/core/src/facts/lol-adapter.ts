import type { AnalysisFact, NormalizedMatchFacts, SourceSnapshotLike } from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'patch',
  'roster_a',
  'roster_b',
];

/** Promote LoL GRID / Riot / Liquipedia snapshots into game-neutral facts. */
export function normalizeLolMatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const matchSnapshots = snapshots.filter((item) => item.game === 'lol' && item.entityType === 'match');
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'liquipedia', 'riot']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.teamAName ?? payload.blue_name ?? payload.team_a ?? 'Blue');
  const teamBName = String(payload.teamBName ?? payload.red_name ?? payload.team_b ?? 'Red');
  const teamAId = String(payload.teamAId ?? payload.blue_team_id ?? `${selected.externalId}-a`);
  const teamBId = String(payload.teamBId ?? payload.red_team_id ?? `${selected.externalId}-b`);
  const startsAt = selected.startsAt || String(payload.startsAt ?? payload.date ?? new Date().toISOString());
  const patch = snapshots.find((item) => item.game === 'lol' && item.entityType === 'patch');
  const rosterSnapshots = snapshots.filter((item) => item.game === 'lol' && item.entityType === 'team');
  const rosterSnapshotA = findRosterSnapshot(rosterSnapshots, teamAName, teamAId);
  const rosterSnapshotB = findRosterSnapshot(rosterSnapshots, teamBName, teamBId);
  const rosterA = rosterFromSnapshot(rosterSnapshotA, teamAId);
  const rosterB = rosterFromSnapshot(rosterSnapshotB, teamBId);

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (!patch) missing.push('patch');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  missing.push('draft'); // draft remains placeholder until live draft feeds exist

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
    game: 'lol' as const,
    externalMatchId: selected.externalId,
    eventId: payload.eventId ? String(payload.eventId) : undefined,
    eventName: String(payload.eventName ?? payload.tournament ?? selected.name),
    startsAt,
    format: normalizeFormat(payload.format),
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: patch ? (patch.name || patch.externalId) : undefined,
    mapPool: [],
    participants: [
      { participantId: teamAId, side: 'a' as const, name: teamAName, source: selected.source },
      { participantId: teamBId, side: 'b' as const, name: teamBName, source: selected.source },
    ],
    players: [...rosterA, ...rosterB],
    sourceLinks: [
      link(selected),
      ...[rosterSnapshotA, rosterSnapshotB].filter((item): item is SourceSnapshotLike => Boolean(item)).map((item) => link(item)),
      ...(patch ? [link(patch)] : []),
    ],
    facts,
    missing,
    conflictFlags: [],
    completeness: computeCompleteness(REQUIRED, missing.filter((item) => item !== 'draft')),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, patch?.observedAt].filter((value): value is string => Boolean(value)),
      options?.now,
    ),
    adapterVersion: 'lol.facts.v1',
  };

  return { id: `fm_lol_${selected.externalId}`, ...base, dataSnapshotHash: hashNormalizedFacts(base) };
}

export function buildLolFixtureFacts(now = new Date()): NormalizedMatchFacts {
  const observedAt = now.toISOString();
  return normalizeLolMatchFacts([
    {
      game: 'lol',
      source: 'grid',
      entityType: 'match',
      externalId: 'lck-104',
      name: 'T1 vs Hanwha Life Esports',
      startsAt: '2026-07-22T11:00:00.000Z',
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
    precedence: item.source === 'grid' ? 10 : item.source === 'riot-data-dragon' || item.source === 'riot' ? 20 : 30,
    observedAt: item.observedAt,
  };
}

function normalizeFormat(value: unknown): 'BO1' | 'BO3' | 'BO5' {
  const text = String(value ?? 'BO3').toUpperCase();
  if (text.includes('1')) return 'BO1';
  if (text.includes('5')) return 'BO5';
  return 'BO3';
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
