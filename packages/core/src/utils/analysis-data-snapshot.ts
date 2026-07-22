import type {
  AnalysisDataMissingField,
  AnalysisDataSnapshot,
  AnalysisDataSource,
  MatchInfo,
  MatchLineups,
  Team,
} from '../types/index';

export interface AnalysisDataSnapshotOptions {
  capturedAt?: string;
  sourceUpdatedAt?: string;
  source?: AnalysisDataSource;
}

/** Build an immutable record of the competitive data supplied to an analysis. */
export function buildAnalysisDataSnapshot(
  match: MatchInfo,
  teamA: Team,
  teamB: Team,
  options: AnalysisDataSnapshotOptions = {},
): AnalysisDataSnapshot {
  const lineups = cloneLineups(match.lineups);
  const checks: Array<[AnalysisDataMissingField, boolean]> = [
    ['team_a_rank', hasRank(teamA)],
    ['team_b_rank', hasRank(teamB)],
    ['team_a_recent_matches', teamA.recentForm.last10Matches.length > 0],
    ['team_b_recent_matches', teamB.recentForm.last10Matches.length > 0],
    ['team_a_roster', teamA.players.length >= 5],
    ['team_b_roster', teamB.players.length >= 5],
    ['team_a_map_pool', teamA.mapPool.maps.length > 0],
    ['team_b_map_pool', teamB.mapPool.maps.length > 0],
    ['team_a_lineup', (lineups?.teamA.players.length ?? 0) >= 5],
    ['team_b_lineup', (lineups?.teamB.players.length ?? 0) >= 5],
  ];
  const missingFields = checks.filter(([, ready]) => !ready).map(([field]) => field);
  const completeCount = checks.length - missingFields.length;

  return {
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    sourceUpdatedAt: options.sourceUpdatedAt,
    source: options.source ?? 'database',
    completeness: completeCount / checks.length,
    isComplete: missingFields.length === 0,
    missingFields,
    lineupConfirmed: Boolean(lineups?.teamA.isConfirmed && lineups?.teamB.isConfirmed),
    teamA: cloneTeam(teamA),
    teamB: cloneTeam(teamB),
    lineups,
  };
}

function hasRank(team: Team): boolean {
  return Number.isFinite(team.rank) && team.rank > 0 && team.rank < 999;
}

function cloneTeam(team: Team): Team {
  return {
    ...team,
    players: team.players.map((player) => ({ ...player })),
    recentForm: {
      ...team.recentForm,
      last10Matches: team.recentForm.last10Matches.map((result) => ({ ...result })),
    },
    mapPool: { maps: team.mapPool.maps.map((map) => ({ ...map })) },
    headToHead: team.headToHead.map((record) => ({
      ...record,
      mapResults: record.mapResults.map((map) => ({ ...map })),
    })),
  };
}

function cloneLineups(lineups: MatchLineups | undefined): MatchLineups | undefined {
  if (!lineups) return undefined;
  return {
    teamA: cloneLineup(lineups.teamA),
    teamB: cloneLineup(lineups.teamB),
  };
}

function cloneLineup(lineup: MatchLineups['teamA']): MatchLineups['teamA'] {
  return {
    ...lineup,
    players: lineup.players.map((player) => ({ ...player })),
    missingKeyPlayers: [...lineup.missingKeyPlayers],
  };
}
