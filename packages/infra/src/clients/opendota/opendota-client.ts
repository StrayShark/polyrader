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

export class OpenDotaClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: OpenDotaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.OPENDOTA_API_URL ?? 'https://api.opendota.com/api').replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.OPENDOTA_API_KEY ?? '';
    this.timeoutMs = options.timeoutMs ?? envNumber('OPENDOTA_TIMEOUT_MS', 10_000, 500, 30_000);
  }

  async getRecentProMatches(limit = 50): Promise<OpenDotaProMatch[]> {
    const rows = await this.fetchJson<OpenDotaProMatchResponse[]>('/proMatches');
    if (!Array.isArray(rows)) throw new Error('OpenDota proMatches returned an invalid payload');
    return rows.slice(0, clamp(limit, 1, 100)).map(mapProMatch).filter((match) => match.matchId !== '0');
  }

  async getTeams(limit = 100): Promise<OpenDotaTeam[]> {
    const rows = await this.fetchJson<OpenDotaTeamResponse[]>('/teams');
    if (!Array.isArray(rows)) throw new Error('OpenDota teams returned an invalid payload');
    return rows.slice(0, clamp(limit, 1, 200)).map(mapTeam).filter((team) => team.teamId !== '0');
  }

  async getProPlayers(limit = 100): Promise<OpenDotaProPlayer[]> {
    const rows = await this.fetchJson<OpenDotaProPlayerResponse[]>('/proPlayers');
    if (!Array.isArray(rows)) throw new Error('OpenDota proPlayers returned an invalid payload');
    return rows.slice(0, clamp(limit, 1, 500)).map(mapProPlayer).filter((player) => player.accountId !== '0');
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
    radiantWin: Boolean(row.radiant_win),
    leagueId: String(row.leagueid ?? ''),
    leagueName: String(row.league_name ?? 'Unknown League'),
    seriesId: row.series_id === undefined ? undefined : String(row.series_id),
    seriesType: row.series_type,
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
