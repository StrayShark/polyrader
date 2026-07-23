import type {
  EsportsGame,
  EsportsMatchSourceIdentity,
  EsportsSourceDescriptor,
  EsportsSourceEntityType,
  EsportsSourceId,
  EsportsSourceSnapshot,
  EsportsSourceSyncResult,
  EsportsTeamAlias,
  EsportsTeamAliasStatus,
} from '@polyrader/core';
import {
  normalizeDotaTeamAlias,
  normalizeLolTeamAlias,
  normalizeValorantTeamAlias,
  resolveDotaTeamIdentity,
  resolveLolTeamIdentity,
  resolveValorantTeamIdentity,
} from '@polyrader/core';
import {
  EsportsSourceRepository,
  GridClient,
  LiquipediaClient,
  LLMRepository,
  OpenDotaClient,
  RiotClient,
  ValorantApiClient,
  type OpenDotaMatchDetails,
  type OpenDotaProMatch,
  type OpenDotaProPlayer,
  type OpenDotaTeam,
  type OpenDotaTeamMatch,
  type OpenDotaTeamPlayer,
} from '@polyrader/infra';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

interface ServiceDependencies {
  repo?: Pick<
    EsportsSourceRepository,
    | 'upsertSnapshots'
    | 'recordSyncRun'
    | 'getLatestSyncRun'
    | 'listSnapshots'
    | 'upsertMatchIdentities'
    | 'listMatchIdentities'
    | 'countMatchIdentities'
  > &
    Partial<Pick<EsportsSourceRepository, 'upsertTeamAliases' | 'listTeamAliases'>>;
  grid?: Pick<
    GridClient,
    'isConfiguredForGame' | 'getUpcomingSeriesForGame' | 'getTeamRosterForGame'
  >;
  openDota?: Pick<
    OpenDotaClient,
    | 'getRecentProMatches'
    | 'getTeams'
    | 'getProPlayers'
    | 'getTeamPlayers'
    | 'getTeamMatches'
    | 'getMatchDetails'
    | 'getPatches'
  >;
  riot?: Pick<RiotClient, 'isConfigured' | 'getLatestLolPatch'>;
  valorantApi?: Pick<ValorantApiClient, 'getContent'>;
  liquipediaFactory?: (
    game: EsportsGame,
  ) => Pick<
    LiquipediaClient,
    | 'searchTeams'
    | 'getCurrentRoster'
    | 'isMatchScheduleConfigured'
    | 'getUpcomingMatches'
    | 'getPublicUpcomingMatches'
    | 'getPublicRecentMatches'
  >;
  legacyCs2?: Pick<LLMRepository, 'getUpcomingMatches' | 'getTeam'>;
  now?: () => Date;
}

export class EsportsSourceService {
  private readonly repo: NonNullable<ServiceDependencies['repo']>;
  private readonly grid: NonNullable<ServiceDependencies['grid']>;
  private readonly openDota: NonNullable<ServiceDependencies['openDota']>;
  private readonly riot: NonNullable<ServiceDependencies['riot']>;
  private readonly valorantApi: NonNullable<ServiceDependencies['valorantApi']>;
  private readonly liquipediaFactory: NonNullable<ServiceDependencies['liquipediaFactory']>;
  private readonly legacyCs2: NonNullable<ServiceDependencies['legacyCs2']>;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies = {}) {
    this.repo = dependencies.repo ?? new EsportsSourceRepository();
    this.grid = dependencies.grid ?? new GridClient();
    this.openDota = dependencies.openDota ?? new OpenDotaClient();
    this.riot = dependencies.riot ?? new RiotClient();
    this.valorantApi = dependencies.valorantApi ?? new ValorantApiClient();
    this.liquipediaFactory =
      dependencies.liquipediaFactory ?? ((game) => new LiquipediaClient({ game }));
    this.legacyCs2 = dependencies.legacyCs2 ?? new LLMRepository();
    this.now = dependencies.now ?? (() => new Date());
  }

  getCatalog(): Array<{
    game: EsportsGame;
    sources: EsportsSourceDescriptor[];
    latestSync: EsportsSourceSyncResult | null;
    identityCount: number;
  }> {
    return GAMES.map((game) => {
      const latestSync = this.repo.getLatestSyncRun(game);
      return {
        game,
        sources: sourceCatalog(
          game,
          this.grid.isConfiguredForGame(game),
          this.liquipediaFactory(game).isMatchScheduleConfigured(),
          latestSync,
        ),
        latestSync,
        identityCount: this.repo.countMatchIdentities(game),
      };
    });
  }

  listSnapshots(
    game: EsportsGame,
    options: { entityType?: EsportsSourceEntityType; limit?: number } = {},
  ): EsportsSourceSnapshot[] {
    return this.repo.listSnapshots(game, options);
  }

  listMatchIdentities(
    game: EsportsGame,
    options: { canonicalMatchId?: string; limit?: number } = {},
  ): EsportsMatchSourceIdentity[] {
    return this.repo.listMatchIdentities(game, options);
  }

  listTeamAliases(
    game: EsportsGame,
    options: { status?: EsportsTeamAliasStatus; limit?: number } = {},
  ): EsportsTeamAlias[] {
    const aliases = this.repo.listTeamAliases?.(game, options) ?? [];
    if (game !== 'dota2' || aliases.length === 0) return aliases;
    const teams = new Map(
      this.repo
        .listSnapshots('dota2', { entityType: 'team', limit: 200 })
        .filter((snapshot) => snapshot.source === 'opendota')
        .map((snapshot) => [snapshot.externalId, snapshot]),
    );
    return aliases.map((alias) => ({
      ...alias,
      evidence: {
        ...alias.evidence,
        candidateTeams: alias.candidateTeamIds.map((teamId) => {
          const snapshot = teams.get(teamId);
          return {
            teamId,
            name: snapshot?.name || teamId,
            tag: String(snapshot?.payload.tag ?? ''),
            sourceUrl: String(
              snapshot?.payload.sourceUrl ?? `https://www.opendota.com/teams/${teamId}`,
            ),
          };
        }),
      },
    }));
  }

  reviewTeamAlias(
    input: Pick<
      EsportsTeamAlias,
      | 'game'
      | 'source'
      | 'sourceTeamId'
      | 'alias'
      | 'targetSource'
      | 'targetTeamId'
      | 'status'
    > & { evidence?: Record<string, unknown> },
  ): EsportsTeamAlias {
    const now = this.now().toISOString();
    const alias: EsportsTeamAlias = {
      ...input,
      normalizedAlias: normalizeTeamAliasForGame(input.game, input.alias),
      canonicalTeamId: input.targetTeamId,
      method: 'manual_review',
      confidence: input.status === 'confirmed' ? 1 : 0,
      candidateTeamIds: input.targetTeamId ? [input.targetTeamId] : [],
      evidence: { ...(input.evidence ?? {}), reviewedManually: true },
      observedAt: now,
      confirmedAt: input.status === 'confirmed' ? now : undefined,
    };
    this.repo.upsertTeamAliases?.([alias]);
    return this.repo
      .listTeamAliases?.(input.game, {
        normalizedAlias: alias.normalizedAlias,
        limit: 1,
      })?.[0] ?? alias;
  }

  async searchLiquipediaTeams(game: EsportsGame, query: string) {
    return this.liquipediaFactory(game).searchTeams(query, 8);
  }

  async syncLiquipediaRoster(game: EsportsGame, title: string) {
    const roster = await this.liquipediaFactory(game).getCurrentRoster(title);
    this.repo.upsertSnapshots([
      snapshot({
        game,
        source: 'liquipedia',
        entityType: 'team',
        externalId: roster.sourceId,
        name: roster.teamTitle,
        status: 'active',
        payload: {
          sourceUrl: roster.sourceUrl,
          players: roster.players,
          fetchedAt: roster.fetchedAt,
          rawLength: roster.rawLength,
        },
        observedAt: roster.fetchedAt,
      }),
    ]);
    return roster;
  }

  syncLegacyCs2Snapshots(): number {
    return this.repo.upsertSnapshots(this.collectLegacyCs2Snapshots());
  }

  async syncGame(game: EsportsGame): Promise<EsportsSourceSyncResult> {
    const startedAt = this.now().toISOString();
    const snapshots: EsportsSourceSnapshot[] = [];
    const sources: EsportsSourceSyncResult['sources'] = [];

    if (this.grid.isConfiguredForGame(game)) {
      await this.collect(
        sources,
        snapshots,
        'grid',
        async () => {
          const series = await this.grid.getUpcomingSeriesForGame(game);
          const matchSnapshots = series.map((item) =>
            snapshot({
              game,
              source: 'grid',
              entityType: 'match',
              externalId: item.seriesId,
              name: `${item.teamAName} vs ${item.teamBName}`,
              startsAt: item.date,
              status: 'scheduled',
              payload: { ...item },
              observedAt: this.now().toISOString(),
            }),
          );
          if (game !== 'lol' && game !== 'valorant') return matchSnapshots;

          const rosterLimit = envNumber('POLYRADER_GRID_ROSTER_TEAM_LIMIT', 2, 0, 10);
          const teams = new Map<string, string>();
          for (const item of series) {
            if (item.teamAId && item.teamAName) teams.set(item.teamAId, item.teamAName);
            if (item.teamBId && item.teamBName) teams.set(item.teamBId, item.teamBName);
          }
          const teamSnapshots: EsportsSourceSnapshot[] = [];
          for (const [teamId, teamName] of [...teams].slice(0, rosterLimit)) {
            try {
              const players = await this.grid.getTeamRosterForGame(game, teamId);
              if (players.length === 0) continue;
              teamSnapshots.push(
                snapshot({
                  game,
                  source: 'grid',
                  entityType: 'team',
                  externalId: teamId,
                  name: teamName,
                  status: 'active',
                  payload: { teamId, teamName, players },
                  observedAt: this.now().toISOString(),
                }),
              );
            } catch {
              // A schedule remains useful even when historical roster state is unavailable.
            }
          }
          return [...matchSnapshots, ...teamSnapshots];
        },
        { emptyMessage: `No upcoming GRID ${game} series are available for this account` },
      );
    } else {
      sources.push({
        source: 'grid',
        status: 'skipped',
        records: 0,
        message: 'GRID key or game title ID not configured',
      });
    }

    const gridScheduleAvailable = snapshots.some(
      (item) => item.source === 'grid' && hasFutureSchedule(item, this.now()),
    );
    if (game !== 'cs2' && !gridScheduleAvailable) {
      const liquipedia = this.liquipediaFactory(game);
      await this.collect(
        sources,
        snapshots,
        'liquipedia',
        async () => {
          let accessMode: 'public-mediawiki' | 'licensed-db' = 'public-mediawiki';
          let matches;
          let recentMatches: Awaited<ReturnType<typeof liquipedia.getPublicRecentMatches>> = [];
          try {
            matches = await liquipedia.getPublicUpcomingMatches(50, this.now());
            recentMatches = await liquipedia.getPublicRecentMatches(50, this.now());
          } catch (publicError) {
            if (!liquipedia.isMatchScheduleConfigured()) throw publicError;
            accessMode = 'licensed-db';
            matches = await liquipedia.getUpcomingMatches(50, this.now());
          }
          if (matches.length === 0 && liquipedia.isMatchScheduleConfigured()) {
            accessMode = 'licensed-db';
            matches = await liquipedia.getUpcomingMatches(50, this.now());
          }

          const matchSnapshots = matches.map((item) =>
            snapshot({
              game,
              source: 'liquipedia',
              entityType: 'match',
              externalId: item.matchId,
              name: `${item.teamAName} vs ${item.teamBName}`,
              startsAt: item.date,
              status: 'scheduled',
              payload: { ...item, accessMode },
              observedAt: this.now().toISOString(),
            }),
          );
          const recentSnapshots = recentMatches.map((item) =>
            snapshot({
              game,
              source: 'liquipedia',
              entityType: 'match',
              externalId: item.matchId,
              name: `${item.teamAName} vs ${item.teamBName}`,
              startsAt: item.date,
              status: 'finished',
              payload: { ...item, accessMode },
              observedAt: this.now().toISOString(),
            }),
          );
          if (matches.length === 0 || accessMode === 'licensed-db') {
            return [...matchSnapshots, ...recentSnapshots];
          }

          const teamLimit = envNumber('POLYRADER_LIQUIPEDIA_ROSTER_TEAM_LIMIT', 10, 0, 10);
          const rosterAttemptLimit = envNumber(
            'POLYRADER_LIQUIPEDIA_ROSTER_ATTEMPT_LIMIT',
            20,
            0,
            20,
          );
          const teams = new Map<string, string>();
          for (const item of matches) {
            if (item.teamAId && item.teamAName) teams.set(item.teamAId, item.teamAName);
            if (item.teamBId && item.teamBName) teams.set(item.teamBId, item.teamBName);
          }
          const teamSnapshots: EsportsSourceSnapshot[] = [];
          for (const [teamTitle, teamName] of [...teams].slice(0, rosterAttemptLimit)) {
            if (teamSnapshots.length >= teamLimit) break;
            try {
              const roster = await liquipedia.getCurrentRoster(teamTitle);
              if (roster.players.length === 0) continue;
              teamSnapshots.push(
                snapshot({
                  game,
                  source: 'liquipedia',
                  entityType: 'team',
                  externalId: roster.sourceId,
                  name: roster.teamTitle || teamName,
                  status: 'active',
                  payload: {
                    sourceUrl: roster.sourceUrl,
                    players: roster.players,
                    fetchedAt: roster.fetchedAt,
                    rawLength: roster.rawLength,
                    accessMode,
                  },
                  observedAt: roster.fetchedAt,
                }),
              );
            } catch {
              // Schedule data remains valid when one roster page is missing or rate-limited.
            }
          }
          return [...matchSnapshots, ...recentSnapshots, ...teamSnapshots];
        },
        { emptyMessage: `Liquipedia public API returned no upcoming ${game} series` },
      );
    }

    if (game === 'lol') {
      await this.collect(sources, snapshots, 'riot-data-dragon', async () => {
        const patch = await this.riot.getLatestLolPatch();
        return [
          snapshot({
            game,
            source: 'riot-data-dragon',
            entityType: 'patch',
            externalId: patch.version,
            name: `League of Legends ${patch.version}`,
            status: 'current',
            payload: { ...patch },
            observedAt: this.now().toISOString(),
          }),
        ];
      });
    }

    if (game === 'dota2') {
      const confirmedAliases =
        this.repo.listTeamAliases?.('dota2', { status: 'confirmed', limit: 500 }) ?? [];
      await this.collect(sources, snapshots, 'opendota', async () => {
        const matches = await this.openDota.getRecentProMatches(100);
        const teamCandidates = await this.openDota.getTeams(1000);
        const players = await this.openDota.getProPlayers(500);
        const patches = await this.openDota.getPatches();
        const targetTeams = resolveScheduledDotaTeams(snapshots, teamCandidates, confirmedAliases);
        const targetTeamLimit = envNumber('POLYRADER_OPENDOTA_TARGET_TEAM_LIMIT', 8, 1, 12);
        const targetTeamIds = [...new Set(targetTeams.map((team) => team.teamId))];
        const selectedTargetIds = targetTeamIds.slice(0, targetTeamLimit);
        const targetTeamIdSet = new Set(targetTeamIds);
        const teams = teamCandidates.filter(
          (team, index) => index < 200 || targetTeamIdSet.has(team.teamId),
        );
        const targetEvidence = new Map<string, DotaTargetEvidence>(
          targetTeamIds.map((teamId, index) => [
            teamId,
            {
              selected: index < targetTeamLimit,
              rosterFetched: 0,
              matchesFetched: 0,
              detailSampleSize: 0,
              errors: index < targetTeamLimit ? [] : ['TARGET_TEAM_LIMIT'],
            },
          ]),
        );
        const targetedPlayers: OpenDotaProPlayer[] = [];
        const targetedMatches: OpenDotaProMatch[] = [];
        const teamById = new Map(teamCandidates.map((team) => [team.teamId, team]));

        for (const teamId of selectedTargetIds) {
          const team = teamById.get(teamId);
          if (!team) continue;
          const evidence = targetEvidence.get(teamId)!;
          try {
            const rows = await this.openDota.getTeamPlayers(teamId, 10);
            const currentPlayers = rows.filter((player) => player.isCurrentTeamMember === true);
            evidence.rosterFetched = currentPlayers.length;
            targetedPlayers.push(...mapTargetDotaPlayers(team, currentPlayers));
          } catch (error) {
            evidence.errors.push(`TEAM_PLAYERS:${errorText(error)}`);
          }
          try {
            const rows = await this.openDota.getTeamMatches(teamId, 10);
            evidence.matchesFetched = rows.length;
            targetedMatches.push(...mapTargetDotaMatches(team, rows));
          } catch (error) {
            evidence.errors.push(`TEAM_MATCHES:${errorText(error)}`);
          }
        }

        const enrichedPlayers = dedupeDotaPlayers([...players, ...targetedPlayers]);
        const enrichedMatches = dedupeDotaMatches([...matches, ...targetedMatches]);
        const detailLimit = envNumber('POLYRADER_OPENDOTA_DETAIL_LIMIT', 8, 0, 12);
        const matchesPerTeam = envNumber('POLYRADER_OPENDOTA_MATCHES_PER_TEAM', 3, 1, 5);
        const detailCandidates = selectDotaDetailMatches(
          enrichedMatches,
          new Set(targetTeams.map((team) => team.teamId)),
          matchesPerTeam,
          detailLimit,
        );
        const details: OpenDotaMatchDetails[] = [];
        for (const match of detailCandidates) {
          try {
            const detail = await this.openDota.getMatchDetails(match.matchId);
            details.push(detail);
            for (const teamId of [match.radiantTeamId, match.direTeamId]) {
              const evidence = targetEvidence.get(teamId);
              if (evidence) evidence.detailSampleSize += 1;
            }
          } catch (error) {
            for (const teamId of [match.radiantTeamId, match.direTeamId]) {
              const evidence = targetEvidence.get(teamId);
              if (evidence) evidence.errors.push(`MATCH_DETAIL:${errorText(error)}`);
            }
          }
        }
        const detailByMatch = new Map(details.map((item) => [item.matchId, item]));
        const matchSnapshots = enrichedMatches.map((item) =>
          snapshot({
            game,
            source: 'opendota',
            entityType: 'match',
            externalId: item.matchId,
            name: `${item.radiantTeamName} vs ${item.direTeamName}`,
            startsAt: item.startTime || undefined,
            status: 'finished',
            payload: { ...item, ...(detailByMatch.get(item.matchId) ?? {}) },
            observedAt: this.now().toISOString(),
          }),
        );
        const teamSnapshots = teams.map((item) =>
          snapshot({
            game,
            source: 'opendota',
            entityType: 'team',
            externalId: item.teamId,
            name: item.name,
            status: 'active',
            payload: buildDotaTeamEnrichment(
              item,
              enrichedMatches,
              enrichedPlayers,
              [...detailByMatch.values()],
              targetTeams.filter((target) => target.teamId === item.teamId),
              targetEvidence.get(item.teamId),
            ),
            observedAt: this.now().toISOString(),
          }),
        );
        const playerSnapshots = enrichedPlayers.map((item) =>
          snapshot({
            game,
            source: 'opendota',
            entityType: 'player',
            externalId: item.accountId,
            name: item.nickname,
            status: item.teamId ? 'active' : 'unattached',
            payload: { ...item },
            observedAt: this.now().toISOString(),
          }),
        );
        const currentPatch = [...patches].sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date),
        )[0];
        const referencedPatchIds = new Set(
          [...detailByMatch.values()]
            .map((detail) => detail.patchId)
            .filter((id): id is number => Number.isFinite(id)),
        );
        if (currentPatch) referencedPatchIds.add(currentPatch.id);
        const patchSnapshots = patches
          .filter((patch) => referencedPatchIds.has(patch.id))
          .map((patch) =>
            snapshot({
              game,
              source: 'opendota',
              entityType: 'patch',
              externalId: String(patch.id),
              name: patch.name,
              status: patch.id === currentPatch?.id ? 'current' : 'historical',
              payload: { ...patch },
              observedAt: this.now().toISOString(),
            }),
          );
        return dedupeSnapshots([
          ...matchSnapshots,
          ...teamSnapshots,
          ...playerSnapshots,
          ...patchSnapshots,
        ]);
      });
    }

    if (game === 'valorant') {
      await this.collect(sources, snapshots, 'valorant-api', async () => {
        const content = await this.valorantApi.getContent();
        return [
          snapshot({
            game,
            source: 'valorant-api',
            entityType: 'content',
            externalId: content.version || this.now().toISOString().slice(0, 10),
            name: `VALORANT content ${content.version || 'current'}`,
            status: 'current',
            payload: {
              version: content.version,
              manifestId: content.manifestId,
              characters: content.characters,
              maps: content.maps,
              sourceUrl: content.sourceUrl,
            },
            observedAt: this.now().toISOString(),
          }),
        ];
      });
      sources.push({
        source: 'riot',
        status: 'skipped',
        records: 0,
        message: 'Riot Developer API is policy-restricted for this simulated betting product',
      });
    }

    if (game === 'cs2') {
      await this.collect(sources, snapshots, 'hltv', async () => this.collectLegacyCs2Snapshots());
    }

    if (game === 'lol' || game === 'valorant') {
      annotateRiotScheduleIdentities(game, snapshots);
    }

    const stored = this.repo.upsertSnapshots(snapshots);
    if (game === 'dota2') {
      this.repo.upsertTeamAliases?.(buildDotaTeamAliasAuditRows(snapshots));
    }
    if (game === 'lol' || game === 'valorant') {
      this.repo.upsertTeamAliases?.(buildRiotTeamAliasAuditRows(game, snapshots));
    }
    this.repo.upsertMatchIdentities(
      snapshots
        .map((item) => buildMatchSourceIdentity(item))
        .filter((item): item is EsportsMatchSourceIdentity => Boolean(item)),
    );
    const hasFailure = sources.some((source) => source.status === 'failed');
    const scheduleAvailable = snapshots.some((item) => hasFutureSchedule(item, this.now()));
    const result: EsportsSourceSyncResult = {
      game,
      status:
        stored === 0 && hasFailure
          ? 'failed'
          : hasFailure || stored === 0 || !scheduleAvailable
            ? 'partial'
            : 'success',
      records: stored,
      sources,
      startedAt,
      finishedAt: this.now().toISOString(),
    };
    this.repo.recordSyncRun(result);
    return result;
  }

  private collectLegacyCs2Snapshots(): EsportsSourceSnapshot[] {
    const observedAt = this.now().toISOString();
    const snapshots: EsportsSourceSnapshot[] = [];
    const seenTeams = new Set<string>();
    for (const row of this.legacyCs2.getUpcomingMatches(100)) {
      const matchId = String(row.match_id ?? '');
      if (!matchId) continue;
      const teamAId = String(row.team_a_id ?? `${matchId}-a`);
      const teamBId = String(row.team_b_id ?? `${matchId}-b`);
      const teamAName = String(row.team_a_name ?? teamAId);
      const teamBName = String(row.team_b_name ?? teamBId);
      snapshots.push(
        snapshot({
          game: 'cs2',
          source: 'hltv',
          entityType: 'match',
          externalId: String(row.hltv_match_id ?? matchId),
          name: `${teamAName} vs ${teamBName}`,
          startsAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
          status: String(row.status ?? 'scheduled'),
          payload: {
            teamAId,
            teamBId,
            teamAName,
            teamBName,
            eventName: String(row.event_name ?? ''),
            format: String(row.format ?? 'BO3'),
            maps: parseJsonArray(row.maps),
            lineups: parseJsonObject(row.lineups),
            hasTeamData: Number(row.has_team_data ?? 0) === 1,
            canonicalMatchId: row.canonical_match_id ? String(row.canonical_match_id) : undefined,
            legacyMatchId: matchId,
          },
          observedAt: normalizeObservedAt(row.updated_at, observedAt),
        }),
      );

      for (const [teamId, teamName] of [
        [teamAId, teamAName],
        [teamBId, teamBName],
      ] as const) {
        if (seenTeams.has(teamId)) continue;
        seenTeams.add(teamId);
        const team = this.legacyCs2.getTeam(teamId);
        if (!team) continue;
        snapshots.push(
          snapshot({
            game: 'cs2',
            source: 'hltv',
            entityType: 'team',
            externalId: teamId,
            name: String(team.name ?? teamName),
            status: 'active',
            payload: {
              rank: Number(team.rank) || 999,
              region: String(team.region ?? ''),
              players: parseJsonArray(team.players),
              recentForm: parseJsonObject(team.recent_form),
              mapPool: parseJsonObject(team.map_pool),
            },
            observedAt: normalizeObservedAt(team.updated_at, observedAt),
          }),
        );
      }
    }
    return snapshots;
  }

  private async collect(
    sourceResults: EsportsSourceSyncResult['sources'],
    snapshots: EsportsSourceSnapshot[],
    source: EsportsSourceId,
    loader: () => Promise<EsportsSourceSnapshot[]>,
    options: { emptyMessage?: string } = {},
  ): Promise<void> {
    try {
      const loaded = await loader();
      snapshots.push(...loaded);
      sourceResults.push({
        source,
        status: 'success',
        records: loaded.length,
        ...(loaded.length === 0 && options.emptyMessage ? { message: options.emptyMessage } : {}),
      });
    } catch (err) {
      sourceResults.push({
        source,
        status: 'failed',
        records: 0,
        message: (err as Error).message,
      });
    }
  }
}

function sourceCatalog(
  game: EsportsGame,
  gridConfigured: boolean,
  liquipediaScheduleConfigured: boolean,
  latestSync: EsportsSourceSyncResult | null,
): EsportsSourceDescriptor[] {
  const liquipedia = descriptor(
    game,
    'liquipedia',
    'Liquipedia',
    'public',
    true,
    [
      'rosters',
      'transfers',
      'team identity',
      'public schedules',
      ...(liquipediaScheduleConfigured ? ['licensed schedule fallback'] : []),
    ],
    'https://liquipedia.net/api',
    {
      note: liquipediaScheduleConfigured
        ? 'Public schedule access is available; licensed DB fallback is configured.'
        : 'Public MediaWiki schedule, identity and roster access is available.',
    },
  );
  const grid = descriptor(
    game,
    'grid',
    'GRID',
    'licensed',
    gridConfigured,
    ['official schedule', 'official telemetry', 'series state'],
    'https://grid.gg/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/',
    {
      readiness: gridConfigured ? 'key_configured' : 'unconfigured',
      note: gridConfigured
        ? 'Credential configured; title access and schedule availability require a successful sync.'
        : undefined,
    },
  );

  let catalog: EsportsSourceDescriptor[];
  if (game === 'cs2')
    catalog = [
      descriptor(
        game,
        'hltv',
        'HLTV',
        'public',
        true,
        ['matches', 'rankings', 'rosters', 'map pool', 'player stats'],
        'https://www.hltv.org/',
      ),
      liquipedia,
      grid,
    ];
  else if (game === 'lol')
    catalog = [
      grid,
      descriptor(
        game,
        'riot-data-dragon',
        'Riot Data Dragon',
        'public',
        true,
        ['patches', 'champions', 'items', 'runes', 'assets'],
        'https://developer.riotgames.com/docs/lol',
      ),
      policyRestricted(
        game,
        'riot',
        'Riot Developer API',
        ['player match history', 'platform status'],
        'https://developer.riotgames.com/docs/lol',
      ),
      liquipedia,
      reference(
        game,
        'oracles-elixir',
        "Oracle's Elixir",
        ['historical pro match data', 'model backfill'],
        'https://oracleselixir.com/',
      ),
    ];
  else if (game === 'dota2')
    catalog = [
      grid,
      descriptor(
        game,
        'opendota',
        'OpenDota',
        'public',
        true,
        ['pro matches', 'results', 'teams', 'players', 'patches', 'drafts'],
        'https://www.opendota.com/api',
      ),
      descriptor(
        game,
        'steam',
        'Valve Steam Web API',
        'api_key',
        Boolean(process.env.STEAM_WEB_API_KEY),
        ['official raw match verification'],
        'https://partner.steamgames.com/doc/webapi_overview',
      ),
      liquipedia,
      reference(
        game,
        'stratz',
        'STRATZ',
        ['advanced parsed statistics', 'draft analytics'],
        'https://docs.stratz.com/',
      ),
    ];
  else
    catalog = [
      grid,
      descriptor(
        game,
        'valorant-api',
        'Valorant API',
        'public',
        true,
        ['versions', 'characters', 'maps'],
        'https://valorant-api.com/',
      ),
      policyRestricted(
        game,
        'riot',
        'Riot VAL API',
        ['player matches', 'ranked leaderboard', 'platform status'],
        'https://developer.riotgames.com/docs/valorant',
      ),
      liquipedia,
      reference(
        game,
        'vlr',
        'VLR.gg',
        ['schedule verification', 'community rankings'],
        'https://www.vlr.gg/',
      ),
      reference(
        game,
        'oracles-elixir',
        "Oracle's Elixir",
        ['advanced VCT statistics'],
        'https://oracleselixir.com/',
      ),
    ];
  return catalog.map((source) => applyLatestSourceState(source, latestSync));
}

function descriptor(
  game: EsportsGame,
  source: EsportsSourceId,
  label: string,
  access: EsportsSourceDescriptor['access'],
  configured: boolean,
  capabilities: string[],
  docsUrl: string,
  options: { readiness?: EsportsSourceDescriptor['readiness']; note?: string } = {},
): EsportsSourceDescriptor {
  return {
    game,
    source,
    label,
    access,
    state: configured ? 'ready' : 'unconfigured',
    readiness: options.readiness ?? (configured ? 'data_available' : 'unconfigured'),
    configured,
    capabilities,
    docsUrl,
    note: options.note,
  };
}

function reference(
  game: EsportsGame,
  source: EsportsSourceId,
  label: string,
  capabilities: string[],
  docsUrl: string,
): EsportsSourceDescriptor {
  return {
    game,
    source,
    label,
    access: 'reference_only',
    state: 'reference_only',
    readiness: 'reference_only',
    configured: false,
    capabilities,
    docsUrl,
    note: 'No supported production API connector; use only for manual verification or licensed access.',
  };
}

function policyRestricted(
  game: EsportsGame,
  source: EsportsSourceId,
  label: string,
  capabilities: string[],
  docsUrl: string,
): EsportsSourceDescriptor {
  return {
    game,
    source,
    label,
    access: 'reference_only',
    state: 'reference_only',
    readiness: 'reference_only',
    configured: false,
    capabilities,
    docsUrl,
    note: 'Policy-restricted for this simulated betting product; do not call without explicit written approval.',
  };
}

function applyLatestSourceState(
  descriptorValue: EsportsSourceDescriptor,
  latestSync: EsportsSourceSyncResult | null,
): EsportsSourceDescriptor {
  const result = latestSync?.sources.find((item) => item.source === descriptorValue.source);
  if (!result) return descriptorValue;
  if (result.status === 'failed') {
    return {
      ...descriptorValue,
      state: 'error',
      readiness: descriptorValue.source === 'grid' ? 'key_configured' : 'error',
      note: result.message ?? descriptorValue.note,
    };
  }
  if (descriptorValue.source === 'grid' && result.status === 'success') {
    return {
      ...descriptorValue,
      state: result.records > 0 ? 'ready' : 'degraded',
      readiness: result.records > 0 ? 'schedule_available' : 'title_resolved',
      note: result.message ?? descriptorValue.note,
    };
  }
  if (
    descriptorValue.source === 'liquipedia' &&
    result.status === 'success' &&
    result.records > 0
  ) {
    return {
      ...descriptorValue,
      state: 'ready',
      readiness: 'schedule_available',
      note: result.message ?? descriptorValue.note,
    };
  }
  return descriptorValue;
}

function hasFutureSchedule(item: EsportsSourceSnapshot, now: Date): boolean {
  return (
    item.entityType === 'match' &&
    isUpcomingStatus(item.status) &&
    Boolean(item.startsAt && Date.parse(item.startsAt) >= now.getTime())
  );
}

function buildMatchSourceIdentity(
  sourceSnapshot: EsportsSourceSnapshot,
): EsportsMatchSourceIdentity | null {
  if (sourceSnapshot.entityType !== 'match') return null;
  const payload = sourceSnapshot.payload;
  const teamAId = firstString(payload.teamAId, payload.radiantTeamId, payload.radiant_team_id);
  const teamBId = firstString(payload.teamBId, payload.direTeamId, payload.dire_team_id);
  const teamAName = firstString(payload.teamAName, payload.radiantTeamName, payload.radiant_name);
  const teamBName = firstString(payload.teamBName, payload.direTeamName, payload.dire_name);
  const eventId = firstString(
    payload.eventId,
    payload.tournamentId,
    payload.leagueId,
    payload.leagueid,
  );
  const eventName = firstString(
    payload.eventName,
    payload.tournamentName,
    payload.leagueName,
    payload.league_name,
  );
  const seriesId = firstString(payload.seriesId, payload.series_id);
  const isOpenDotaGame = sourceSnapshot.source === 'opendota';
  const parentCanonicalMatchId = isOpenDotaGame
    ? seriesId
      ? `${sourceSnapshot.game}:series:opendota:${seriesId}`
      : buildHeuristicSeriesId(sourceSnapshot.game, teamAName, teamBName, sourceSnapshot.startsAt)
    : undefined;
  const canonicalMatchId = isOpenDotaGame
    ? `${sourceSnapshot.game}:game:opendota:${sourceSnapshot.externalId}`
    : (buildHeuristicSeriesId(sourceSnapshot.game, teamAName, teamBName, sourceSnapshot.startsAt) ??
      `${sourceSnapshot.game}:series:${sourceSnapshot.source}:${sourceSnapshot.externalId}`);

  return {
    game: sourceSnapshot.game,
    canonicalMatchId,
    scope: isOpenDotaGame ? 'game' : 'series',
    source: sourceSnapshot.source,
    externalId: sourceSnapshot.externalId,
    parentCanonicalMatchId,
    eventId: eventId || undefined,
    teamAId: teamAId || undefined,
    teamBId: teamBId || undefined,
    startsAt: sourceSnapshot.startsAt,
    confidence: isOpenDotaGame || seriesId ? 1 : eventName ? 0.9 : 0.8,
    observedAt: sourceSnapshot.observedAt,
  };
}

function buildHeuristicSeriesId(
  game: EsportsGame,
  teamAName: string,
  teamBName: string,
  startsAt?: string,
): string | undefined {
  const millis = Date.parse(startsAt ?? '');
  const teams = [slug(teamAName), slug(teamBName)].filter(Boolean).sort();
  if (!Number.isFinite(millis) || teams.length < 2) return undefined;
  const thirtyMinutes = 30 * 60 * 1000;
  const bucket = new Date(Math.floor(millis / thirtyMinutes) * thirtyMinutes)
    .toISOString()
    .slice(0, 16)
    .replace(/[-:T]/g, '');
  return `${game}:series:${bucket}:${teams.join(':')}`;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isUpcomingStatus(status?: string): boolean {
  return ['scheduled', 'upcoming', 'not_started', 'prematch'].includes(
    String(status ?? '').toLowerCase(),
  );
}

function snapshot(value: EsportsSourceSnapshot): EsportsSourceSnapshot {
  return value;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

interface ResolvedScheduledDotaTeam {
  teamId: string;
  scheduleName: string;
  sourceId: string;
  score: number;
  method: string;
}

interface DotaTargetEvidence {
  selected: boolean;
  rosterFetched: number;
  matchesFetched: number;
  detailSampleSize: number;
  errors: string[];
}

function resolveScheduledDotaTeams(
  snapshots: EsportsSourceSnapshot[],
  teams: OpenDotaTeam[],
  confirmedAliases: EsportsTeamAlias[] = [],
): ResolvedScheduledDotaTeam[] {
  const aliasesByTeam = new Map<string, string[]>();
  for (const alias of confirmedAliases) {
    const teamId = alias.targetTeamId ?? alias.canonicalTeamId;
    if (!teamId) continue;
    aliasesByTeam.set(teamId, [...(aliasesByTeam.get(teamId) ?? []), alias.alias]);
  }
  const candidates = teams.map((team) => ({
    teamId: team.teamId,
    name: team.name,
    tag: team.tag,
    aliases: aliasesByTeam.get(team.teamId),
  }));
  const resolved = new Map<string, ResolvedScheduledDotaTeam>();

  for (const item of snapshots) {
    if (item.game !== 'dota2' || item.entityType !== 'match' || !isUpcomingStatus(item.status)) {
      continue;
    }
    for (const side of ['A', 'B'] as const) {
      const scheduleName = firstString(item.payload[`team${side}Name`]);
      const sourceId = firstString(item.payload[`team${side}Id`]);
      const resolution = resolveDotaTeamIdentity({ name: scheduleName, sourceId }, candidates);
      item.payload[`team${side}Identity`] = {
        status: resolution.status,
        score: resolution.score,
        method: resolution.method,
        candidateIds: resolution.candidateIds,
        candidates: resolution.candidateIds.map((teamId) => {
          const candidate = teams.find((team) => team.teamId === teamId);
          return {
            teamId,
            name: candidate?.name ?? teamId,
            tag: candidate?.tag,
            sourceUrl: `https://www.opendota.com/teams/${encodeURIComponent(teamId)}`,
          };
        }),
      };
      if (resolution.status !== 'matched' || !resolution.teamId) continue;
      item.payload[`team${side}OpenDotaId`] = resolution.teamId;
      resolved.set(`${resolution.teamId}:${scheduleName}`, {
        teamId: resolution.teamId,
        scheduleName,
        sourceId,
        score: resolution.score,
        method: resolution.method,
      });
    }
  }
  return [...resolved.values()];
}

function buildDotaTeamAliasAuditRows(
  snapshots: EsportsSourceSnapshot[],
): EsportsTeamAlias[] {
  const rows: EsportsTeamAlias[] = [];
  for (const item of snapshots) {
    if (item.game !== 'dota2' || item.entityType !== 'match' || !isUpcomingStatus(item.status)) {
      continue;
    }
    for (const side of ['A', 'B'] as const) {
      const alias = firstString(item.payload[`team${side}Name`]);
      if (!alias) continue;
      const sourceTeamId = firstString(item.payload[`team${side}Id`]);
      const identity = parseJsonObject(item.payload[`team${side}Identity`]);
      const resolutionStatus = firstString(identity.status);
      const targetTeamId = firstString(item.payload[`team${side}OpenDotaId`]);
      const candidateTeamIds = parseJsonArray(identity.candidateIds).map(String).filter(Boolean);
      const candidateTeams = parseJsonArray(identity.candidates);
      const status: EsportsTeamAliasStatus =
        resolutionStatus === 'matched'
          ? 'candidate'
          : resolutionStatus === 'ambiguous'
            ? 'conflict'
            : 'unmatched';
      rows.push({
        game: 'dota2',
        source: item.source,
        sourceTeamId,
        alias,
        normalizedAlias: normalizeDotaTeamAlias(alias),
        canonicalTeamId: targetTeamId || undefined,
        targetSource: 'opendota',
        targetTeamId: targetTeamId || undefined,
        status,
        method: firstString(identity.method) || 'none',
        confidence: Math.max(0, Math.min(1, Number(identity.score) || 0)),
        candidateTeamIds,
        evidence: {
          matchExternalId: item.externalId,
          matchName: item.name,
          startsAt: item.startsAt,
          side: side.toLowerCase(),
          candidateTeams,
        },
        observedAt: item.observedAt,
      });
    }
  }
  return rows;
}

function annotateRiotScheduleIdentities(
  game: 'lol' | 'valorant',
  snapshots: EsportsSourceSnapshot[],
): void {
  const teamSnapshots = snapshots.filter(
    (item) => item.game === game && item.entityType === 'team',
  );
  const candidates = teamSnapshots.map((item) => ({
    teamId: item.externalId,
    name: item.name,
    aliases: [firstString(item.payload.teamName), firstString(item.payload.tag)].filter(Boolean),
  }));
  const resolve =
    game === 'lol' ? resolveLolTeamIdentity : resolveValorantTeamIdentity;

  for (const item of snapshots) {
    if (item.game !== game || item.entityType !== 'match' || !isUpcomingStatus(item.status)) {
      continue;
    }
    for (const side of ['A', 'B'] as const) {
      const scheduleName = firstString(item.payload[`team${side}Name`]);
      const sourceId = firstString(item.payload[`team${side}Id`]);
      if (!scheduleName) continue;
      const resolution = resolve({ name: scheduleName, sourceId }, candidates);
      item.payload[`team${side}Identity`] = {
        status: resolution.status,
        score: resolution.score,
        method: resolution.method,
        teamId: resolution.teamId,
        candidateIds: resolution.candidateIds,
        candidates: resolution.candidateIds.map((teamId) => {
          const candidate = teamSnapshots.find((team) => team.externalId === teamId);
          return {
            teamId,
            name: candidate?.name ?? teamId,
            source: candidate?.source,
          };
        }),
      };
      if (resolution.status === 'matched' && resolution.teamId) {
        item.payload[`team${side}RosterId`] = resolution.teamId;
      }
    }
  }
}

function buildRiotTeamAliasAuditRows(
  game: 'lol' | 'valorant',
  snapshots: EsportsSourceSnapshot[],
): EsportsTeamAlias[] {
  const normalize = game === 'lol' ? normalizeLolTeamAlias : normalizeValorantTeamAlias;
  const targetSource = 'liquipedia';
  const rows: EsportsTeamAlias[] = [];
  for (const item of snapshots) {
    if (item.game !== game || item.entityType !== 'match' || !isUpcomingStatus(item.status)) {
      continue;
    }
    for (const side of ['A', 'B'] as const) {
      const alias = firstString(item.payload[`team${side}Name`]);
      if (!alias) continue;
      const sourceTeamId = firstString(item.payload[`team${side}Id`]);
      const identity = parseJsonObject(item.payload[`team${side}Identity`]);
      const resolutionStatus = firstString(identity.status);
      const targetTeamId =
        firstString(item.payload[`team${side}RosterId`]) || firstString(identity.teamId);
      const candidateTeamIds = parseJsonArray(identity.candidateIds).map(String).filter(Boolean);
      const candidateTeams = parseJsonArray(identity.candidates);
      const status: EsportsTeamAliasStatus =
        resolutionStatus === 'matched'
          ? 'candidate'
          : resolutionStatus === 'ambiguous'
            ? 'conflict'
            : 'unmatched';
      rows.push({
        game,
        source: item.source,
        sourceTeamId,
        alias,
        normalizedAlias: normalize(alias),
        canonicalTeamId: targetTeamId || undefined,
        targetSource,
        targetTeamId: targetTeamId || undefined,
        status,
        method: firstString(identity.method) || 'none',
        confidence: Math.max(0, Math.min(1, Number(identity.score) || 0)),
        candidateTeamIds,
        evidence: {
          matchExternalId: item.externalId,
          matchName: item.name,
          startsAt: item.startsAt,
          side: side.toLowerCase(),
          candidateTeams,
        },
        observedAt: item.observedAt,
      });
    }
  }
  return rows;
}

function normalizeTeamAliasForGame(game: EsportsGame, alias: string): string {
  if (game === 'dota2') return normalizeDotaTeamAlias(alias);
  if (game === 'valorant') return normalizeValorantTeamAlias(alias);
  if (game === 'lol') return normalizeLolTeamAlias(alias);
  return normalizeLolTeamAlias(alias);
}

function selectDotaDetailMatches(
  matches: OpenDotaProMatch[],
  targetTeamIds: Set<string>,
  perTeam: number,
  limit: number,
): OpenDotaProMatch[] {
  if (limit === 0) return [];
  if (targetTeamIds.size === 0) return matches.slice(0, limit);

  const counts = new Map<string, number>();
  const selected: OpenDotaProMatch[] = [];
  for (const match of matches) {
    const involved = [match.radiantTeamId, match.direTeamId].filter((teamId) =>
      targetTeamIds.has(teamId),
    );
    if (involved.length === 0 || involved.every((teamId) => (counts.get(teamId) ?? 0) >= perTeam)) {
      continue;
    }
    selected.push(match);
    for (const teamId of involved) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function mapTargetDotaPlayers(
  team: OpenDotaTeam,
  players: OpenDotaTeamPlayer[],
): OpenDotaProPlayer[] {
  return players.map((player) => ({
    accountId: player.accountId,
    steamId: '',
    nickname: player.name,
    realName: player.name,
    countryCode: '',
    teamId: team.teamId,
    teamName: team.name,
    teamTag: team.tag,
    lastMatchTime: team.lastMatchTime,
  }));
}

function mapTargetDotaMatches(
  team: OpenDotaTeam,
  matches: OpenDotaTeamMatch[],
): OpenDotaProMatch[] {
  return matches.map((match) => ({
    matchId: match.matchId,
    duration: match.duration,
    startTime: match.startTime,
    radiantTeamId: match.radiant ? team.teamId : match.opposingTeamId,
    radiantTeamName: match.radiant ? team.name : match.opposingTeamName,
    direTeamId: match.radiant ? match.opposingTeamId : team.teamId,
    direTeamName: match.radiant ? match.opposingTeamName : team.name,
    radiantWin: match.radiantWin,
    leagueId: match.leagueId,
    leagueName: match.leagueName,
  }));
}

function dedupeDotaPlayers(players: OpenDotaProPlayer[]): OpenDotaProPlayer[] {
  const byAccountId = new Map<string, OpenDotaProPlayer>();
  for (const player of players) byAccountId.set(player.accountId, player);
  return [...byAccountId.values()];
}

function dedupeDotaMatches(matches: OpenDotaProMatch[]): OpenDotaProMatch[] {
  const byMatchId = new Map<string, OpenDotaProMatch>();
  for (const match of matches) {
    if (!byMatchId.has(match.matchId)) byMatchId.set(match.matchId, match);
  }
  return [...byMatchId.values()].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
}

function buildDotaTeamEnrichment(
  team: OpenDotaTeam,
  matches: OpenDotaProMatch[],
  players: OpenDotaProPlayer[],
  details: OpenDotaMatchDetails[],
  aliases: ResolvedScheduledDotaTeam[],
  targetEvidence?: DotaTargetEvidence,
): Record<string, unknown> {
  const recentMatches = matches
    .filter((match) => match.radiantTeamId === team.teamId || match.direTeamId === team.teamId)
    .slice(0, 10)
    .map((match) => {
      const radiant = match.radiantTeamId === team.teamId;
      const won = radiant ? match.radiantWin : !match.radiantWin;
      return {
        matchId: match.matchId,
        opponentId: radiant ? match.direTeamId : match.radiantTeamId,
        opponentName: radiant ? match.direTeamName : match.radiantTeamName,
        result: won ? 'win' : 'loss',
        startTime: match.startTime,
        leagueId: match.leagueId,
        leagueName: match.leagueName,
        seriesId: match.seriesId,
      };
    });
  const recentWins = recentMatches.filter((match) => match.result === 'win').length;
  const roster = players
    .filter((player) => player.teamId === team.teamId)
    .sort((a, b) => Date.parse(b.lastMatchTime) - Date.parse(a.lastMatchTime))
    .slice(0, 5);
  const teamDetails = details.filter(
    (detail) => detail.radiantTeamId === team.teamId || detail.direTeamId === team.teamId,
  );
  const heroRows = new Map<number, { heroId: number; matches: number; wins: number }>();
  const playerRows = new Map<
    string,
    {
      accountId: string;
      nickname: string;
      matches: number;
      kills: number;
      deaths: number;
      assists: number;
      goldPerMinute: number;
      xpPerMinute: number;
    }
  >();

  for (const detail of teamDetails) {
    const radiant = detail.radiantTeamId === team.teamId;
    const won = detail.radiantWin == null ? false : radiant === detail.radiantWin;
    for (const player of detail.players.filter((item) => item.playerSlot < 128 === radiant)) {
      const hero = heroRows.get(player.heroId) ?? { heroId: player.heroId, matches: 0, wins: 0 };
      hero.matches += 1;
      if (won) hero.wins += 1;
      heroRows.set(player.heroId, hero);

      const row = playerRows.get(player.accountId) ?? {
        accountId: player.accountId,
        nickname: player.nickname,
        matches: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        goldPerMinute: 0,
        xpPerMinute: 0,
      };
      row.matches += 1;
      row.kills += player.kills;
      row.deaths += player.deaths;
      row.assists += player.assists;
      row.goldPerMinute += player.goldPerMinute;
      row.xpPerMinute += player.xpPerMinute;
      playerRows.set(player.accountId, row);
    }
  }

  return {
    ...team,
    aliases: [...new Set([team.tag, ...aliases.map((item) => item.scheduleName)].filter(Boolean))],
    identityMatches: aliases.map((item) => ({
      scheduleName: item.scheduleName,
      sourceId: item.sourceId,
      score: item.score,
      method: item.method,
    })),
    recentMatches,
    form: {
      sampleSize: recentMatches.length,
      wins: recentWins,
      losses: recentMatches.length - recentWins,
      winRate: recentMatches.length > 0 ? recentWins / recentMatches.length : null,
      streak: resultStreak(recentMatches.map((match) => match.result)),
      lastMatchAt: recentMatches[0]?.startTime ?? team.lastMatchTime,
    },
    roster,
    heroPool: [...heroRows.values()]
      .filter((row) => row.heroId > 0)
      .sort((a, b) => b.matches - a.matches || b.wins - a.wins)
      .map((row) => ({
        ...row,
        winRate: row.matches > 0 ? row.wins / row.matches : null,
      }))
      .slice(0, 12),
    playerMetrics: [...playerRows.values()]
      .map((row) => ({
        accountId: row.accountId,
        nickname: row.nickname,
        matches: row.matches,
        kills: row.kills / row.matches,
        deaths: row.deaths / row.matches,
        assists: row.assists / row.matches,
        goldPerMinute: row.goldPerMinute / row.matches,
        xpPerMinute: row.xpPerMinute / row.matches,
      }))
      .sort((a, b) => b.matches - a.matches),
    detailSampleSize: teamDetails.length,
    ...(targetEvidence ? { targetEnrichment: targetEvidence } : {}),
  };
}

function resultStreak(results: string[]): number {
  const first = results[0];
  if (!first) return 0;
  const length = results.findIndex((result) => result !== first);
  const count = length === -1 ? results.length : length;
  return first === 'win' ? count : -count;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 160);
}

function dedupeSnapshots(snapshots: EsportsSourceSnapshot[]): EsportsSourceSnapshot[] {
  const unique = new Map<string, EsportsSourceSnapshot>();
  for (const item of snapshots) {
    unique.set(`${item.source}:${item.entityType}:${item.externalId}`, item);
  }
  return [...unique.values()];
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeObservedAt(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const explicitUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const parsed = Date.parse(explicitUtc);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}
