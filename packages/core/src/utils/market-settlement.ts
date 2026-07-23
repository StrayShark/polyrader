import { parsePolymarketMatch } from './match-parser';

export type SettledMarketKind =
  | 'match_winner'
  | 'map_winner'
  | 'handicap'
  | 'total_maps'
  | 'correct_score'
  | 'unsupported';

export type StructuredLegResult = 'won' | 'lost' | 'push' | 'pending';

export interface StructuredMapResult {
  mapNumber: number;
  mapName?: string;
  winnerTeamName?: string;
  teamARounds?: number;
  teamBRounds?: number;
}

export interface StructuredMatchResult {
  /** Series winner team name */
  winnerTeamName?: string;
  teamAName?: string;
  teamBName?: string;
  /** Series maps won, e.g. 2-1 */
  teamAMapsWon?: number;
  teamBMapsWon?: number;
  maps?: StructuredMapResult[];
  /** Optional handicap line on maps, positive favors team A */
  mapHandicapLine?: number;
  /** Optional total maps line, e.g. 2.5 */
  totalMapsLine?: number;
}

export interface MarketSettlementDecision {
  kind: SettledMarketKind;
  result: StructuredLegResult;
  reason: string;
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function namesMatch(a: string | undefined, b: string | undefined): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function classifySettledMarketKind(question: string | undefined): SettledMarketKind {
  if (!question) return 'unsupported';
  const lower = question.toLowerCase();
  // Prop / specials are never series settlement kinds even when a parent description mentions teams.
  if (
    /\b(baron|dragon|inhibitor|quadra|penta|odd\/even|both teams|any player|first blood|kill\b)\b/.test(
      lower,
    )
  ) {
    return 'unsupported';
  }
  const parsed = parsePolymarketMatch(question);
  if (parsed?.isMapMarket) return 'map_winner';
  if (/\bgame\s+\d+\s+winner\b/.test(lower) && /\svs\s/.test(lower)) return 'map_winner';
  if (/\bhandicap\b|\bspread\b|[+-]\d+\.5/.test(lower)) return 'handicap';
  if (
    /\btotal maps\b|\btotal rounds\b|\bgames?\s+total\b|\btotal\s+games\b|over\/under|o\/u\s*\d/.test(
      lower,
    )
  ) {
    return 'total_maps';
  }
  if (/\bcorrect score\b/.test(lower)) return 'correct_score';
  if (parsed && !parsed.isMapMarket) return 'match_winner';
  return 'unsupported';
}

export function extractMapNumber(question: string | undefined): number | null {
  if (!question) return null;
  return parsePolymarketMatch(question)?.mapNumber ?? null;
}

export function extractHandicapLine(question: string | undefined): number | null {
  if (!question) return null;
  const match = question.match(/([+-]?\d+(?:\.\d+)?)\s*(?:maps?)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function extractTotalMapsLine(question: string | undefined): number | null {
  if (!question) return null;
  const match = question.match(/(?:o\/u|over\/under|total(?:\s+maps)?)\s*(\d+(?:\.\d+)?)/i)
    ?? question.match(/(\d+\.5)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function extractCorrectScore(question: string | undefined): string | null {
  if (!question) return null;
  const match = question.match(/\b(\d\s*-\s*\d)\b/);
  return match ? match[1].replace(/\s+/g, '') : null;
}

/**
 * Decide whether a practice-bet leg wins/loses/pushes against a structured match result.
 * Returns `pending` when the adapter lacks enough structured data — caller must not auto-settle.
 */
export function settleLegAgainstStructuredResult(input: {
  selection: string;
  marketQuestion?: string;
  result: StructuredMatchResult;
}): MarketSettlementDecision {
  const kind = classifySettledMarketKind(input.marketQuestion);
  switch (kind) {
    case 'match_winner':
      return settleMatchWinner(input.selection, input.result);
    case 'map_winner':
      return settleMapWinner(input.selection, input.marketQuestion, input.result);
    case 'handicap':
      return settleHandicap(input.selection, input.marketQuestion, input.result);
    case 'total_maps':
      return settleTotalMaps(input.selection, input.marketQuestion, input.result);
    case 'correct_score':
      return settleCorrectScore(input.selection, input.marketQuestion, input.result);
    default:
      return { kind, result: 'pending', reason: 'unsupported_market' };
  }
}

function settleMatchWinner(selection: string, result: StructuredMatchResult): MarketSettlementDecision {
  if (!result.winnerTeamName) {
    return { kind: 'match_winner', result: 'pending', reason: 'missing_series_winner' };
  }
  const won = namesMatch(selection, result.winnerTeamName);
  return {
    kind: 'match_winner',
    result: won ? 'won' : 'lost',
    reason: won ? 'series_winner_matched' : 'series_winner_mismatch',
  };
}

function settleMapWinner(
  selection: string,
  question: string | undefined,
  result: StructuredMatchResult,
): MarketSettlementDecision {
  const mapNumber = extractMapNumber(question);
  if (!mapNumber) {
    return { kind: 'map_winner', result: 'pending', reason: 'missing_map_number' };
  }
  const map = (result.maps ?? []).find((item) => item.mapNumber === mapNumber);
  if (!map?.winnerTeamName) {
    return { kind: 'map_winner', result: 'pending', reason: 'map_result_unavailable' };
  }
  const won = namesMatch(selection, map.winnerTeamName);
  return {
    kind: 'map_winner',
    result: won ? 'won' : 'lost',
    reason: won ? `map_${mapNumber}_winner_matched` : `map_${mapNumber}_winner_mismatch`,
  };
}

function settleHandicap(
  selection: string,
  question: string | undefined,
  result: StructuredMatchResult,
): MarketSettlementDecision {
  if (result.teamAMapsWon === undefined || result.teamBMapsWon === undefined) {
    return { kind: 'handicap', result: 'pending', reason: 'missing_series_score' };
  }
  const line = result.mapHandicapLine ?? extractHandicapLine(question);
  if (line === null || !Number.isFinite(line)) {
    return { kind: 'handicap', result: 'pending', reason: 'missing_handicap_line' };
  }

  // Convention: positive line favors team A (A -1.5 means A must win by 2 maps).
  const adjusted = (result.teamAMapsWon + line) - result.teamBMapsWon;
  const teamACovers = adjusted > 0;
  const push = adjusted === 0;
  if (push) {
    return { kind: 'handicap', result: 'push', reason: 'handicap_push' };
  }

  const picksTeamA = namesMatch(selection, result.teamAName)
    || /team\s*a|\bhome\b|\ba\b/i.test(selection)
    || selection.includes('+') === false && namesMatch(selection, result.teamAName);
  const picksCoveringSide = teamACovers
    ? namesMatch(selection, result.teamAName) || /^(a|home)/i.test(selection)
    : namesMatch(selection, result.teamBName) || /^(b|away)/i.test(selection);

  // Prefer explicit team name match; fall back to covering-side heuristic.
  let won: boolean;
  if (namesMatch(selection, result.teamAName)) won = teamACovers;
  else if (namesMatch(selection, result.teamBName)) won = !teamACovers;
  else won = picksCoveringSide;

  void picksTeamA;
  return {
    kind: 'handicap',
    result: won ? 'won' : 'lost',
    reason: won ? 'handicap_covered' : 'handicap_failed',
  };
}

function settleTotalMaps(
  selection: string,
  question: string | undefined,
  result: StructuredMatchResult,
): MarketSettlementDecision {
  if (result.teamAMapsWon === undefined || result.teamBMapsWon === undefined) {
    return { kind: 'total_maps', result: 'pending', reason: 'missing_series_score' };
  }
  const line = result.totalMapsLine ?? extractTotalMapsLine(question);
  if (line === null) {
    return { kind: 'total_maps', result: 'pending', reason: 'missing_total_line' };
  }
  const total = result.teamAMapsWon + result.teamBMapsWon;
  if (total === line) {
    return { kind: 'total_maps', result: 'push', reason: 'total_push' };
  }
  const over = total > line;
  const picksOver = /\bover\b|\bo\b/i.test(selection) || selection.includes('over');
  const picksUnder = /\bunder\b|\bu\b/i.test(selection) || selection.includes('under');
  if (!picksOver && !picksUnder) {
    return { kind: 'total_maps', result: 'pending', reason: 'ambiguous_total_selection' };
  }
  const won = picksOver ? over : !over;
  return {
    kind: 'total_maps',
    result: won ? 'won' : 'lost',
    reason: won ? 'total_hit' : 'total_miss',
  };
}

function settleCorrectScore(
  selection: string,
  question: string | undefined,
  result: StructuredMatchResult,
): MarketSettlementDecision {
  if (result.teamAMapsWon === undefined || result.teamBMapsWon === undefined) {
    return { kind: 'correct_score', result: 'pending', reason: 'missing_series_score' };
  }
  const actual = `${result.teamAMapsWon}-${result.teamBMapsWon}`;
  const fromSelection = selection.match(/\d\s*-\s*\d/)?.[0]?.replace(/\s+/g, '');
  const fromQuestion = extractCorrectScore(question);
  const predicted = fromSelection ?? fromQuestion;
  if (!predicted) {
    return { kind: 'correct_score', result: 'pending', reason: 'missing_predicted_score' };
  }
  const won = predicted === actual;
  return {
    kind: 'correct_score',
    result: won ? 'won' : 'lost',
    reason: won ? 'score_matched' : 'score_mismatch',
  };
}
