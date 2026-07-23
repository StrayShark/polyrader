export interface OpenDotaProMatch {
  matchId: string;
  duration: number;
  startTime: string;
  radiantTeamId: string;
  radiantTeamName: string;
  direTeamId: string;
  direTeamName: string;
  radiantWin: boolean;
  leagueId: string;
  leagueName: string;
  seriesId?: string;
  seriesType?: number;
}

export interface OpenDotaTeam {
  teamId: string;
  name: string;
  tag: string;
  rating: number;
  wins: number;
  losses: number;
  lastMatchTime: string;
  logoUrl: string;
}

export interface OpenDotaProPlayer {
  accountId: string;
  steamId: string;
  nickname: string;
  realName: string;
  countryCode: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  lastMatchTime: string;
}

export interface OpenDotaTeamPlayer {
  accountId: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  isCurrentTeamMember: boolean | null;
}

export interface OpenDotaTeamMatch {
  matchId: string;
  duration: number;
  startTime: string;
  radiant: boolean;
  radiantWin: boolean;
  leagueId: string;
  leagueName: string;
  opposingTeamId: string;
  opposingTeamName: string;
}

export interface OpenDotaDraftAction {
  isPick: boolean;
  heroId: number;
  team: 0 | 1;
  order: number;
}

export interface OpenDotaMatchPlayer {
  accountId: string;
  playerSlot: number;
  nickname: string;
  realName: string;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  goldPerMinute: number;
  xpPerMinute: number;
}

export interface OpenDotaMatchDetails {
  matchId: string;
  duration: number;
  startTime: string;
  radiantTeamId: string;
  radiantTeamName: string;
  direTeamId: string;
  direTeamName: string;
  radiantWin: boolean | null;
  patchId?: number;
  picksBans: OpenDotaDraftAction[];
  players: OpenDotaMatchPlayer[];
}

export interface OpenDotaPatch {
  id: number;
  name: string;
  date: string;
}

interface OpenDotaClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

interface OpenDotaProMatchResponse {
  match_id?: number;
  duration?: number;
  start_time?: number;
  radiant_team_id?: number;
  radiant_name?: string;
  dire_team_id?: number;
  dire_name?: string;
  radiant_win?: boolean;
  leagueid?: number;
  league_name?: string;
  series_id?: number;
  series_type?: number;
}

interface OpenDotaTeamResponse {
  team_id?: number;
  rating?: number;
  wins?: number;
  losses?: number;
  last_match_time?: number;
  name?: string;
  tag?: string;
  logo_url?: string;
}

interface OpenDotaProPlayerResponse {
  account_id?: number;
  steamid?: string;
  personaname?: string;
  name?: string;
  country_code?: string;
  team_id?: number;
  team_name?: string;
  team_tag?: string;
  last_match_time?: number;
}

interface OpenDotaTeamPlayerResponse {
  account_id?: number;
  name?: string;
  games_played?: number;
  wins?: number;
  is_current_team_member?: boolean;
}

interface OpenDotaTeamMatchResponse {
  match_id?: number;
  duration?: number;
  start_time?: number;
  radiant?: boolean;
  radiant_win?: boolean;
  leagueid?: number;
  league_name?: string;
  opposing_team_id?: number;
  opposing_team_name?: string;
}

interface OpenDotaMatchDetailsResponse extends OpenDotaProMatchResponse {
  patch?: number;
  picks_bans?: Array<{
    is_pick?: boolean;
    hero_id?: number;
    team?: number;
    order?: number;
  }>;
  players?: Array<{
    account_id?: number;
    player_slot?: number;
    personaname?: string | null;
    name?: string | null;
    hero_id?: number;
    kills?: number;
    deaths?: number;
    assists?: number;
    gold_per_min?: number;
    xp_per_min?: number;
  }>;
}

interface OpenDotaPatchResponse {
  id?: number;
  name?: string;
  date?: string;
}

export class OpenDotaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: OpenDotaClientOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.OPENDOTA_API_URL ??
      'https://api.opendota.com/api'
    ).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.OPENDOTA_API_KEY ?? '';
    this.timeoutMs = options.timeoutMs ?? envNumber('OPENDOTA_TIMEOUT_MS', 10_000, 500, 30_000);
  }

  async getRecentProMatches(limit = 50): Promise<OpenDotaProMatch[]> {
    const rows = await this.fetchJson<OpenDotaProMatchResponse[]>('/proMatches');
    if (!Array.isArray(rows)) throw new Error('OpenDota proMatches returned an invalid payload');
    return rows
      .slice(0, clamp(limit, 1, 100))
      .map(mapProMatch)
      .filter((match) => match.matchId !== '0');
  }

  async getTeams(limit = 100): Promise<OpenDotaTeam[]> {
    const rows = await this.fetchJson<OpenDotaTeamResponse[]>('/teams');
    if (!Array.isArray(rows)) throw new Error('OpenDota teams returned an invalid payload');
    return rows
      .slice(0, clamp(limit, 1, 1000))
      .map(mapTeam)
      .filter((team) => team.teamId !== '0');
  }

  async getProPlayers(limit = 100): Promise<OpenDotaProPlayer[]> {
    const rows = await this.fetchJson<OpenDotaProPlayerResponse[]>('/proPlayers');
    if (!Array.isArray(rows)) throw new Error('OpenDota proPlayers returned an invalid payload');
    return rows
      .slice(0, clamp(limit, 1, 500))
      .map(mapProPlayer)
      .filter((player) => player.accountId !== '0');
  }

  async getTeamPlayers(teamId: string, limit = 10): Promise<OpenDotaTeamPlayer[]> {
    assertTeamId(teamId);
    const rows = await this.fetchJson<OpenDotaTeamPlayerResponse[]>(
      `/teams/${encodeURIComponent(teamId)}/players`,
    );
    if (!Array.isArray(rows)) throw new Error('OpenDota team players returned an invalid payload');
    return rows
      .slice(0, clamp(limit, 1, 50))
      .map((row) => ({
        accountId: String(row.account_id ?? 0),
        name: String(row.name ?? row.account_id ?? 'Unknown Player'),
        gamesPlayed: Math.max(0, Number(row.games_played) || 0),
        wins: Math.max(0, Number(row.wins) || 0),
        isCurrentTeamMember:
          typeof row.is_current_team_member === 'boolean' ? row.is_current_team_member : null,
      }))
      .filter((player) => player.accountId !== '0');
  }

  async getTeamMatches(teamId: string, limit = 10): Promise<OpenDotaTeamMatch[]> {
    assertTeamId(teamId);
    const rows = await this.fetchJson<OpenDotaTeamMatchResponse[]>(
      `/teams/${encodeURIComponent(teamId)}/matches`,
    );
    if (!Array.isArray(rows)) throw new Error('OpenDota team matches returned an invalid payload');
    return rows
      .slice(0, clamp(limit, 1, 50))
      .map((row) => ({
        matchId: String(row.match_id ?? 0),
        duration: Math.max(0, Number(row.duration) || 0),
        startTime: toIso(row.start_time),
        radiant: row.radiant === true,
        radiantWin: row.radiant_win === true,
        leagueId: String(row.leagueid ?? ''),
        leagueName: String(row.league_name ?? 'Unknown League'),
        opposingTeamId: String(row.opposing_team_id ?? ''),
        opposingTeamName: String(row.opposing_team_name ?? 'Unknown Team'),
      }))
      .filter((match) => match.matchId !== '0');
  }

  async getMatchDetails(matchId: string): Promise<OpenDotaMatchDetails> {
    if (!/^\d+$/.test(matchId)) throw new Error(`Invalid OpenDota match ID ${matchId}`);
    const row = await this.fetchJson<OpenDotaMatchDetailsResponse>(
      `/matches/${encodeURIComponent(matchId)}`,
    );
    if (!row || typeof row !== 'object') {
      throw new Error('OpenDota match returned an invalid payload');
    }
    const mapped = mapMatchDetails(row);
    if (mapped.matchId === '0') throw new Error('OpenDota match payload is missing match_id');
    return mapped;
  }

  async getPatches(): Promise<OpenDotaPatch[]> {
    const rows = await this.fetchJson<OpenDotaPatchResponse[]>('/constants/patch');
    if (!Array.isArray(rows))
      throw new Error('OpenDota patch constants returned an invalid payload');
    return rows
      .map((row) => ({
        id: Number(row.id) || 0,
        name: String(row.name ?? ''),
        date: String(row.date ?? ''),
      }))
      .filter((patch) => patch.id > 0 && patch.name);
  }

  async getCurrentPatch(): Promise<OpenDotaPatch | null> {
    const patches = await this.getPatches();
    return patches.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getRecentProMatches(1);
      return true;
    } catch {
      return false;
    }
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.apiKey) url.searchParams.set('api_key', this.apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OpenDota API HTTP ${response.status}: ${text.slice(0, 160)}`);
      }
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapProMatch(row: OpenDotaProMatchResponse): OpenDotaProMatch {
  const startSeconds = Number(row.start_time) || 0;
  return {
    matchId: String(row.match_id ?? 0),
    duration: Math.max(0, Number(row.duration) || 0),
    startTime: startSeconds > 0 ? new Date(startSeconds * 1000).toISOString() : '',
    radiantTeamId: String(row.radiant_team_id ?? ''),
    radiantTeamName: String(row.radiant_name ?? 'Radiant'),
    direTeamId: String(row.dire_team_id ?? ''),
    direTeamName: String(row.dire_name ?? 'Dire'),
    radiantWin: row.radiant_win === true,
    leagueId: String(row.leagueid ?? ''),
    leagueName: String(row.league_name ?? 'Unknown League'),
    seriesId: row.series_id === undefined ? undefined : String(row.series_id),
    seriesType: row.series_type,
  };
}

function mapMatchDetails(row: OpenDotaMatchDetailsResponse): OpenDotaMatchDetails {
  const startSeconds = Number(row.start_time) || 0;
  const matchId = String(row.match_id ?? 0);
  return {
    matchId,
    duration: Math.max(0, Number(row.duration) || 0),
    startTime: startSeconds > 0 ? new Date(startSeconds * 1000).toISOString() : '',
    radiantTeamId: String(row.radiant_team_id ?? ''),
    radiantTeamName: String(row.radiant_name ?? 'Radiant'),
    direTeamId: String(row.dire_team_id ?? ''),
    direTeamName: String(row.dire_name ?? 'Dire'),
    radiantWin: typeof row.radiant_win === 'boolean' ? row.radiant_win : null,
    patchId: Number(row.patch) > 0 ? Number(row.patch) : undefined,
    picksBans: (row.picks_bans ?? []).flatMap((item) => {
      const team = Number(item.team);
      if (team !== 0 && team !== 1) return [];
      return [
        {
          isPick: item.is_pick === true,
          heroId: Number(item.hero_id) || 0,
          team: team as 0 | 1,
          order: Number(item.order) || 0,
        },
      ];
    }),
    players: (row.players ?? []).flatMap((item) => {
      const playerSlot = Number(item.player_slot);
      if (!Number.isFinite(playerSlot)) return [];
      const accountId =
        item.account_id != null ? String(item.account_id) : `${matchId}-slot-${playerSlot}`;
      return [
        {
          accountId,
          playerSlot,
          nickname: String(item.personaname ?? item.name ?? accountId),
          realName: String(item.name ?? ''),
          heroId: Number(item.hero_id) || 0,
          kills: Math.max(0, Number(item.kills) || 0),
          deaths: Math.max(0, Number(item.deaths) || 0),
          assists: Math.max(0, Number(item.assists) || 0),
          goldPerMinute: Math.max(0, Number(item.gold_per_min) || 0),
          xpPerMinute: Math.max(0, Number(item.xp_per_min) || 0),
        },
      ];
    }),
  };
}

function mapTeam(row: OpenDotaTeamResponse): OpenDotaTeam {
  return {
    teamId: String(row.team_id ?? 0),
    name: String(row.name ?? row.tag ?? 'Unknown Team'),
    tag: String(row.tag ?? ''),
    rating: Number(row.rating) || 0,
    wins: Math.max(0, Number(row.wins) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    lastMatchTime: toIso(row.last_match_time),
    logoUrl: String(row.logo_url ?? ''),
  };
}

function mapProPlayer(row: OpenDotaProPlayerResponse): OpenDotaProPlayer {
  return {
    accountId: String(row.account_id ?? 0),
    steamId: String(row.steamid ?? ''),
    nickname: String(row.personaname ?? row.name ?? 'Unknown Player'),
    realName: String(row.name ?? ''),
    countryCode: String(row.country_code ?? ''),
    teamId: String(row.team_id ?? ''),
    teamName: String(row.team_name ?? ''),
    teamTag: String(row.team_tag ?? ''),
    lastMatchTime: toIso(row.last_match_time),
  };
}

function assertTeamId(teamId: string): void {
  if (!/^\d+$/.test(teamId)) throw new Error(`Invalid OpenDota team ID ${teamId}`);
}

function toIso(value: unknown): string {
  const seconds = Number(value) || 0;
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : '';
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
