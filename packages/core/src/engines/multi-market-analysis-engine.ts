import type {
  Market,
  MarketAnalysisKind,
  MarketAnalysisSignal,
  MarketLiquidityStatus,
  MarketOutcomeAnalysis,
  MarketScenarioAnalysis,
} from '../types/index';
import {
  classifySettledMarketKind,
  extractCorrectScore,
  extractTotalMapsLine,
} from '../utils/market-settlement';

export const LOW_LIQUIDITY_THRESHOLD_USD = 1_000;

export interface MultiMarketAnalysisInput {
  markets: Market[];
  teamAName: string;
  teamBName: string;
  format: 'BO1' | 'BO3' | 'BO5';
  seriesWinProbabilityA: number;
  baseConfidence?: number;
  lowLiquidityThresholdUsd?: number;
}

interface ScorelineProbability {
  teamAMaps: number;
  teamBMaps: number;
  probability: number;
}

export function assessMarketLiquidity(
  market: Pick<Market, 'liquidity' | 'tags'>,
  threshold = LOW_LIQUIDITY_THRESHOLD_USD,
): MarketLiquidityStatus {
  if (market.tags?.includes('local-sim') || market.tags?.includes('local-seed')) return 'synthetic';
  const liquidity = Number(market.liquidity);
  if (!Number.isFinite(liquidity) || liquidity < 0) return 'unknown';
  return liquidity < threshold ? 'low' : 'normal';
}

export class MultiMarketAnalysisEngine {
  analyze(input: MultiMarketAnalysisInput): MarketScenarioAnalysis[] {
    const seriesProbability = clampProbability(input.seriesWinProbabilityA);
    const winsNeeded = input.format === 'BO1' ? 1 : input.format === 'BO5' ? 3 : 2;
    const mapProbability = invertSeriesProbability(seriesProbability, winsNeeded);
    const scorelines = buildScorelineDistribution(mapProbability, winsNeeded);
    const threshold = input.lowLiquidityThresholdUsd ?? LOW_LIQUIDITY_THRESHOLD_USD;
    const baseConfidence = clamp(input.baseConfidence ?? 0.65, 0, 1);

    return input.markets.map((market) => this.analyzeMarket(
      market,
      input,
      scorelines,
      mapProbability,
      seriesProbability,
      baseConfidence,
      threshold,
    ));
  }

  private analyzeMarket(
    market: Market,
    input: MultiMarketAnalysisInput,
    scorelines: ScorelineProbability[],
    mapProbability: number,
    seriesProbability: number,
    baseConfidence: number,
    threshold: number,
  ): MarketScenarioAnalysis {
    const classifiedKind = classifySettledMarketKind(market.question) as MarketAnalysisKind;
    // Round totals require map-specific regulation/overtime and veto inputs; series scorelines cannot model them safely.
    const kind = classifiedKind === 'total_maps' && /\btotal rounds\b/i.test(market.question)
      ? 'unsupported'
      : classifiedKind;
    const line = extractAnalysisLine(kind, market.question, market.outcomes);
    const selections = market.outcomes.length > 0
      ? market.outcomes
      : market.outcomePrices.map((_price, index) => `Outcome ${index + 1}`);
    const marketProbabilities = normalizeMarketProbabilities(market.outcomePrices, selections.length);
    const modelProbabilities = deriveModelProbabilities({
      kind,
      question: market.question,
      selections,
      teamAName: input.teamAName,
      teamBName: input.teamBName,
      line,
      scorelines,
      mapProbability,
      seriesProbability,
    });
    const outcomes: MarketOutcomeAnalysis[] = selections.map((selection, index) => {
      const marketProbability = marketProbabilities[index] ?? null;
      const modelProbability = modelProbabilities[index] ?? null;
      return {
        selection,
        marketProbability,
        modelProbability,
        edge: marketProbability !== null && modelProbability !== null
          ? modelProbability - marketProbability
          : null,
      };
    });

    const liquidityStatus = assessMarketLiquidity(market, threshold);
    const hasModel = outcomes.some((outcome) => outcome.modelProbability !== null);
    const warnings: MarketScenarioAnalysis['warnings'] = [];
    if (liquidityStatus === 'low') warnings.push('low_liquidity');
    if (kind !== 'match_winner' && kind !== 'unsupported') warnings.push('derived_from_series_probability');
    if (!hasModel) warnings.push('insufficient_market_definition');

    const bestOutcome = outcomes
      .filter((outcome) => outcome.edge !== null)
      .sort((left, right) => (right.edge ?? -Infinity) - (left.edge ?? -Infinity))[0];
    const signal = determineSignal(liquidityStatus, hasModel, bestOutcome?.edge ?? null);
    const kindFactor = KIND_CONFIDENCE_FACTOR[kind];
    const confidence = clamp(
      baseConfidence * kindFactor * (liquidityStatus === 'low' ? 0.55 : liquidityStatus === 'unknown' ? 0.75 : 1),
      0,
      1,
    );

    return {
      conditionId: market.conditionId,
      question: market.question,
      kind,
      line,
      liquidity: Number.isFinite(Number(market.liquidity)) ? Math.max(0, Number(market.liquidity)) : 0,
      liquidityThreshold: threshold,
      liquidityStatus,
      confidence,
      signal,
      focusOutcome: signal === 'model_edge' ? bestOutcome?.selection : undefined,
      outcomes,
      warnings,
    };
  }
}

const KIND_CONFIDENCE_FACTOR: Record<MarketAnalysisKind, number> = {
  match_winner: 1,
  map_winner: 0.9,
  handicap: 0.8,
  total_maps: 0.85,
  correct_score: 0.72,
  unsupported: 0.4,
};

function determineSignal(
  liquidityStatus: MarketLiquidityStatus,
  hasModel: boolean,
  bestEdge: number | null,
): MarketAnalysisSignal {
  if (liquidityStatus === 'low') return 'observe_only';
  if (!hasModel) return 'model_limited';
  return bestEdge !== null && bestEdge >= 0.05 ? 'model_edge' : 'aligned';
}

function deriveModelProbabilities(input: {
  kind: MarketAnalysisKind;
  question: string;
  selections: string[];
  teamAName: string;
  teamBName: string;
  line: number | null;
  scorelines: ScorelineProbability[];
  mapProbability: number;
  seriesProbability: number;
}): Array<number | null> {
  switch (input.kind) {
    case 'match_winner':
      return mapBinaryTeamProbabilities(input.selections, input.teamAName, input.teamBName, input.seriesProbability);
    case 'map_winner':
      return mapBinaryTeamProbabilities(input.selections, input.teamAName, input.teamBName, input.mapProbability);
    case 'total_maps':
      return deriveTotalProbabilities(input);
    case 'handicap':
      return deriveHandicapProbabilities(input);
    case 'correct_score':
      return deriveCorrectScoreProbabilities(input);
    default:
      return input.selections.map(() => null);
  }
}

function mapBinaryTeamProbabilities(
  selections: string[],
  teamAName: string,
  teamBName: string,
  teamAProbability: number,
): Array<number | null> {
  return selections.map((selection, index) => {
    if (namesMatch(selection, teamAName)) return teamAProbability;
    if (namesMatch(selection, teamBName)) return 1 - teamAProbability;
    if (index === 0) return teamAProbability;
    if (index === 1) return 1 - teamAProbability;
    return null;
  });
}

function deriveTotalProbabilities(input: {
  question: string;
  selections: string[];
  line: number | null;
  scorelines: ScorelineProbability[];
}): Array<number | null> {
  if (input.line === null) return input.selections.map(() => null);
  let over = 0;
  let under = 0;
  for (const scoreline of input.scorelines) {
    const total = scoreline.teamAMaps + scoreline.teamBMaps;
    if (total > input.line) over += scoreline.probability;
    else if (total < input.line) under += scoreline.probability;
  }
  const decisive = over + under;
  if (decisive > 0) {
    over /= decisive;
    under /= decisive;
  }
  const questionDetail = marketDetail(input.question).toLowerCase();
  const questionAsksUnder = /\bunder\b/.test(questionDetail) && !/over\s*\/\s*under/.test(questionDetail);
  const questionAsksOver = /\bover\b/.test(questionDetail) && !/over\s*\/\s*under/.test(questionDetail);

  return input.selections.map((selection, index) => {
    const lower = selection.toLowerCase();
    if (/\bover\b|^o\b/.test(lower)) return over;
    if (/\bunder\b|^u\b/.test(lower)) return under;
    if (/^yes$/i.test(selection)) return questionAsksUnder ? under : over;
    if (/^no$/i.test(selection)) return questionAsksUnder ? over : under;
    if (index === 0) return questionAsksOver || !questionAsksUnder ? over : under;
    if (index === 1) return questionAsksOver || !questionAsksUnder ? under : over;
    return null;
  });
}

function deriveHandicapProbabilities(input: {
  question: string;
  selections: string[];
  teamAName: string;
  teamBName: string;
  line: number | null;
  scorelines: ScorelineProbability[];
}): Array<number | null> {
  if (input.line === null) return input.selections.map(() => null);
  const detail = marketDetail(input.question);
  const subject: 'a' | 'b' = namesMatch(detail, input.teamBName) ? 'b' : 'a';
  const subjectCover = coverProbability(input.scorelines, subject, input.line);

  return input.selections.map((selection, index) => {
    const explicitLine = extractSignedLine(selection);
    if (explicitLine !== null) {
      if (namesMatch(selection, input.teamAName)) return coverProbability(input.scorelines, 'a', explicitLine);
      if (namesMatch(selection, input.teamBName)) return coverProbability(input.scorelines, 'b', explicitLine);
    }
    if (/^yes$/i.test(selection)) return subjectCover;
    if (/^no$/i.test(selection)) return 1 - subjectCover;
    if (index === 0) return subjectCover;
    if (index === 1) return 1 - subjectCover;
    return null;
  });
}

function deriveCorrectScoreProbabilities(input: {
  question: string;
  selections: string[];
  scorelines: ScorelineProbability[];
}): Array<number | null> {
  const questionScore = extractCorrectScore(input.question);
  return input.selections.map((selection, index) => {
    const selectedScore = extractCorrectScore(selection) ?? questionScore;
    if (!selectedScore) return null;
    const [teamAMaps, teamBMaps] = selectedScore.split('-').map(Number);
    const probability = input.scorelines.find((scoreline) => (
      scoreline.teamAMaps === teamAMaps && scoreline.teamBMaps === teamBMaps
    ))?.probability ?? 0;
    if (/^no$/i.test(selection)) return 1 - probability;
    if (/^yes$/i.test(selection) || input.selections.length === 1 || index === 0) return probability;
    return probability;
  });
}

function extractAnalysisLine(kind: MarketAnalysisKind, question: string, outcomes: string[]): number | null {
  if (kind === 'total_maps') return extractTotalMapsLine(question);
  if (kind !== 'handicap') return null;
  return outcomes.map(extractSignedLine).find((value) => value !== null)
    ?? extractSignedLine(marketDetail(question));
}

function extractSignedLine(value: string): number | null {
  const match = value.match(/([+-]\d+(?:\.\d+)?)/);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isFinite(line) ? line : null;
}

function coverProbability(
  scorelines: ScorelineProbability[],
  side: 'a' | 'b',
  line: number,
): number {
  let covers = 0;
  let decisive = 0;
  for (const scoreline of scorelines) {
    const margin = side === 'a'
      ? scoreline.teamAMaps + line - scoreline.teamBMaps
      : scoreline.teamBMaps + line - scoreline.teamAMaps;
    if (margin === 0) continue;
    decisive += scoreline.probability;
    if (margin > 0) covers += scoreline.probability;
  }
  return decisive > 0 ? covers / decisive : 0.5;
}

function normalizeMarketProbabilities(prices: string[], outcomeCount: number): Array<number | null> {
  const parsed = Array.from({ length: outcomeCount }, (_value, index) => {
    const price = Number(prices[index]);
    return Number.isFinite(price) && price >= 0 ? price : null;
  });
  const total = parsed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? parsed.map((value) => value === null ? null : value / total) : parsed.map(() => null);
}

function invertSeriesProbability(target: number, winsNeeded: number): number {
  if (winsNeeded === 1) return target;
  let low = 0.001;
  let high = 0.999;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const mid = (low + high) / 2;
    if (seriesWinProbability(mid, winsNeeded) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function seriesWinProbability(mapProbability: number, winsNeeded: number): number {
  return buildScorelineDistribution(mapProbability, winsNeeded)
    .filter((scoreline) => scoreline.teamAMaps === winsNeeded)
    .reduce((sum, scoreline) => sum + scoreline.probability, 0);
}

function buildScorelineDistribution(mapProbability: number, winsNeeded: number): ScorelineProbability[] {
  const scorelines: ScorelineProbability[] = [];
  for (let loserMaps = 0; loserMaps < winsNeeded; loserMaps += 1) {
    const sequences = combination(winsNeeded - 1 + loserMaps, loserMaps);
    scorelines.push({
      teamAMaps: winsNeeded,
      teamBMaps: loserMaps,
      probability: sequences * (mapProbability ** winsNeeded) * ((1 - mapProbability) ** loserMaps),
    });
    scorelines.push({
      teamAMaps: loserMaps,
      teamBMaps: winsNeeded,
      probability: sequences * ((1 - mapProbability) ** winsNeeded) * (mapProbability ** loserMaps),
    });
  }
  return scorelines;
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= Math.min(k, n - k); index += 1) {
    result = (result * (n - index + 1)) / index;
  }
  return result;
}

function marketDetail(question: string): string {
  const separator = question.indexOf(' - ');
  return separator >= 0 ? question.slice(separator + 3) : question;
}

function namesMatch(value: string, teamName: string): boolean {
  const left = normalizeName(value);
  const right = normalizeName(teamName);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function clampProbability(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0.5, 0.001, 0.999);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
