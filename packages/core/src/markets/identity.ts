import type { AnalysisMarketKind, EsportsGame } from '../analysis/types';
import type { MarketAnalysisWarning, MarketLiquidityStatus } from '../types/index';
import type { SettledMarketKind } from '../utils/market-settlement';
import { classifySettledMarketKind } from '../utils/market-settlement';

export interface CanonicalMarketIdentity {
  marketId: string;
  matchId: string;
  game: EsportsGame;
  kind: AnalysisMarketKind | 'unsupported';
  line: number | null;
  outcomes: Array<{ outcomeId: string; label: string }>;
  settlementRuleId: string;
  settlementSupported: boolean;
  liquidityUsd: number | null;
  liquidityStatus: MarketLiquidityStatus;
  evidenceType: 'real' | 'synthetic';
  warnings: MarketAnalysisWarning[];
}

export interface SettlementRuleDefinition {
  ruleId: string;
  game: EsportsGame | '*';
  kind: AnalysisMarketKind | 'unsupported';
  version: string;
  description: string;
  authoritativeSources: string[];
  supported: boolean;
}

export const SETTLEMENT_RULE_REGISTRY: SettlementRuleDefinition[] = [
  {
    ruleId: 'cs2.match_winner.v1',
    game: 'cs2',
    kind: 'match_winner',
    version: 'v1',
    description: 'Series winner from HLTV/GRID official result',
    authoritativeSources: ['hltv', 'grid'],
    supported: true,
  },
  {
    ruleId: 'cs2.map_winner.v1',
    game: 'cs2',
    kind: 'map_winner',
    version: 'v1',
    description: 'Individual map winner from structured map results',
    authoritativeSources: ['hltv', 'grid'],
    supported: true,
  },
  {
    ruleId: 'cs2.handicap.v1',
    game: 'cs2',
    kind: 'handicap',
    version: 'v1',
    description: 'Map handicap settled from series map score',
    authoritativeSources: ['hltv'],
    supported: true,
  },
  {
    ruleId: 'cs2.total_maps.v1',
    game: 'cs2',
    kind: 'total_maps',
    version: 'v1',
    description: 'Total maps over/under from series length',
    authoritativeSources: ['hltv'],
    supported: true,
  },
  {
    ruleId: 'dota2.match_winner.v1',
    game: 'dota2',
    kind: 'match_winner',
    version: 'v1',
    description: 'OpenDota single-game or GRID series winner from authoritative result state',
    authoritativeSources: ['opendota', 'grid'],
    supported: true,
  },
  {
    ruleId: 'dota2.handicap.v1',
    game: 'dota2',
    kind: 'handicap',
    version: 'v1',
    description: 'Dota series game handicap settled from the authoritative series score',
    authoritativeSources: ['opendota', 'grid', 'liquipedia'],
    supported: true,
  },
  {
    ruleId: 'dota2.total_maps.v1',
    game: 'dota2',
    kind: 'total_maps',
    version: 'v1',
    description: 'Dota series total games settled from the authoritative series score',
    authoritativeSources: ['opendota', 'grid', 'liquipedia'],
    supported: true,
  },
  {
    ruleId: 'lol.match_winner.v1',
    game: 'lol',
    kind: 'match_winner',
    version: 'v1',
    description: 'Series winner from GRID authoritative result state',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'lol.map_winner.v1',
    game: 'lol',
    kind: 'map_winner',
    version: 'v1',
    description: 'Individual game winner from structured GRID series results',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'lol.handicap.v1',
    game: 'lol',
    kind: 'handicap',
    version: 'v1',
    description: 'LoL series game handicap settled from the authoritative series score',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'lol.total_maps.v1',
    game: 'lol',
    kind: 'total_maps',
    version: 'v1',
    description: 'LoL series total games settled from the authoritative series score',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'valorant.match_winner.v1',
    game: 'valorant',
    kind: 'match_winner',
    version: 'v1',
    description: 'Series winner from GRID authoritative result state',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'valorant.map_winner.v1',
    game: 'valorant',
    kind: 'map_winner',
    version: 'v1',
    description: 'Individual map winner from structured GRID series results',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'valorant.handicap.v1',
    game: 'valorant',
    kind: 'handicap',
    version: 'v1',
    description: 'Valorant series map handicap settled from the authoritative series score',
    authoritativeSources: ['grid'],
    supported: true,
  },
  {
    ruleId: 'valorant.total_maps.v1',
    game: 'valorant',
    kind: 'total_maps',
    version: 'v1',
    description: 'Valorant series total maps settled from the authoritative series score',
    authoritativeSources: ['grid'],
    supported: true,
  },
];

export function findSettlementRule(
  game: EsportsGame,
  kind: AnalysisMarketKind | SettledMarketKind | 'unsupported',
): SettlementRuleDefinition | undefined {
  return (
    SETTLEMENT_RULE_REGISTRY.find((rule) => rule.game === game && rule.kind === kind) ??
    SETTLEMENT_RULE_REGISTRY.find((rule) => rule.game === '*' && rule.kind === kind)
  );
}

export function buildCanonicalMarketIdentity(input: {
  game: EsportsGame;
  matchId: string;
  marketId?: string;
  question?: string;
  kind?: AnalysisMarketKind;
  line?: number | null;
  outcomes: Array<{ outcomeId?: string; label: string }>;
  liquidityUsd?: number;
  tags?: string[];
}): CanonicalMarketIdentity {
  const kind =
    input.kind ?? mapSettledKind(classifySettledMarketKind(input.question)) ?? 'match_winner';
  const rule = findSettlementRule(input.game, kind);
  const marketId =
    input.marketId ?? `${input.matchId}:${kind}${input.line != null ? `:${input.line}` : ''}`;
  const synthetic = Boolean(
    input.tags?.some((tag) => tag === 'local-sim' || tag === 'local-seed'),
  );
  const liquidity = Number(input.liquidityUsd);
  const liquidityStatus: MarketLiquidityStatus = synthetic
    ? 'synthetic'
    : !Number.isFinite(liquidity) || liquidity < 0
      ? 'unknown'
      : liquidity < 1_000
        ? 'low'
        : 'normal';
  return {
    marketId,
    matchId: input.matchId,
    game: input.game,
    kind,
    line: input.line ?? null,
    outcomes: input.outcomes.map((outcome, index) => ({
      outcomeId: outcome.outcomeId ?? `o${index}`,
      label: outcome.label,
    })),
    settlementRuleId: rule?.ruleId ?? `${input.game}.${kind}.unsupported`,
    settlementSupported: Boolean(rule?.supported),
    liquidityUsd: Number.isFinite(liquidity) ? Math.max(0, liquidity) : null,
    liquidityStatus,
    evidenceType: synthetic ? 'synthetic' : 'real',
    warnings: liquidityStatus === 'low' ? ['low_liquidity'] : [],
  };
}

export interface MarketAlignmentResult {
  aligned: boolean;
  status: 'aligned' | 'supported' | 'unsupported' | 'missing_market';
  detail: string;
  markets: CanonicalMarketIdentity[];
  evidenceType: 'real' | 'synthetic' | 'mixed' | 'none';
  realMarketCount: number;
  syntheticMarketCount: number;
  lowLiquidityMarketIds: string[];
}

export function alignMarketsForMatch(input: {
  game: EsportsGame;
  matchId: string;
  markets: Array<{
    marketId?: string;
    question?: string;
    kind?: AnalysisMarketKind;
    line?: number | null;
    outcomes: Array<{ outcomeId?: string; label: string }>;
    liquidityUsd?: number;
    tags?: string[];
  }>;
}): MarketAlignmentResult {
  if (input.markets.length === 0) {
    return {
      aligned: false,
      status: 'missing_market',
      detail: 'no markets supplied for alignment',
      markets: [],
      evidenceType: 'none',
      realMarketCount: 0,
      syntheticMarketCount: 0,
      lowLiquidityMarketIds: [],
    };
  }

  const markets = input.markets.map((market) =>
    buildCanonicalMarketIdentity({
      game: input.game,
      matchId: input.matchId,
      marketId: market.marketId,
      question: market.question,
      kind: market.kind,
      line: market.line,
      outcomes: market.outcomes,
      liquidityUsd: market.liquidityUsd,
      tags: market.tags,
    }),
  );

  const realMarketCount = markets.filter((market) => market.evidenceType === 'real').length;
  const syntheticMarketCount = markets.length - realMarketCount;
  const evidenceType =
    realMarketCount > 0 && syntheticMarketCount > 0
      ? 'mixed'
      : realMarketCount > 0
        ? 'real'
        : 'synthetic';
  const lowLiquidityMarketIds = markets
    .filter((market) => market.liquidityStatus === 'low')
    .map((market) => market.marketId);

  const unsupported = markets.filter((market) => !market.settlementSupported);
  if (unsupported.length === markets.length) {
    return {
      aligned: false,
      status: 'unsupported',
      detail: 'no settlement rules available',
      markets,
      evidenceType,
      realMarketCount,
      syntheticMarketCount,
      lowLiquidityMarketIds,
    };
  }

  return {
    aligned: unsupported.length === 0,
    status: unsupported.length === 0 ? 'aligned' : 'supported',
    detail:
      unsupported.length === 0
        ? `${markets.length} markets with settlement rules · ${evidenceType} evidence${lowLiquidityMarketIds.length ? ` · ${lowLiquidityMarketIds.length} low liquidity (< $1,000)` : ''}`
        : `${markets.length - unsupported.length}/${markets.length} markets supported`,
    markets,
    evidenceType,
    realMarketCount,
    syntheticMarketCount,
    lowLiquidityMarketIds,
  };
}

function mapSettledKind(kind: SettledMarketKind): AnalysisMarketKind | undefined {
  if (kind === 'unsupported') return undefined;
  return kind;
}
