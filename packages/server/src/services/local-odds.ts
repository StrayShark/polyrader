import type { MatchInfo, Team } from '@polyrader/core';

export interface LocalOddsEstimate {
  teamAProbability: number;
  teamBProbability: number;
  confidence: number;
  factors: Array<{ name: 'rank' | 'recent-form' | 'map-pool' | 'lineup'; probability: number; weight: number }>;
}

/** Evidence-only local practice price. Missing inputs remain neutral. */
export function estimateLocalOdds(match: MatchInfo): LocalOddsEstimate {
  const factors: LocalOddsEstimate['factors'] = [];
  const teamA = match.teamDetails?.teamA;
  const teamB = match.teamDetails?.teamB;

  const rankA = validRank(teamA?.rank ?? match.teamA.rank);
  const rankB = validRank(teamB?.rank ?? match.teamB.rank);
  if (rankA && rankB) {
    factors.push({ name: 'rank', probability: logistic((rankB - rankA) / 18), weight: 0.45 });
  }

  if (hasRecentForm(teamA) && hasRecentForm(teamB)) {
    const probability = clamp(0.5 + (teamA.recentForm.winRate - teamB.recentForm.winRate) * 0.55, 0.2, 0.8);
    factors.push({ name: 'recent-form', probability, weight: 0.30 });
  }

  const mapA = weightedMapWinRate(teamA);
  const mapB = weightedMapWinRate(teamB);
  if (mapA !== undefined && mapB !== undefined) {
    factors.push({ name: 'map-pool', probability: clamp(0.5 + (mapA - mapB) * 0.45, 0.2, 0.8), weight: 0.15 });
  }

  const ratingA = lineupRating(match, 'a');
  const ratingB = lineupRating(match, 'b');
  if (ratingA !== undefined && ratingB !== undefined) {
    factors.push({ name: 'lineup', probability: logistic((ratingA - ratingB) * 8), weight: 0.10 });
  }

  if (factors.length === 0) {
    return { teamAProbability: 0.5, teamBProbability: 0.5, confidence: 0, factors };
  }
  const weight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const evidenceProbability = factors.reduce((sum, factor) => sum + factor.probability * factor.weight, 0) / weight;
  const confidence = Math.min(1, weight);
  const teamAProbability = clamp(0.5 + (evidenceProbability - 0.5) * confidence, 0.2, 0.8);
  return {
    teamAProbability,
    teamBProbability: 1 - teamAProbability,
    confidence,
    factors,
  };
}

function validRank(value: number | undefined): number | undefined {
  return Number.isFinite(value) && value && value > 0 && value < 500 ? value : undefined;
}

function hasRecentForm(team: Team | undefined): team is Team {
  return !!team && team.recentForm.last10Matches.length > 0 && Number.isFinite(team.recentForm.winRate);
}

function weightedMapWinRate(team: Team | undefined): number | undefined {
  const maps = team?.mapPool.maps.filter((map) => map.matchesPlayed > 0 && Number.isFinite(map.winRate)) ?? [];
  if (maps.length === 0) return undefined;
  const matches = maps.reduce((sum, map) => sum + map.matchesPlayed, 0);
  return maps.reduce((sum, map) => sum + map.winRate * map.matchesPlayed, 0) / matches;
}

function lineupRating(match: MatchInfo, side: 'a' | 'b'): number | undefined {
  const players = side === 'a' ? match.lineups?.teamA.players : match.lineups?.teamB.players;
  const ratings = (players ?? []).map((player) => player.rating).filter((rating) => rating > 0);
  if (ratings.length < 5) return undefined;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function logistic(value: number): number {
  return clamp(1 / (1 + Math.exp(-value)), 0.2, 0.8);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
