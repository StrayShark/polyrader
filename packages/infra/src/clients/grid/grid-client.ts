/**
 * GRID Esports Data client.
 *
 * Provides official CS2 esports data via GRID's GraphQL API.
 * Authentication: x-api-key header.
 *
 * Two endpoints:
 *   - Central Data:  https://api-op.grid.gg/central-data/graphql  (teams, series, tournaments)
 *   - Series State:  https://api-op.grid.gg/live-data-feed/series-state/graphql  (match stats)
 *
 * Open Access tier: CS2 + Dota 2 historical data, 20 req/min Central Data.
 */

import type { EsportsGame, Team, HeadToHead } from '@polyrader/core';

/** CS:GO/CS2 title ID on GRID */
const CS2_TITLE_ID = '1';

function gridCentralUrl(): string {
  return process.env.GRID_GRAPHQL_URL || 'https://api-op.grid.gg/central-data/graphql';
}

function gridStateUrl(): string {
  return process.env.GRID_STATE_URL || 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
}

export function getGridTitleId(game: EsportsGame): string | null {
  if (game === 'cs2') return process.env.GRID_TITLE_ID_CS2 || CS2_TITLE_ID;
  const key = game === 'lol'
    ? 'GRID_TITLE_ID_LOL'
    : game === 'dota2'
      ? 'GRID_TITLE_ID_DOTA2'
      : 'GRID_TITLE_ID_VALORANT';
  return process.env[key] || null;
}

/** Rate limiter: 20 req/min for Open Access Central Data */
const MIN_INTERVAL_MS = 3100; // ~19 req/min
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function graphql<T>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const apiKey = process.env.GRID_API_KEY || '';
  if (!apiKey) {
    throw new Error('GRID_API_KEY not configured');
  }

  await rateLimit();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GRID API HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`GRID GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}

// ─── Types ───────────────────────────────────────────────────────────────

interface GridTeam {
  id: string;
  name: string;
  nameShortened?: string;
  logoUrl?: string;
  rating?: number;
}

interface GridSeriesTeam {
  baseInfo: { id: string; name: string };
}

interface GridSeries {
  id: string;
  startTimeScheduled: string;
  format?: { name: string };
  type?: string;
  teams: GridSeriesTeam[];
  tournament: { name: string; id: string };
  players?: Array<{ id: string; nickname: string; fullName?: string }>;
}

interface GridSeriesStateTeam {
  won: boolean;
  score: number;
  kills: number;
  deaths: number;
  players: Array<{
    id: string;
    name: string;
    kills: number;
    deaths: number;
  }>;
}

interface GridSeriesState {
  startedAt?: string;
  finished: boolean;
  teams: GridSeriesStateTeam[];
}

// ─── Public API ──────────────────────────────────────────────────────────

export class GridClient {
  /**
   * Search CS2 teams by name.
   * Returns teams sorted by name similarity to the query.
   */
  async searchTeams(name: string, titleId = CS2_TITLE_ID): Promise<
    Array<{ teamId: string; name: string; rank: number }>
  > {
    const query = `
      query SearchTeams($titleId: ID!, $nameFilter: StringFilter!) {
        teams(filter: { titleId: $titleId, name: $nameFilter }, first: 10) {
          edges {
            node {
              id
              name
              rating
            }
          }
        }
      }
    `;

    const data = await graphql<{
      teams: { edges: Array<{ node: GridTeam }> };
    }>(gridCentralUrl(), query, {
      titleId,
      nameFilter: { contains: name },
    });

    return data.teams.edges.map((e) => ({
      teamId: e.node.id,
      name: e.node.name,
      rank: e.node.rating ?? 999,
    }));
  }

  /**
   * Get a team by ID from GRID.
   */
  async getTeam(teamId: string): Promise<Team | null> {
    const query = `
      query GetTeam($id: ID!) {
        team(id: $id) {
          id
          name
          nameShortened
          logoUrl
          rating
        }
      }
    `;

    try {
      const data = await graphql<{ team: GridTeam | null }>(
        gridCentralUrl(),
        query,
        { id: teamId },
      );

      if (!data.team) return null;

      return {
        teamId: data.team.id,
        name: data.team.name,
        logo: data.team.logoUrl ?? '',
        rank: data.team.rating ?? 999,
        region: '',
        players: [],
        recentForm: { last10Matches: [], winRate: 0, streak: 0, averageRating: 0 },
        mapPool: { maps: [] },
        headToHead: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Get upcoming CS2 series from GRID.
   * Note: Open Access may have limited future CS2 data.
   *
   * @param historyMonths  Months to look back for recent series (default 3)
   */
  async getUpcomingSeries(
    _historyMonths = 3,
    titleId = CS2_TITLE_ID,
    throwOnError = false,
  ): Promise<
    Array<{
      seriesId: string;
      teamAId: string;
      teamBId: string;
      teamAName: string;
      teamBName: string;
      date: string;
      eventName: string;
      format: string;
    }>
  > {
    const now = new Date().toISOString();
    const query = `
      query UpcomingSeries($titleId: ID!, $startTime: String!) {
        allSeries(
          filter: { titleId: $titleId, startTimeScheduled: { gte: $startTime } }
          orderBy: StartTimeScheduled
          first: 50
        ) {
          totalCount
          edges {
            node {
              id
              startTimeScheduled
              format { name }
              teams { baseInfo { id name } }
              tournament { name id }
            }
          }
        }
      }
    `;

    try {
      const data = await graphql<{
        allSeries: { edges: Array<{ node: GridSeries }> };
      }>(gridCentralUrl(), query, { titleId, startTime: now });

      return data.allSeries.edges.map((e) => {
        const node = e.node;
        const teamA = node.teams[0]?.baseInfo;
        const teamB = node.teams[1]?.baseInfo;
        return {
          seriesId: node.id,
          teamAId: teamA?.id ?? '',
          teamBId: teamB?.id ?? '',
          teamAName: teamA?.name ?? '',
          teamBName: teamB?.name ?? '',
          date: node.startTimeScheduled,
          eventName: node.tournament?.name ?? 'Unknown',
          format: this.normalizeFormat(node.format?.name),
        };
      });
    } catch (error) {
      if (throwOnError) throw error;
      return [];
    }
  }

  async getUpcomingSeriesForGame(game: EsportsGame): ReturnType<GridClient['getUpcomingSeries']> {
    const titleId = getGridTitleId(game);
    if (!titleId) throw new Error(`GRID title ID is not configured for ${game}`);
    return this.getUpcomingSeries(3, titleId, true);
  }

  isConfiguredForGame(game: EsportsGame): boolean {
    return Boolean(process.env.GRID_API_KEY && getGridTitleId(game));
  }

  /**
   * Get recent series for a team (for roster and form analysis).
   *
   * @param teamId  GRID team ID
   * @param historyMonths  How many months of history to fetch (default 3)
   */
  async getTeamSeries(
    teamId: string,
    historyMonths = 3,
    titleId = CS2_TITLE_ID,
  ): Promise<
    Array<{
      seriesId: string;
      teamAId: string;
      teamBId: string;
      teamAName: string;
      teamBName: string;
      date: string;
      eventName: string;
      format: string;
    }>
  > {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - historyMonths);
    const cutoffStr = cutoff.toISOString();

    const query = `
      query TeamSeries($titleId: ID!, $teamIds: IdFilter!, $cutoff: String!) {
        allSeries(
          filter: {
            titleId: $titleId
            teamIds: $teamIds
            startTimeScheduled: { gte: $cutoff }
          }
          orderBy: StartTimeScheduled
          first: 20
        ) {
          edges {
            node {
              id
              startTimeScheduled
              format { name }
              teams { baseInfo { id name } }
              tournament { name id }
            }
          }
        }
      }
    `;

    try {
      const data = await graphql<{
        allSeries: { edges: Array<{ node: GridSeries }> };
      }>(gridCentralUrl(), query, {
        titleId,
        teamIds: { in: [teamId] },
        cutoff: cutoffStr,
      });

      return data.allSeries.edges.map((e) => {
        const node = e.node;
        const teamA = node.teams[0]?.baseInfo;
        const teamB = node.teams[1]?.baseInfo;
        return {
          seriesId: node.id,
          teamAId: teamA?.id ?? '',
          teamBId: teamB?.id ?? '',
          teamAName: teamA?.name ?? '',
          teamBName: teamB?.name ?? '',
          date: node.startTimeScheduled,
          eventName: node.tournament?.name ?? 'Unknown',
          format: this.normalizeFormat(node.format?.name),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get series state (match results, player stats) for a completed series.
   */
  async getSeriesState(
    seriesId: string,
  ): Promise<{
    finished: boolean;
    teamAWon: boolean;
    teamAScore: number;
    teamBScore: number;
    players: Array<{
      id: string;
      name: string;
      kills: number;
      deaths: number;
    }>;
  } | null> {
    const query = `
      query SeriesState($id: ID!) {
        seriesState(id: $id) {
          startedAt
          finished
          teams {
            won
            score
            kills
            deaths
            players {
              id
              name
              kills
              deaths
            }
          }
        }
      }
    `;

    try {
      const data = await graphql<{ seriesState: GridSeriesState | null }>(
        gridStateUrl(),
        query,
        { id: seriesId },
      );

      if (!data.seriesState) return null;

      const teams = data.seriesState.teams;
      const allPlayers = teams.flatMap((t) => t.players);

      return {
        finished: data.seriesState.finished,
        teamAWon: teams[0]?.won ?? false,
        teamAScore: teams[0]?.score ?? 0,
        teamBScore: teams[1]?.score ?? 0,
        players: allPlayers,
      };
    } catch {
      return null;
    }
  }

  /**
   * Build a HeadToHead from GRID historical series between two teams.
   *
   * @param teamAId  GRID team ID
   * @param teamBId  GRID team ID
   * @param historyMonths  Months of history to consider (default 3)
   */
  async getHeadToHead(
    teamAId: string,
    teamBId: string,
    historyMonths = 3,
  ): Promise<HeadToHead> {
    const series = await this.getTeamSeries(teamAId, historyMonths);
    const h2hSeries = series.filter(
      (s) =>
        (s.teamAId === teamAId && s.teamBId === teamBId) ||
        (s.teamAId === teamBId && s.teamBId === teamAId),
    );

    let wins = 0;
    let losses = 0;
    let lastMatch = '';
    const mapResults: Array<{ map: string; result: 'win' | 'loss'; score: string }> = [];

    for (const s of h2hSeries) {
      const state = await this.getSeriesState(s.seriesId);
      if (!state || !state.finished) continue;

      const aIsTeamA = s.teamAId === teamAId;
      if ((aIsTeamA && state.teamAWon) || (!aIsTeamA && !state.teamAWon)) {
        wins++;
      } else {
        losses++;
      }

      if (!lastMatch) lastMatch = s.date;
    }

    return {
      opponent: teamBId,
      matchesPlayed: h2hSeries.length,
      wins,
      losses,
      lastMatch,
      mapResults,
    };
  }

  /**
   * Get team roster from recent series (GRID doesn't store rosters directly,
   * so we derive them from series player data).
   *
   * @param teamId  GRID team ID
   * @param historyMonths  Months of history to search (default 3)
   */
  async getTeamRoster(
    teamId: string,
    historyMonths = 3,
  ): Promise<
    Array<{
      playerId: string;
      nickname: string;
      name: string;
    }>
  > {
    const series = await this.getTeamSeries(teamId, historyMonths);

    // Get the most recent finished series with player data
    for (const s of series.slice().reverse()) {
      const state = await this.getSeriesState(s.seriesId);
      if (state && state.players.length > 0) {
        return state.players.map((p) => ({
          playerId: p.id,
          nickname: p.name,
          name: p.name,
        }));
      }
    }

    return [];
  }

  /** Check if GRID API is configured and accessible */
  async testConnection(): Promise<boolean> {
    if (!process.env.GRID_API_KEY) return false;
    try {
      const query = `{ titles { id name } }`;
      await graphql(gridCentralUrl(), query);
      return true;
    } catch {
      return false;
    }
  }

  /** Normalize GRID format names to BO1/BO3/BO5 */
  private normalizeFormat(
    format: string | undefined,
  ): 'BO1' | 'BO3' | 'BO5' {
    if (!format) return 'BO3';
    const f = format.toLowerCase();
    if (f.includes('best-of-1') || f.includes('bo1')) return 'BO1';
    if (f.includes('best-of-5') || f.includes('bo5')) return 'BO5';
    return 'BO3';
  }
}

/** Singleton instance */
let _gridClient: GridClient | null = null;

export function getGridClient(): GridClient {
  if (!_gridClient) {
    _gridClient = new GridClient();
  }
  return _gridClient;
}
