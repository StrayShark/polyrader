import type { EsportsGame, NormalizedMatchFacts, SourceSnapshotLike } from '@polyrader/core';
import {
  alignMarketsForMatch,
  buildBoardValidationSummary,
  buildFixtureFacts,
  DEFAULT_PAPER_POLICY,
  normalizeMatchFacts,
} from '@polyrader/core';
import { EsportsSourceRepository, FactRepository, MarketRepository } from '@polyrader/infra';
import { EsportsSourceService } from './esports-source-service';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

export class FactNormalizationService {
  private readonly sources: EsportsSourceService;
  private readonly sourceRepo: EsportsSourceRepository;
  private readonly facts: FactRepository;
  private readonly markets: MarketRepository;

  constructor(deps?: {
    sources?: EsportsSourceService;
    sourceRepo?: EsportsSourceRepository;
    facts?: FactRepository;
    markets?: MarketRepository;
  }) {
    this.sources = deps?.sources ?? new EsportsSourceService();
    this.sourceRepo = deps?.sourceRepo ?? new EsportsSourceRepository();
    this.facts = deps?.facts ?? new FactRepository();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  normalizeGame(
    game: EsportsGame,
    options?: { useFixtureFallback?: boolean },
  ): {
    summary: ReturnType<typeof buildBoardValidationSummary>;
    persisted: NormalizedMatchFacts[];
  } {
    const snapshots = this.loadSnapshots(game).map((item) => ({
      game: item.game,
      source: item.source,
      entityType: item.entityType,
      externalId: item.externalId,
      name: item.name,
      startsAt: item.startsAt,
      status: item.status,
      payload: (item.payload ?? {}) as Record<string, unknown>,
      observedAt: item.observedAt,
    })) satisfies SourceSnapshotLike[];

    const catalog = this.sources.getCatalog().find((item) => item.game === game);
    const configured = catalog?.sources.filter((item) => item.configured).length ?? 0;

    const matchIds = [
      ...new Set(
        snapshots.filter((item) => item.entityType === 'match').map((item) => item.externalId),
      ),
    ];
    const persisted: NormalizedMatchFacts[] = [];
    for (const matchExternalId of matchIds.slice(0, 10)) {
      const normalized = normalizeMatchFacts(game, snapshots, { matchExternalId });
      if (!normalized) continue;
      persisted.push(this.facts.upsertNormalizedMatch(normalized));
    }

    let sample = persisted[0] ?? null;
    if (!sample && options?.useFixtureFallback === true) {
      const fixture = buildFixtureFacts(game);
      if (fixture) {
        sample = this.facts.upsertNormalizedMatch(fixture);
        persisted.push(sample);
      }
    }

    const marketAlignment = sample
      ? alignMarketsForMatch({
          game,
          matchId: sample.externalMatchId,
          markets: this.findMarkets(game, sample.externalMatchId).map((market) => ({
            marketId: market.conditionId,
            question: market.question,
            outcomes: market.outcomes.map((label) => ({ label })),
            liquidityUsd: market.liquidity,
          })),
        })
      : null;

    const summary = buildBoardValidationSummary({
      game,
      snapshots,
      sampleMatch: sample,
      sourcesConfigured: configured,
      marketAlignment,
      maximumFreshnessSeconds: DEFAULT_PAPER_POLICY.maximumFreshnessSeconds,
      allowFixtureFallback: options?.useFixtureFallback === true,
    });

    return { summary, persisted };
  }

  getBoard(game: EsportsGame) {
    return this.normalizeGame(game);
  }

  normalizeMatch(game: EsportsGame, externalMatchId: string): NormalizedMatchFacts | null {
    const snapshots = this.loadSnapshots(game).map((item) => ({
      game: item.game,
      source: item.source,
      entityType: item.entityType,
      externalId: item.externalId,
      name: item.name,
      startsAt: item.startsAt,
      status: item.status,
      payload: (item.payload ?? {}) as Record<string, unknown>,
      observedAt: item.observedAt,
    })) satisfies SourceSnapshotLike[];
    const normalized = normalizeMatchFacts(game, snapshots, { matchExternalId: externalMatchId });
    return normalized ? this.facts.upsertNormalizedMatch(normalized) : null;
  }

  listBoards() {
    return GAMES.map((game) => this.normalizeGame(game).summary);
  }

  listFacts(game: EsportsGame, limit = 20) {
    return this.facts.listByGame(game, limit);
  }

  private loadSnapshots(game: EsportsGame) {
    const entityTypes = ['match', 'team', 'player', 'event', 'patch', 'content'] as const;
    const unique = new Map<string, ReturnType<EsportsSourceRepository['listSnapshots']>[number]>();
    for (const entityType of entityTypes) {
      for (const item of this.sourceRepo.listSnapshots(game, { entityType, limit: 200 })) {
        unique.set(`${item.source}:${item.entityType}:${item.externalId}`, item);
      }
    }
    return [...unique.values()];
  }

  private findMarkets(game: EsportsGame, externalMatchId: string) {
    const canonicalIds =
      game === 'cs2'
        ? [`hltv:${externalMatchId}`, externalMatchId]
        : [`${game}:${externalMatchId}`, externalMatchId];
    const unique = new Map<
      string,
      ReturnType<MarketRepository['findByCanonicalMatchId']>[number]
    >();
    for (const canonicalId of canonicalIds) {
      for (const market of this.markets.findByCanonicalMatchId(canonicalId)) {
        if (market.status === 'active') unique.set(market.conditionId, market);
      }
    }
    return [...unique.values()];
  }
}
