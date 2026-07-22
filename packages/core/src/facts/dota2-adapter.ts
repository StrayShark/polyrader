import type {
  AnalysisFact,
  NormalizedMatchFacts,
  SourceSnapshotLike,
} from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'team_rating_a',
  'team_rating_b',
  'patch',
];

/** Promote Dota 2 OpenDota/GRID/Liquipedia snapshots into game-neutral facts. */
export function normalizeDota2MatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const matchSnapshots = snapshots.filter((item) => item.game === 'dota2' && item.entityType === 'match');
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'opendota', 'liquipedia']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(payload.radiant_name ?? payload.radiantTeamName ?? payload.teamAName ?? payload.team_a ?? 'Radiant');
  const teamBName = String(payload.dire_name ?? payload.direTeamName ?? payload.teamBName ?? payload.team_b ?? 'Dire');
  const teamAId = String(payload.radiant_team_id ?? payload.radiantTeamId ?? payload.teamAId ?? `${selected.externalId}-a`);
  const teamBId = String(payload.dire_team_id ?? payload.direTeamId ?? payload.teamBId ?? `${selected.externalId}-b`);
  const patch = snapshots.find((item) => item.game === 'dota2' && item.entityType === 'patch');
  const startsAt = selected.startsAt
    || (payload.start_time ? new Date(Number(payload.start_time) * 1000).toISOString() : undefined)
    || String(payload.startsAt ?? new Date().toISOString());

  const teamSnapshots = snapshots.filter((item) => item.game === 'dota2' && item.entityType === 'team');
  const playerSnapshots = snapshots.filter((item) => item.game === 'dota2' && item.entityType === 'player');
  const ratingA = numberOrUndefined(
    payload.radiant_rating ?? payload.teamARating ?? findTeamSnapshot(teamSnapshots, teamAId, teamAName)?.payload.rating,
  );
  const ratingB = numberOrUndefined(
    payload.dire_rating ?? payload.teamBRating ?? findTeamSnapshot(teamSnapshots, teamBId, teamBName)?.payload.rating,
  );
  const rosterA = playersForTeam(playerSnapshots, teamAId, teamAName);
  const rosterB = playersForTeam(playerSnapshots, teamBId, teamBName);
  const relatedTeams = [
    findTeamSnapshot(teamSnapshots, teamAId, teamAName),
    findTeamSnapshot(teamSnapshots, teamBId, teamBName),
  ].filter((item): item is SourceSnapshotLike => Boolean(item));

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (ratingA == null) missing.push('team_rating_a');
  if (ratingB == null) missing.push('team_rating_b');
  if (!patch) missing.push('patch');
  if (!rosterA.length) missing.push('roster_a');
  if (!rosterB.length) missing.push('roster_b');
  missing.push('draft'); // draft remains a placeholder until live draft feeds exist

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
  if (ratingA != null) {
    facts.push({
      factId: 'team-a-rating',
      entityType: 'team',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'rating',
      value: ratingA,
    });
  }
  if (ratingB != null) {
    facts.push({
      factId: 'team-b-rating',
      entityType: 'team',
      source: selected.source,
      observedAt: selected.observedAt,
      field: 'rating',
      value: ratingB,
    });
  }
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

  const base = {
    game: 'dota2' as const,
    externalMatchId: selected.externalId,
    eventId: payload.leagueid || payload.leagueId ? String(payload.leagueid ?? payload.leagueId) : undefined,
    eventName: String(payload.league_name ?? payload.leagueName ?? payload.eventName ?? selected.name),
    startsAt,
    format: 'BO3' as const,
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: patch ? (patch.name || patch.externalId) : undefined,
    mapPool: [],
    participants: [
      {
        participantId: teamAId,
        side: 'a' as const,
        name: teamAName,
        rating: ratingA,
        source: selected.source,
      },
      {
        participantId: teamBId,
        side: 'b' as const,
        name: teamBName,
        rating: ratingB,
        source: selected.source,
      },
    ],
    players: [...rosterA, ...rosterB],
    sourceLinks: [
      ...[selected].map((item) => ({
        source: item.source,
        entityType: item.entityType,
        externalId: item.externalId,
        precedence: precedenceFor(item.source),
        observedAt: item.observedAt,
      })),
      ...relatedTeams.map((item) => ({
        source: item.source,
        entityType: item.entityType,
        externalId: item.externalId,
        precedence: precedenceFor(item.source),
        observedAt: item.observedAt,
      })),
      ...(patch ? [{
        source: patch.source,
        entityType: patch.entityType,
        externalId: patch.externalId,
        precedence: precedenceFor(patch.source),
        observedAt: patch.observedAt,
      }] : []),
    ],
    facts,
    missing,
    conflictFlags: [],
    completeness: computeCompleteness(REQUIRED, missing.filter((item) => item !== 'draft')),
    freshnessSeconds: freshnessSeconds(
      [selected.observedAt, patch?.observedAt].filter((value): value is string => Boolean(value)),
      options?.now,
    ),
    adapterVersion: 'dota2.facts.v1',
  };

  return {
    id: `fm_dota2_${selected.externalId}`,
    ...base,
    dataSnapshotHash: hashNormalizedFacts(base),
  };
}

/** Deterministic Dota fixture used by Validation Lab when live snapshots are empty. */
export function buildDota2FixtureFacts(now = new Date()): NormalizedMatchFacts {
  const observedAt = now.toISOString();
  const snapshots: SourceSnapshotLike[] = [
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'match',
      externalId: '8906069414',
      name: 'Team Liquid vs Team Falcons',
      startsAt: '2026-07-22T10:00:00.000Z',
      status: 'scheduled',
      payload: {
        radiant_name: 'Team Liquid',
        dire_name: 'Team Falcons',
        radiant_team_id: 'liquid',
        dire_team_id: 'falcons',
        radiant_rating: 1542.5,
        dire_rating: 1510.2,
        league_name: 'Example League',
        leagueid: 42,
      },
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'patch',
      externalId: '7.39',
      name: '7.39',
      status: 'current',
      payload: { version: '7.39' },
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'player',
      externalId: 'liquid-1',
      name: 'miCKe',
      status: 'active',
      payload: { account_id: 'liquid-1', name: 'miCKe', team_id: 'liquid', team_name: 'Team Liquid' },
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'player',
      externalId: 'falcons-1',
      name: 'skiter',
      status: 'active',
      payload: { account_id: 'falcons-1', name: 'skiter', team_id: 'falcons', team_name: 'Team Falcons' },
      observedAt,
    },
  ];
  return normalizeDota2MatchFacts(snapshots, { now })!;
}

function pickPreferred(items: SourceSnapshotLike[], order: string[]): SourceSnapshotLike | undefined {
  for (const source of order) {
    const hit = items.find((item) => item.source === source);
    if (hit) return hit;
  }
  return items[0];
}

function precedenceFor(source: string): number {
  if (source === 'grid') return 10;
  if (source === 'opendota') return 20;
  if (source === 'liquipedia') return 30;
  return 100;
}

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function findTeamSnapshot(
  snapshots: SourceSnapshotLike[],
  participantId: string,
  teamName: string,
): SourceSnapshotLike | undefined {
  return snapshots.find((item) =>
    item.externalId === participantId || item.name.toLowerCase() === teamName.toLowerCase(),
  );
}

function playersForTeam(
  snapshots: SourceSnapshotLike[],
  participantId: string,
  teamName: string,
): NormalizedMatchFacts['players'] {
  return snapshots
    .filter((item) => {
      const teamId = String(item.payload.team_id ?? item.payload.teamId ?? '');
      const name = String(item.payload.team_name ?? item.payload.teamName ?? '');
      return teamId === participantId || name.toLowerCase() === teamName.toLowerCase();
    })
    .slice(0, 5)
    .map((item) => ({
      participantId,
      playerId: item.externalId,
      displayName: item.name || String(item.payload.name ?? item.externalId),
      position: item.payload.position ? String(item.payload.position) : undefined,
      isStarter: true,
      source: item.source,
    }));
}
