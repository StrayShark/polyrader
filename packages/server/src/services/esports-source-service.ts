import type {
  EsportsGame,
  EsportsSourceDescriptor,
  EsportsSourceEntityType,
  EsportsSourceId,
  EsportsSourceSnapshot,
  EsportsSourceSyncResult,
} from '@polyrader/core';
import {
  EsportsSourceRepository,
  GridClient,
  LiquipediaClient,
  LLMRepository,
  OpenDotaClient,
  RiotClient,
} from '@polyrader/infra';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

interface ServiceDependencies {
  repo?: Pick<
    EsportsSourceRepository,
    'upsertSnapshots' | 'recordSyncRun' | 'getLatestSyncRun' | 'listSnapshots'
  >;
  grid?: Pick<GridClient, 'isConfiguredForGame' | 'getUpcomingSeriesForGame'>;
  openDota?: Pick<OpenDotaClient, 'getRecentProMatches' | 'getTeams' | 'getProPlayers'>;
  riot?: Pick<RiotClient, 'isConfigured' | 'getLatestLolPatch' | 'getValorantContent'>;
  liquipediaFactory?: (
    game: EsportsGame,
  ) => Pick<LiquipediaClient, 'searchTeams' | 'getCurrentRoster'>;
  legacyCs2?: Pick<LLMRepository, 'getUpcomingMatches' | 'getTeam'>;
  now?: () => Date;
}

export class EsportsSourceService {
  private readonly repo: NonNullable<ServiceDependencies['repo']>;
  private readonly grid: NonNullable<ServiceDependencies['grid']>;
  private readonly openDota: NonNullable<ServiceDependencies['openDota']>;
  private readonly riot: NonNullable<ServiceDependencies['riot']>;
  private readonly liquipediaFactory: NonNullable<ServiceDependencies['liquipediaFactory']>;
  private readonly legacyCs2: NonNullable<ServiceDependencies['legacyCs2']>;
  private readonly now: () => Date;

  constructor(dependencies: ServiceDependencies = {}) {
    this.repo = dependencies.repo ?? new EsportsSourceRepository();
    this.grid = dependencies.grid ?? new GridClient();
    this.openDota = dependencies.openDota ?? new OpenDotaClient();
    this.riot = dependencies.riot ?? new RiotClient();
    this.liquipediaFactory =
      dependencies.liquipediaFactory ?? ((game) => new LiquipediaClient({ game }));
    this.legacyCs2 = dependencies.legacyCs2 ?? new LLMRepository();
    this.now = dependencies.now ?? (() => new Date());
  }

  getCatalog(): Array<{
    game: EsportsGame;
    sources: EsportsSourceDescriptor[];
    latestSync: EsportsSourceSyncResult | null;
  }> {
    return GAMES.map((game) => ({
      game,
      sources: sourceCatalog(game, this.grid.isConfiguredForGame(game), this.riot.isConfigured()),
      latestSync: this.repo.getLatestSyncRun(game),
    }));
  }

  listSnapshots(
    game: EsportsGame,
    options: { entityType?: EsportsSourceEntityType; limit?: number } = {},
  ): EsportsSourceSnapshot[] {
    return this.repo.listSnapshots(game, options);
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
      await this.collect(sources, snapshots, 'grid', async () => {
        const series = await this.grid.getUpcomingSeriesForGame(game);
        return series.map((item) =>
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
      });
    } else {
      sources.push({
        source: 'grid',
        status: 'skipped',
        records: 0,
        message: 'GRID key or game title ID not configured',
      });
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
      await this.collect(sources, snapshots, 'opendota', async () => {
        const [matches, teams, players] = await Promise.all([
          this.openDota.getRecentProMatches(50),
          this.openDota.getTeams(100),
          this.openDota.getProPlayers(100),
        ]);
        const matchSnapshots = matches.map((item) =>
          snapshot({
            game,
            source: 'opendota',
            entityType: 'match',
            externalId: item.matchId,
            name: `${item.radiantTeamName} vs ${item.direTeamName}`,
            startsAt: item.startTime || undefined,
            status: 'finished',
            payload: { ...item },
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
            payload: { ...item },
            observedAt: this.now().toISOString(),
          }),
        );
        const playerSnapshots = players.map((item) =>
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
        return [...matchSnapshots, ...teamSnapshots, ...playerSnapshots];
      });
    }

    if (game === 'valorant') {
      if (this.riot.isConfigured()) {
        await this.collect(sources, snapshots, 'riot', async () => {
          const content = await this.riot.getValorantContent();
          return [
            snapshot({
              game,
              source: 'riot',
              entityType: 'content',
              externalId: content.version || this.now().toISOString().slice(0, 10),
              name: `VALORANT content ${content.version || 'current'}`,
              status: 'current',
              payload: {
                version: content.version,
                characters: content.characters,
                maps: content.maps,
                acts: content.acts,
              },
              observedAt: this.now().toISOString(),
            }),
          ];
        });
      } else {
        sources.push({
          source: 'riot',
          status: 'skipped',
          records: 0,
          message: 'RIOT_API_KEY not configured',
        });
      }
    }

    if (game === 'cs2') {
      await this.collect(sources, snapshots, 'hltv', async () => this.collectLegacyCs2Snapshots());
    }

    const stored = this.repo.upsertSnapshots(snapshots);
    const hasFailure = sources.some((source) => source.status === 'failed');
    const result: EsportsSourceSyncResult = {
      game,
      status:
        stored === 0 && hasFailure ? 'failed' : hasFailure || stored === 0 ? 'partial' : 'success',
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
          observedAt: row.updated_at ? String(row.updated_at) : observedAt,
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
            observedAt: team.updated_at ? String(team.updated_at) : observedAt,
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
  ): Promise<void> {
    try {
      const loaded = await loader();
      snapshots.push(...loaded);
      sourceResults.push({ source, status: 'success', records: loaded.length });
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
  riotConfigured: boolean,
): EsportsSourceDescriptor[] {
  const liquipedia = descriptor(
    game,
    'liquipedia',
    'Liquipedia',
    'public',
    true,
    ['events', 'schedules', 'rosters', 'transfers', 'team identity'],
    'https://liquipedia.net/api',
  );
  const grid = descriptor(
    game,
    'grid',
    'GRID',
    'licensed',
    gridConfigured,
    ['official schedule', 'official telemetry', 'series state'],
    'https://grid.gg/riot-games-and-grid-announce-exclusive-global-esports-data-partnership/',
  );

  if (game === 'cs2')
    return [
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
  if (game === 'lol')
    return [
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
      descriptor(
        game,
        'riot',
        'Riot Developer API',
        'api_key',
        riotConfigured,
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
  if (game === 'dota2')
    return [
      descriptor(
        game,
        'opendota',
        'OpenDota',
        'public',
        true,
        ['pro matches', 'teams', 'players', 'leagues', 'drafts'],
        'https://docs.opendota.com/',
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
  return [
    grid,
    descriptor(
      game,
      'riot',
      'Riot VAL API',
      'api_key',
      riotConfigured,
      ['content', 'player matches', 'ranked leaderboard', 'platform status'],
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
}

function descriptor(
  game: EsportsGame,
  source: EsportsSourceId,
  label: string,
  access: EsportsSourceDescriptor['access'],
  configured: boolean,
  capabilities: string[],
  docsUrl: string,
): EsportsSourceDescriptor {
  return {
    game,
    source,
    label,
    access,
    state: configured ? 'ready' : 'unconfigured',
    configured,
    capabilities,
    docsUrl,
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
    configured: false,
    capabilities,
    docsUrl,
    note: 'No supported production API connector; use only for manual verification or licensed access.',
  };
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
