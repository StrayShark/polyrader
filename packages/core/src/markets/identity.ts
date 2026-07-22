import type { AnalysisMarketKind, EsportsGame } from '../analysis/types';
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
    description: 'Reserved for OpenDota/GRID result reconciliation; runtime settler not enabled yet',
    authoritativeSources: ['opendota', 'grid'],
    supported: false,
  },
  {
    ruleId: 'lol.match_winner.v1',
    game: 'lol',
    kind: 'match_winner',
    version: 'v1',
    description: 'Series winner placeholder until live schedule adapter settles',
    authoritativeSources: ['grid'],
    supported: false,
  },
  {
    ruleId: 'valorant.match_winner.v1',
    game: 'valorant',
    kind: 'match_winner',
    version: 'v1',
    description: 'Series winner placeholder until live schedule adapter settles',
    authoritativeSources: ['grid'],
    supported: false,
  },
];

export function findSettlementRule(
  game: EsportsGame,
  kind: AnalysisMarketKind | SettledMarketKind | 'unsupported',
): SettlementRuleDefinition | undefined {
  return SETTLEMENT_RULE_REGISTRY.find((rule) => rule.game === game && rule.kind === kind)
    ?? SETTLEMENT_RULE_REGISTRY.find((rule) => rule.game === '*' && rule.kind === kind);
}

export function buildCanonicalMarketIdentity(input: {
  game: EsportsGame;
  matchId: string;
  marketId?: string;
  question?: string;
  kind?: AnalysisMarketKind;
  line?: number | null;
  outcomes: Array<{ outcomeId?: string; label: string }>;
}): CanonicalMarketIdentity {
  const kind = input.kind
    ?? mapSettledKind(classifySettledMarketKind(input.question))
    ?? 'match_winner';
  const rule = findSettlementRule(input.game, kind);
  const marketId = input.marketId ?? `${input.matchId}:${kind}${input.line != null ? `:${input.line}` : ''}`;
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
  };
}

export interface MarketAlignmentResult {
  aligned: boolean;
  status: 'aligned' | 'supported' | 'unsupported' | 'missing_market';
  detail: string;
  markets: CanonicalMarketIdentity[];
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
  }>;
}): MarketAlignmentResult {
  if (input.markets.length === 0) {
    return {
      aligned: false,
      status: 'missing_market',
      detail: 'no markets supplied for alignment',
      markets: [],
    };
  }

  const markets = input.markets.map((market) => buildCanonicalMarketIdentity({
    game: input.game,
    matchId: input.matchId,
    marketId: market.marketId,
    question: market.question,
    kind: market.kind,
    line: market.line,
    outcomes: market.outcomes,
  }));

  const unsupported = markets.filter((market) => !market.settlementSupported);
  if (unsupported.length === markets.length) {
    return {
      aligned: false,
      status: 'unsupported',
      detail: 'no settlement rules available',
      markets,
    };
  }

  const lowLiquidity = input.markets.filter((market) => (market.liquidityUsd ?? 0) > 0 && (market.liquidityUsd ?? 0) < 1000);
  return {
    aligned: unsupported.length === 0,
    status: unsupported.length === 0 ? 'aligned' : 'supported',
    detail: unsupported.length === 0
      ? `${markets.length} markets with settlement rules${lowLiquidity.length ? ` · ${lowLiquidity.length} low liquidity` : ''}`
      : `${markets.length - unsupported.length}/${markets.length} markets supported`,
    markets,
  };
}

function mapSettledKind(kind: SettledMarketKind): AnalysisMarketKind | undefined {
  if (kind === 'unsupported') return undefined;
  return kind;
}
