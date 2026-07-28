import type {
  AnalysisFact,
  DotaDataQuality,
  DotaFieldQuality,
  NormalizedMatchFacts,
  SourceSnapshotLike,
} from './types';
import { computeCompleteness, freshnessSeconds, hashNormalizedFacts } from './types';
import { resolveDotaTeamIdentity } from './dota2-identity';

const REQUIRED = [
  'match',
  'participant_a',
  'participant_b',
  'starts_at',
  'team_rating_a',
  'team_rating_b',
  'patch',
  'roster_a',
  'roster_b',
  'recent_form_a',
  'recent_form_b',
  'player_metrics_a',
  'player_metrics_b',
  'hero_pool_a',
  'hero_pool_b',
  'draft_context',
];

const FIELD_FRESHNESS_SECONDS = 6 * 60 * 60;

/** Promote Dota 2 OpenDota/GRID/Liquipedia snapshots into game-neutral facts. */
export function normalizeDota2MatchFacts(
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  const matchSnapshots = snapshots.filter(
    (item) => item.game === 'dota2' && item.entityType === 'match',
  );
  const selected = options?.matchExternalId
    ? matchSnapshots.find((item) => item.externalId === options.matchExternalId)
    : pickPreferred(matchSnapshots, ['grid', 'opendota', 'liquipedia']);
  if (!selected) return null;

  const payload = selected.payload;
  const teamAName = String(
    payload.radiant_name ??
      payload.radiantTeamName ??
      payload.teamAName ??
      payload.team_a ??
      'Radiant',
  );
  const teamBName = String(
    payload.dire_name ?? payload.direTeamName ?? payload.teamBName ?? payload.team_b ?? 'Dire',
  );
  const sourceTeamAId = String(
    payload.radiant_team_id ??
      payload.radiantTeamId ??
      payload.teamAId ??
      `${selected.externalId}-a`,
  );
  const sourceTeamBId = String(
    payload.dire_team_id ?? payload.direTeamId ?? payload.teamBId ?? `${selected.externalId}-b`,
  );
  const teamAId = String(payload.teamAOpenDotaId ?? sourceTeamAId);
  const teamBId = String(payload.teamBOpenDotaId ?? sourceTeamBId);
  const patchId = String(payload.patchId ?? payload.patch ?? '');
  const patchSnapshots = snapshots.filter(
    (item) => item.game === 'dota2' && item.entityType === 'patch',
  );
  const patch =
    patchSnapshots.find((item) => item.externalId === patchId) ??
    (isUpcomingStatus(selected.status) ? patchSnapshots[0] : undefined);
  const startsAt =
    selected.startsAt ||
    (payload.start_time ? new Date(Number(payload.start_time) * 1000).toISOString() : undefined) ||
    String(payload.startsAt ?? new Date().toISOString());

  const teamSnapshots = snapshots.filter(
    (item) => item.game === 'dota2' && item.entityType === 'team',
  );
  const playerSnapshots = snapshots.filter(
    (item) => item.game === 'dota2' && item.entityType === 'player',
  );
  const teamContextA = findTeamContext(teamSnapshots, teamAId, sourceTeamAId, teamAName);
  const teamContextB = findTeamContext(teamSnapshots, teamBId, sourceTeamBId, teamBName);
  const teamSnapshotA = teamContextA.rating ?? teamContextA.primary;
  const teamSnapshotB = teamContextB.rating ?? teamContextB.primary;
  const ratingA = numberOrUndefined(
    payload.radiant_rating ?? payload.teamARating ?? teamSnapshotA?.payload.rating,
  );
  const ratingB = numberOrUndefined(
    payload.dire_rating ?? payload.teamBRating ?? teamSnapshotB?.payload.rating,
  );
  const rosterA = rosterForTeam(teamContextA.rosters, playerSnapshots, teamAId, teamAName);
  const rosterB = rosterForTeam(teamContextB.rosters, playerSnapshots, teamBId, teamBName);
  const relatedTeams = [...teamContextA.matches, ...teamContextB.matches].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) => candidate.source === item.source && candidate.externalId === item.externalId,
      ) === index,
  );
  const relatedPlayers = playerSnapshots.filter((item) => {
    const teamId = String(item.payload.team_id ?? item.payload.teamId ?? '');
    const teamName = String(item.payload.team_name ?? item.payload.teamName ?? '');
    return (
      teamId === teamAId ||
      teamId === teamBId ||
      teamName.toLowerCase() === teamAName.toLowerCase() ||
      teamName.toLowerCase() === teamBName.toLowerCase()
    );
  });
  const formA = recordValue(teamContextA.primary);
  const formB = recordValue(teamContextB.primary);
  const playerMetricsA = playerMetricValue(
    teamContextA.primary,
    relatedPlayers,
    teamAId,
    teamAName,
  );
  const playerMetricsB = playerMetricValue(
    teamContextB.primary,
    relatedPlayers,
    teamBId,
    teamBName,
  );
  const heroPoolA = recordArray(teamContextA.primary?.payload.heroPool);
  const heroPoolB = recordArray(teamContextB.primary?.payload.heroPool);
  const draft = draftContext(payload, selected.status);

  const missing: string[] = [];
  if (!startsAt) missing.push('starts_at');
  if (ratingA == null) missing.push('team_rating_a');
  if (ratingB == null) missing.push('team_rating_b');
  if (!patch) missing.push('patch');
  if (rosterA.length < 5) missing.push('roster_a');
  if (rosterB.length < 5) missing.push('roster_b');
  if (!formA) missing.push('recent_form_a');
  if (!formB) missing.push('recent_form_b');
  if (playerMetricsA.length < 5) missing.push('player_metrics_a');
  if (playerMetricsB.length < 5) missing.push('player_metrics_b');
  if (!heroPoolA.length) missing.push('hero_pool_a');
  if (!heroPoolB.length) missing.push('hero_pool_b');
  if (!draft) missing.push('draft_context');

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
      source: teamSnapshotA?.source ?? selected.source,
      observedAt: teamSnapshotA?.observedAt ?? selected.observedAt,
      field: 'rating',
      value: ratingA,
    });
  }
  if (ratingB != null) {
    facts.push({
      factId: 'team-b-rating',
      entityType: 'team',
      source: teamSnapshotB?.source ?? selected.source,
      observedAt: teamSnapshotB?.observedAt ?? selected.observedAt,
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
  if (rosterA.length) {
    facts.push({
      factId: 'team-a-roster',
      entityType: 'roster',
      source: [...new Set(rosterA.map((player) => player.source))].join('+'),
      observedAt:
        newestObservedAt(teamContextA.rosters, newestObservedAt(relatedPlayers, selected.observedAt)),
      field: 'players',
      value: rosterA.map((player) => player.displayName),
    });
  }
  if (rosterB.length) {
    facts.push({
      factId: 'team-b-roster',
      entityType: 'roster',
      source: [...new Set(rosterB.map((player) => player.source))].join('+'),
      observedAt:
        newestObservedAt(teamContextB.rosters, newestObservedAt(relatedPlayers, selected.observedAt)),
      field: 'players',
      value: rosterB.map((player) => player.displayName),
    });
  }
  appendTeamRecord(facts, 'a', teamSnapshotA);
  appendTeamRecord(facts, 'b', teamSnapshotB);
  appendRecentForm(facts, 'a', teamContextA.primary, formA);
  appendRecentForm(facts, 'b', teamContextB.primary, formB);
  appendPlayerMetrics(facts, 'a', teamContextA.primary, playerMetricsA);
  appendPlayerMetrics(facts, 'b', teamContextB.primary, playerMetricsB);
  appendHeroPool(facts, 'a', teamContextA.primary, heroPoolA);
  appendHeroPool(facts, 'b', teamContextB.primary, heroPoolB);
  if (draft) {
    facts.push({
      factId: 'draft-context',
      entityType: 'draft',
      source: selected.source,
      observedAt: selected.observedAt,
      field: draft.status === 'available' ? 'picks_bans' : 'status',
      value: draft.status === 'available' ? draft.actions : draft.status,
    });
  }

  const now = options?.now ?? new Date();
  const quality = buildDotaDataQuality({
    selected,
    patch,
    now,
    sides: [
      {
        side: 'a',
        participantId: teamAId,
        name: teamAName,
        identity: payload.teamAIdentity,
        targetEnrichment: targetEnrichment(teamSnapshotA),
        rating: qualityField('rating', teamSnapshotA, ratingA != null, now, 'TEAM_RATING_MISSING'),
        form: qualityField(
          'recent_form',
          teamContextA.primary,
          Boolean(formA),
          now,
          'RECENT_FORM_MISSING',
        ),
        roster: rosterQualityField(
          teamContextA.rosters,
          playerSourceForTeam(relatedPlayers, teamAId, teamAName),
          rosterA.length >= 5,
          now,
          rosterA.length ? 'ROSTER_INCOMPLETE' : 'ROSTER_MISSING',
        ),
        metrics: qualityField(
          'player_metrics',
          teamContextA.primary,
          playerMetricsA.length >= 5,
          now,
          playerMetricsA.length ? 'PLAYER_METRICS_INCOMPLETE' : 'PLAYER_METRICS_MISSING',
        ),
        heroes: qualityField(
          'hero_pool',
          teamContextA.primary,
          heroPoolA.length > 0,
          now,
          'HERO_POOL_MISSING',
        ),
      },
      {
        side: 'b',
        participantId: teamBId,
        name: teamBName,
        identity: payload.teamBIdentity,
        targetEnrichment: targetEnrichment(teamSnapshotB),
        rating: qualityField('rating', teamSnapshotB, ratingB != null, now, 'TEAM_RATING_MISSING'),
        form: qualityField(
          'recent_form',
          teamContextB.primary,
          Boolean(formB),
          now,
          'RECENT_FORM_MISSING',
        ),
        roster: rosterQualityField(
          teamContextB.rosters,
          playerSourceForTeam(relatedPlayers, teamBId, teamBName),
          rosterB.length >= 5,
          now,
          rosterB.length ? 'ROSTER_INCOMPLETE' : 'ROSTER_MISSING',
        ),
        metrics: qualityField(
          'player_metrics',
          teamContextB.primary,
          playerMetricsB.length >= 5,
          now,
          playerMetricsB.length ? 'PLAYER_METRICS_INCOMPLETE' : 'PLAYER_METRICS_MISSING',
        ),
        heroes: qualityField(
          'hero_pool',
          teamContextB.primary,
          heroPoolB.length > 0,
          now,
          'HERO_POOL_MISSING',
        ),
      },
    ],
  });
  facts.push({
    factId: 'dota-data-quality',
    entityType: 'quality',
    source: selected.source,
    observedAt: selected.observedAt,
    field: 'field_evidence',
    value: quality,
  });

  const conflictFlags: NormalizedMatchFacts['conflictFlags'] = [];
  if (quality.sides.some((side) => side.fields.some((field) => field.status === 'conflict'))) {
    conflictFlags.push('identity_collision');
  }
  if (quality.sides.some((side) => side.fields.some((field) => field.status === 'stale'))) {
    conflictFlags.push('stale_source');
  }
  if (rostersConflict(teamContextA.matches) || rostersConflict(teamContextB.matches)) {
    conflictFlags.push('roster_mismatch');
  }

  const base = {
    game: 'dota2' as const,
    externalMatchId: selected.externalId,
    eventId:
      payload.leagueid || payload.leagueId
        ? String(payload.leagueid ?? payload.leagueId)
        : undefined,
    eventName: String(
      payload.league_name ?? payload.leagueName ?? payload.eventName ?? selected.name,
    ),
    startsAt,
    format: normalizeDotaFormat(payload, selected.source),
    status: selected.status || String(payload.status ?? 'scheduled'),
    patchVersion: patch ? patch.name || patch.externalId : undefined,
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
      ...relatedPlayers.map((item) => ({
        source: item.source,
        entityType: item.entityType,
        externalId: item.externalId,
        precedence: precedenceFor(item.source),
        observedAt: item.observedAt,
      })),
      ...(patch
        ? [
            {
              source: patch.source,
              entityType: patch.entityType,
              externalId: patch.externalId,
              precedence: precedenceFor(patch.source),
              observedAt: patch.observedAt,
            },
          ]
        : []),
    ],
    facts,
    missing,
    conflictFlags,
    completeness: computeCompleteness(REQUIRED, missing),
    freshnessSeconds: freshnessSeconds(
      [
        selected.observedAt,
        patch?.observedAt,
        ...relatedTeams.map((item) => item.observedAt),
        ...relatedPlayers.map((item) => item.observedAt),
      ].filter((value): value is string => Boolean(value)),
      now,
    ),
    adapterVersion: 'dota2.facts.v3',
  };

  return {
    id: `fm_dota2_${selected.externalId}`,
    ...base,
    dataSnapshotHash: hashNormalizedFacts(base),
  };
}

/** Deterministic Dota source snapshots for Validation Lab and release-gate seeding. */
export function buildDota2FixtureSnapshots(now = new Date()): SourceSnapshotLike[] {
  const observedAt = now.toISOString();
  const startsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  return [
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'match',
      externalId: '8906069414',
      name: 'Team Liquid vs Team Falcons',
      startsAt,
      status: 'scheduled',
      payload: {
        radiant_name: 'Team Liquid',
        dire_name: 'Team Falcons',
        radiant_team_id: 'liquid',
        dire_team_id: 'falcons',
        radiant_rating: 1542.5,
        dire_rating: 1510.2,
        league_name: 'Deterministic Dota Practice League',
        leagueid: 42,
        seriesType: 0,
      },
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'patch',
      externalId: '60',
      name: '7.41',
      status: 'current',
      payload: { id: 60, name: '7.41' },
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'team',
      externalId: 'liquid',
      name: 'Team Liquid',
      status: 'active',
      payload: fixtureTeamPayload('liquid', 'Team Liquid', 1542.5, 28, 12, [1, 2, 3, 4, 5]),
      observedAt,
    },
    {
      game: 'dota2',
      source: 'opendota',
      entityType: 'team',
      externalId: 'falcons',
      name: 'Team Falcons',
      status: 'active',
      payload: fixtureTeamPayload('falcons', 'Team Falcons', 1510.2, 24, 15, [6, 7, 8, 9, 10]),
      observedAt,
    },
    ...fixturePlayers(
      'liquid',
      'Team Liquid',
      ['miCKe', 'Nisha', 'SaberLight', 'Boxi', 'Insania'],
      observedAt,
    ),
    ...fixturePlayers(
      'falcons',
      'Team Falcons',
      ['skiter', 'Malr1ne', 'ATF', 'Cr1t-', 'Sneyking'],
      observedAt,
    ),
  ];
}

/** Deterministic Dota fixture used by Validation Lab when live snapshots are empty. */
export function buildDota2FixtureFacts(now = new Date()): NormalizedMatchFacts {
  return normalizeDota2MatchFacts(buildDota2FixtureSnapshots(now), { now })!;
}

function fixturePlayers(
  teamId: string,
  teamName: string,
  names: string[],
  observedAt: string,
): SourceSnapshotLike[] {
  return names.map((name, index) => ({
    game: 'dota2',
    source: 'opendota',
    entityType: 'player',
    externalId: `${teamId}-${index + 1}`,
    name,
    status: 'active',
    payload: {
      accountId: `${teamId}-${index + 1}`,
      nickname: name,
      teamId,
      teamName,
      playerSlot: teamId === 'liquid' ? index : 128 + index,
      kills: 6 + index,
      deaths: 3 + (index % 2),
      assists: 8 + index,
      goldPerMinute: 420 + index * 35,
      xpPerMinute: 500 + index * 30,
      heroId: index + 1,
    },
    observedAt,
  }));
}

function fixtureTeamPayload(
  teamId: string,
  name: string,
  rating: number,
  wins: number,
  losses: number,
  heroIds: number[],
): Record<string, unknown> {
  return {
    teamId,
    name,
    rating,
    wins,
    losses,
    form: { sampleSize: 5, wins: 3, losses: 2, winRate: 0.6, streak: 1 },
    recentMatches: Array.from({ length: 5 }, (_, index) => ({
      matchId: `${teamId}-recent-${index + 1}`,
      opponentName: `Opponent ${index + 1}`,
      result: index < 3 ? 'win' : 'loss',
    })),
    heroPool: heroIds.map((heroId, index) => ({
      heroId,
      matches: 3 + index,
      wins: 2,
      winRate: 2 / (3 + index),
    })),
    playerMetrics: heroIds.map((heroId, index) => ({
      accountId: `${teamId}-${index + 1}`,
      nickname: `${name} Player ${index + 1}`,
      heroId,
      matches: 3,
      kills: 6 + index,
      deaths: 3,
      assists: 10 + index,
      goldPerMinute: 480 + index * 25,
      xpPerMinute: 540 + index * 20,
    })),
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
  if (source === 'opendota') return 20;
  if (source === 'liquipedia') return 30;
  return 100;
}

function normalizeDotaFormat(
  payload: Record<string, unknown>,
  source: string,
): 'BO1' | 'BO3' | 'BO5' {
  const explicit = String(payload.format ?? '').toUpperCase();
  if (explicit.includes('5')) return 'BO5';
  if (explicit.includes('3')) return 'BO3';
  if (explicit.includes('1')) return 'BO1';
  const seriesType = Number(payload.seriesType ?? payload.series_type);
  if (seriesType === 2) return 'BO5';
  if (seriesType === 1) return 'BO3';
  // OpenDota /proMatches rows represent individual games, not complete series.
  return source === 'opendota' ? 'BO1' : 'BO3';
}

function isUpcomingStatus(status: string | undefined): boolean {
  return ['scheduled', 'upcoming', 'pre_match'].includes(String(status ?? ''));
}

function draftContext(
  payload: Record<string, unknown>,
  status: string | undefined,
):
  | { status: 'available'; actions: Array<Record<string, unknown>> }
  | { status: 'not_started' }
  | null {
  const actions = asRecordArray(payload.picksBans ?? payload.picks_bans ?? payload.draft);
  if (actions.length > 0) return { status: 'available', actions };
  return isUpcomingStatus(status) ? { status: 'not_started' } : null;
}

function appendTeamRecord(
  facts: AnalysisFact[],
  side: 'a' | 'b',
  snapshot: SourceSnapshotLike | undefined,
): void {
  if (!snapshot) return;
  const wins = numberOrUndefined(snapshot.payload.wins);
  const losses = numberOrUndefined(snapshot.payload.losses);
  if (wins == null && losses == null) return;
  facts.push({
    factId: `team-${side}-record`,
    entityType: 'match_history',
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    field: 'record',
    value: {
      wins: wins ?? 0,
      losses: losses ?? 0,
      winRate: wins != null && losses != null && wins + losses > 0 ? wins / (wins + losses) : null,
    },
  });
}

function appendRecentForm(
  facts: AnalysisFact[],
  side: 'a' | 'b',
  snapshot: SourceSnapshotLike | undefined,
  form: Record<string, unknown> | undefined,
): void {
  if (!snapshot || !form) return;
  facts.push({
    factId: `team-${side}-recent-form`,
    entityType: 'match_history',
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    field: 'recent_form',
    value: form,
  });
}

function appendPlayerMetrics(
  facts: AnalysisFact[],
  side: 'a' | 'b',
  snapshot: SourceSnapshotLike | undefined,
  metrics: Array<Record<string, unknown>>,
): void {
  if (metrics.length === 0) return;
  facts.push({
    factId: `team-${side}-player-stats`,
    entityType: 'player',
    source: snapshot?.source ?? 'opendota',
    observedAt: snapshot?.observedAt ?? new Date(0).toISOString(),
    field: 'recent_match_metrics',
    value: metrics,
  });
}

function appendHeroPool(
  facts: AnalysisFact[],
  side: 'a' | 'b',
  snapshot: SourceSnapshotLike | undefined,
  heroPool: Array<Record<string, unknown>>,
): void {
  if (!snapshot || heroPool.length === 0) return;
  facts.push({
    factId: `team-${side}-hero-pool`,
    entityType: 'hero_pool',
    source: snapshot.source,
    observedAt: snapshot.observedAt,
    field: 'recent_heroes',
    value: heroPool,
  });
}

function newestObservedAt(snapshots: SourceSnapshotLike[], fallback: string): string {
  return snapshots.reduce(
    (latest, item) => (Date.parse(item.observedAt) > Date.parse(latest) ? item.observedAt : latest),
    fallback,
  );
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

interface TeamContext {
  matches: SourceSnapshotLike[];
  primary?: SourceSnapshotLike;
  rating?: SourceSnapshotLike;
  roster?: SourceSnapshotLike;
  rosters: SourceSnapshotLike[];
}

function findTeamContext(
  snapshots: SourceSnapshotLike[],
  participantId: string,
  sourceParticipantId: string,
  teamName: string,
): TeamContext {
  const matches = snapshots.filter((item) => {
    if (item.externalId === participantId || item.externalId === sourceParticipantId) return true;
    return (
      resolveDotaTeamIdentity({ name: teamName, sourceId: participantId }, [
        {
          teamId: item.externalId,
          name: item.name,
          tag: String(item.payload.tag ?? ''),
          aliases: stringArray(item.payload.aliases),
        },
      ]).status === 'matched'
    );
  });
  const bySource = (a: SourceSnapshotLike, b: SourceSnapshotLike) =>
    precedenceFor(a.source) - precedenceFor(b.source);
  const rosters = [...matches]
    .filter((item) => rosterRows(item).length > 0)
    .sort((a, b) => rosterSourcePrecedence(a.source) - rosterSourcePrecedence(b.source));
  return {
    matches,
    primary: [...matches].sort((a, b) => {
      const aScore = enrichmentScore(a);
      const bScore = enrichmentScore(b);
      return bScore - aScore || bySource(a, b);
    })[0],
    rating: [...matches]
      .filter((item) => numberOrUndefined(item.payload.rating) != null)
      .sort(bySource)[0],
    roster: rosters[0],
    rosters,
  };
}

function rosterForTeam(
  teamSnapshots: SourceSnapshotLike[],
  playerSnapshots: SourceSnapshotLike[],
  participantId: string,
  teamName: string,
): NormalizedMatchFacts['players'] {
  const merged: NormalizedMatchFacts['players'] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const add = (input: NormalizedMatchFacts['players'][number]) => {
    const stableId = normalizePlayerIdentity(input.playerId);
    const normalizedName = normalizePlayerIdentity(input.displayName);
    if ((stableId && ids.has(stableId)) || (normalizedName && names.has(normalizedName))) return;
    if (stableId) ids.add(stableId);
    if (normalizedName) names.add(normalizedName);
    merged.push(input);
  };

  for (const teamSnapshot of teamSnapshots) {
    rosterRows(teamSnapshot)
      .filter(isCurrentRosterRow)
      .forEach((row, index) => {
        const displayName = String(row.nickname ?? row.name ?? `Player ${index + 1}`);
        add({
          participantId,
          playerId: String(
            row.accountId ?? row.playerId ?? row.id ?? `${participantId}-${normalizePlayerIdentity(displayName)}`,
          ),
          displayName,
          position: row.position || row.role ? String(row.position ?? row.role) : undefined,
          isStarter: !['substitute', 'sub'].includes(String(row.status ?? '').toLowerCase()),
          source: teamSnapshot.source,
        });
      });
  }

  playerSnapshots
    .filter((item) => {
      const teamId = String(item.payload.team_id ?? item.payload.teamId ?? '');
      const name = String(item.payload.team_name ?? item.payload.teamName ?? '');
      return (
        String(item.status ?? 'active') === 'active' &&
        (teamId === participantId || name.toLowerCase() === teamName.toLowerCase())
      );
    })
    .forEach((item) =>
      add({
        participantId,
        playerId: item.externalId,
        displayName: item.name || String(item.payload.name ?? item.externalId),
        position: item.payload.position ? String(item.payload.position) : undefined,
        isStarter: true,
        source: item.source,
      }),
    );
  return merged.sort((a, b) => Number(b.isStarter) - Number(a.isStarter)).slice(0, 5);
}

function isCurrentRosterRow(row: Record<string, unknown>): boolean {
  return !['inactive', 'coach', 'former', 'left'].includes(
    String(row.status ?? 'active').toLowerCase(),
  );
}

function normalizePlayerIdentity(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function rosterRows(snapshot: SourceSnapshotLike | undefined): Array<Record<string, unknown>> {
  if (!snapshot) return [];
  const rows = snapshot.payload.roster ?? snapshot.payload.players;
  return recordArray(rows);
}

function recordValue(
  snapshot: SourceSnapshotLike | undefined,
): Record<string, unknown> | undefined {
  if (!snapshot) return undefined;
  const explicit = asRecord(snapshot.payload.form);
  if (explicit) {
    const recentMatches = recordArray(snapshot.payload.recentMatches);
    const sampleSize = Number(explicit.sampleSize);
    if (sampleSize > 0 || recentMatches.length > 0) return { ...explicit, recentMatches };
  }
  const recentMatches = recordArray(snapshot.payload.recentMatches);
  if (recentMatches.length === 0) return undefined;
  const wins = recentMatches.filter((item) => item.result === 'win').length;
  return {
    sampleSize: recentMatches.length,
    wins,
    losses: recentMatches.length - wins,
    winRate: wins / recentMatches.length,
    recentMatches,
  };
}

function playerMetricValue(
  teamSnapshot: SourceSnapshotLike | undefined,
  playerSnapshots: SourceSnapshotLike[],
  participantId: string,
  teamName: string,
): Array<Record<string, unknown>> {
  const explicit = recordArray(teamSnapshot?.payload.playerMetrics);
  if (explicit.length > 0) return explicit;
  return playerSnapshots
    .filter((item) => {
      const teamId = String(item.payload.team_id ?? item.payload.teamId ?? '');
      const name = String(item.payload.team_name ?? item.payload.teamName ?? '');
      return teamId === participantId || name.toLowerCase() === teamName.toLowerCase();
    })
    .flatMap((item) => {
      const kills = numberOrUndefined(item.payload.kills);
      const deaths = numberOrUndefined(item.payload.deaths);
      const assists = numberOrUndefined(item.payload.assists);
      const goldPerMinute = numberOrUndefined(
        item.payload.goldPerMinute ?? item.payload.gold_per_min,
      );
      const xpPerMinute = numberOrUndefined(item.payload.xpPerMinute ?? item.payload.xp_per_min);
      if ([kills, deaths, assists, goldPerMinute, xpPerMinute].every((value) => value == null))
        return [];
      return [
        {
          accountId: item.externalId,
          nickname: item.name,
          kills,
          deaths,
          assists,
          goldPerMinute,
          xpPerMinute,
        },
      ];
    });
}

function buildDotaDataQuality(input: {
  selected: SourceSnapshotLike;
  patch?: SourceSnapshotLike;
  now: Date;
  sides: Array<{
    side: 'a' | 'b';
    participantId: string;
    name: string;
    identity: unknown;
    targetEnrichment?: DotaDataQuality['sides'][number]['targetEnrichment'];
    rating: DotaFieldQuality;
    form: DotaFieldQuality;
    roster: DotaFieldQuality;
    metrics: DotaFieldQuality;
    heroes: DotaFieldQuality;
  }>;
}): DotaDataQuality {
  const sides = input.sides.map((side) => {
    const fields = [
      identityQuality(side.identity, input.selected, input.now),
      side.rating,
      side.form,
      side.roster,
      side.metrics,
      side.heroes,
    ];
    return {
      side: side.side,
      participantId: side.participantId,
      name: side.name,
      complete: fields.every((field) => field.status !== 'missing' && field.status !== 'conflict'),
      fresh: fields.every((field) => field.status === 'available'),
      fields,
      targetEnrichment: side.targetEnrichment,
    };
  });
  return {
    contractVersion: 'dota-quality.v1',
    freshnessLimitSeconds: FIELD_FRESHNESS_SECONDS,
    bothTeamsComplete: sides.every((side) => side.complete),
    bothTeamsFresh: sides.every((side) => side.fresh),
    sides,
    match: {
      patch: qualityField('patch', input.patch, Boolean(input.patch), input.now, 'PATCH_MISSING'),
    },
  };
}

function qualityField(
  field: DotaFieldQuality['field'],
  snapshot: SourceSnapshotLike | undefined,
  present: boolean,
  now: Date,
  reason: string,
): DotaFieldQuality {
  if (!present) {
    return {
      field,
      status: 'missing',
      source: snapshot?.source,
      observedAt: snapshot?.observedAt,
      reason,
    };
  }
  const ageSeconds = snapshot ? sourceAgeSeconds(snapshot.observedAt, now) : undefined;
  return {
    field,
    status: ageSeconds != null && ageSeconds > FIELD_FRESHNESS_SECONDS ? 'stale' : 'available',
    source: snapshot?.source,
    observedAt: snapshot?.observedAt,
    ageSeconds,
    ...(ageSeconds != null && ageSeconds > FIELD_FRESHNESS_SECONDS
      ? { reason: 'SOURCE_STALE' }
      : {}),
  };
}

function rosterQualityField(
  snapshots: SourceSnapshotLike[],
  fallback: SourceSnapshotLike | undefined,
  present: boolean,
  now: Date,
  reason: string,
): DotaFieldQuality {
  const available = snapshots.length > 0 ? snapshots : fallback ? [fallback] : [];
  const newest = available.length
    ? [...available].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0]
    : undefined;
  const result = qualityField('roster', newest, present, now, reason);
  const sources = [...new Set(available.map((item) => item.source))];
  return {
    ...result,
    source: sources.join('+') || result.source,
    sources,
  };
}

function targetEnrichment(
  snapshot: SourceSnapshotLike | undefined,
): DotaDataQuality['sides'][number]['targetEnrichment'] | undefined {
  const value = asRecord(snapshot?.payload.targetEnrichment);
  if (!value) return undefined;
  return {
    selected: Boolean(value.selected),
    rosterFetched: Number(value.rosterFetched) || 0,
    matchesFetched: Number(value.matchesFetched) || 0,
    detailSampleSize: Number(value.detailSampleSize) || 0,
    errors: stringArray(value.errors),
  };
}

function identityQuality(
  value: unknown,
  selected: SourceSnapshotLike,
  now: Date,
): DotaFieldQuality {
  const identity = asRecord(value);
  const status = String(identity?.status ?? 'matched');
  if (status === 'ambiguous') {
    return {
      field: 'identity',
      status: 'conflict',
      source: selected.source,
      observedAt: selected.observedAt,
      ageSeconds: sourceAgeSeconds(selected.observedAt, now),
      reason: 'TEAM_IDENTITY_AMBIGUOUS',
    };
  }
  if (status === 'unmatched') {
    return {
      field: 'identity',
      status: 'missing',
      source: selected.source,
      observedAt: selected.observedAt,
      ageSeconds: sourceAgeSeconds(selected.observedAt, now),
      reason: 'TEAM_IDENTITY_UNMATCHED',
    };
  }
  return qualityField('identity', selected, true, now, 'TEAM_IDENTITY_UNMATCHED');
}

function sourceAgeSeconds(observedAt: string, now: Date): number | undefined {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
}

function rostersConflict(snapshots: SourceSnapshotLike[]): boolean {
  const rosters = snapshots
    .map(rosterRows)
    .filter((rows) => rows.length >= 3)
    .map(
      (rows) =>
        new Set(
          rows.map((row) => String(row.nickname ?? row.name ?? '').toLowerCase()).filter(Boolean),
        ),
    );
  if (rosters.length < 2) return false;
  for (let i = 0; i < rosters.length - 1; i += 1) {
    for (let j = i + 1; j < rosters.length; j += 1) {
      const overlap = [...rosters[i]].filter((name) => rosters[j].has(name)).length;
      if (overlap < 3) return true;
    }
  }
  return false;
}

function enrichmentScore(snapshot: SourceSnapshotLike): number {
  return [
    snapshot.payload.rating,
    snapshot.payload.form,
    snapshot.payload.recentMatches,
    snapshot.payload.playerMetrics,
    snapshot.payload.heroPool,
  ].filter((value) => value != null && (!Array.isArray(value) || value.length > 0)).length;
}

function rosterSourcePrecedence(source: string): number {
  if (source === 'liquipedia') return 10;
  if (source === 'grid') return 20;
  if (source === 'opendota') return 30;
  return 100;
}

function playerSourceForTeam(
  snapshots: SourceSnapshotLike[],
  participantId: string,
  teamName: string,
): SourceSnapshotLike | undefined {
  return snapshots.find((item) => {
    const teamId = String(item.payload.team_id ?? item.payload.teamId ?? '');
    const name = String(item.payload.team_name ?? item.payload.teamName ?? '');
    return teamId === participantId || name.toLowerCase() === teamName.toLowerCase();
  });
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return asRecordArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
