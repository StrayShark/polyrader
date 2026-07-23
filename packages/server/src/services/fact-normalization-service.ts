import type { EsportsGame, NormalizedMatchFacts, SourceSnapshotLike } from '@polyrader/core';
import {
  alignMarketsForMatch,
  buildBoardValidationSummary,
  buildFixtureFacts,
  classifySettledMarketKind,
  extractHandicapLine,
  extractTotalMapsLine,
  normalizeLolTeamAlias,
  normalizeMatchFacts,
  normalizeValorantTeamAlias,
  readLolQuality,
  readValorantQuality,
} from '@polyrader/core';
import { EsportsSourceRepository, FactRepository, MarketRepository } from '@polyrader/infra';
import { EsportsSourceService } from './esports-source-service';
import { LocalPracticeMarketService } from './local-practice-market-service';
import { PaperPolicyService } from './paper-policy-service';
import { isDiscoverableSeriesMarket } from './riot-games-market-discovery-service';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];
const DEFAULT_NORMALIZE_LIMIT = 10;
const RIOT_NORMALIZE_LIMIT = 20;

export class FactNormalizationService {
  private readonly sources: EsportsSourceService;
  private readonly sourceRepo: EsportsSourceRepository;
  private readonly facts: FactRepository;
  private readonly markets: MarketRepository;
  private readonly practiceMarkets: Pick<LocalPracticeMarketService, 'ensureForFacts'>;
  private readonly policy: Pick<PaperPolicyService, 'getActive'>;
  private readonly now: () => Date;

  constructor(deps?: {
    sources?: EsportsSourceService;
    sourceRepo?: EsportsSourceRepository;
    facts?: FactRepository;
    markets?: MarketRepository;
    practiceMarkets?: Pick<LocalPracticeMarketService, 'ensureForFacts'>;
    policy?: Pick<PaperPolicyService, 'getActive'>;
    now?: () => Date;
  }) {
    this.sources = deps?.sources ?? new EsportsSourceService();
    this.sourceRepo = deps?.sourceRepo ?? new EsportsSourceRepository();
    this.facts = deps?.facts ?? new FactRepository();
    this.markets = deps?.markets ?? new MarketRepository();
    this.practiceMarkets = deps?.practiceMarkets ?? new LocalPracticeMarketService();
    this.policy = deps?.policy ?? new PaperPolicyService();
    this.now = deps?.now ?? (() => new Date());
  }

  normalizeGame(
    game: EsportsGame,
    options?: {
      useFixtureFallback?: boolean;
      forceFixture?: boolean;
      preferredExternalMatchId?: string;
    },
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
        snapshots
          .filter((item) => item.entityType === 'match')
          .sort((a, b) => compareMatchCandidates(a, b, this.now().getTime()))
          .map((item) => item.externalId),
      ),
    ];
    const normalizeLimit =
      game === 'lol' || game === 'valorant' ? RIOT_NORMALIZE_LIMIT : DEFAULT_NORMALIZE_LIMIT;
    const persisted: NormalizedMatchFacts[] = [];
    if (!options?.forceFixture) {
      for (const matchExternalId of matchIds.slice(0, normalizeLimit)) {
        const normalized = normalizeMatchFacts(game, snapshots, { matchExternalId });
        if (!normalized) continue;
        persisted.push(this.facts.upsertNormalizedMatch(normalized));
      }
    }

    const marketHints =
      game === 'lol' || game === 'valorant'
        ? ((this.markets.findByTag(game, 200) ?? []) as Array<{
            question: string;
            description?: string;
            outcomes: string[];
            tags: string[];
          }>)
            .filter(
              (market) =>
                !market.tags.includes('local-sim') &&
                !market.tags.includes('practice') &&
                isDiscoverableSeriesMarket(market.question),
            )
            .map((market) => [market.question, ...market.outcomes].join(' '))
        : [];
    let sample = selectBoardSample(game, persisted, this.now().getTime(), marketHints);
    if (options?.preferredExternalMatchId) {
      const preferred = persisted.find(
        (match) => match.externalMatchId === options.preferredExternalMatchId,
      );
      if (preferred) sample = preferred;
    }
    if (options?.forceFixture === true || (!sample && options?.useFixtureFallback === true)) {
      const fixture = buildFixtureFacts(game);
      if (fixture) {
        sample = this.facts.upsertNormalizedMatch(fixture);
        persisted.push(sample);
      }
    }

    if (sample) this.practiceMarkets.ensureForFacts(sample);

    const marketAlignment = sample
      ? alignMarketsForMatch({
          game,
          matchId: sample.externalMatchId,
          markets: this.findMarkets(game, sample.externalMatchId).map((market) => ({
            marketId: market.conditionId,
            question: market.question,
            kind: normalizedMarketKind(market.question),
            line: normalizedMarketLine(market.question),
            outcomes: market.outcomes.map((label) => ({ label })),
            liquidityUsd: market.liquidity,
            tags: market.tags,
          })),
        })
      : null;

    const summary = buildBoardValidationSummary({
      game,
      snapshots,
      sampleMatch: sample,
      sourcesConfigured: configured,
      marketAlignment,
      maximumFreshnessSeconds: this.policy.getActive().maximumFreshnessSeconds,
      allowFixtureFallback: options?.useFixtureFallback === true || options?.forceFixture === true,
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

function normalizedMarketKind(question: string) {
  const kind = classifySettledMarketKind(question);
  return kind === 'unsupported' ? undefined : kind;
}

function normalizedMarketLine(question: string): number | null {
  const kind = classifySettledMarketKind(question);
  if (kind === 'handicap') return extractHandicapLine(question);
  if (kind === 'total_maps') return extractTotalMapsLine(question);
  return null;
}

export function compareMatchCandidates(
  a: SourceSnapshotLike,
  b: SourceSnapshotLike,
  nowMs = Date.now(),
): number {
  const aStarts = Date.parse(a.startsAt ?? '');
  const bStarts = Date.parse(b.startsAt ?? '');
  const aPhase = matchCandidatePhase(a, aStarts, nowMs);
  const bPhase = matchCandidatePhase(b, bStarts, nowMs);
  if (aPhase !== bPhase) return aPhase - bPhase;
  if (Number.isFinite(aStarts) && Number.isFinite(bStarts)) {
    return aPhase === 0 ? aStarts - bStarts : bStarts - aStarts;
  }
  if (Number.isFinite(aStarts)) return -1;
  if (Number.isFinite(bStarts)) return 1;
  const observedDelta = Date.parse(b.observedAt) - Date.parse(a.observedAt);
  if (Number.isFinite(observedDelta) && observedDelta !== 0) return observedDelta;
  return a.externalId.localeCompare(b.externalId);
}

function matchCandidatePhase(item: SourceSnapshotLike, startsAt: number, nowMs: number): number {
  const status = String(item.status ?? '').toLowerCase();
  if (['live', 'in_progress', 'running'].includes(status)) return 1;
  if (['finished', 'completed', 'cancelled', 'canceled'].includes(status)) return 2;
  const startToleranceMs = 15 * 60 * 1000;
  if (Number.isFinite(startsAt) && startsAt >= nowMs - startToleranceMs) return 0;
  if (['scheduled', 'upcoming', 'pre_match'].includes(status)) return 3;
  return 2;
}

/** Prefer market-aligned / dual-roster / higher-completeness samples for LoL and Valorant boards. */
export function selectBoardSample(
  game: EsportsGame,
  matches: NormalizedMatchFacts[],
  nowMs = Date.now(),
  marketHints: string[] = [],
): NormalizedMatchFacts | null {
  if (matches.length === 0) return null;
  if (game !== 'lol' && game !== 'valorant') return matches[0] ?? null;

  const ranked = [...matches].sort((a, b) => {
    const scoreDelta =
      sampleQualityScore(b, game, marketHints) - sampleQualityScore(a, game, marketHints);
    if (scoreDelta !== 0) return scoreDelta;
    return compareMatchCandidates(asMatchCandidate(a), asMatchCandidate(b), nowMs);
  });
  return ranked[0] ?? null;
}

function sampleQualityScore(
  match: NormalizedMatchFacts,
  game: 'lol' | 'valorant',
  marketHints: string[] = [],
): number {
  const quality = game === 'lol' ? readLolQuality(match) : readValorantQuality(match);
  const marketAligned = teamsAppearInMarketHints(match, game, marketHints) ? 2_000_000 : 0;
  const bothComplete = quality?.bothTeamsComplete ? 1_000_000 : 0;
  const rosterPlayers = Math.min(match.players.length, 10) * 10_000;
  const completeness = Math.round((match.completeness ?? 0) * 1_000);
  const freshnessBonus = Number.isFinite(match.freshnessSeconds)
    ? Math.max(0, 10_000 - Math.min(match.freshnessSeconds, 10_000))
    : 0;
  const placeholderPenalty = /page_does_not_exist/i.test(match.externalMatchId) ? -500_000 : 0;
  const weakNamePenalty = match.participants.some((participant) =>
    /^(a team|b team|tbd|tba|unknown)$/i.test(participant.name.trim()),
  )
    ? -250_000
    : 0;
  return (
    marketAligned +
    bothComplete +
    rosterPlayers +
    completeness +
    freshnessBonus +
    placeholderPenalty +
    weakNamePenalty
  );
}

function teamsAppearInMarketHints(
  match: NormalizedMatchFacts,
  game: 'lol' | 'valorant',
  marketHints: string[],
): boolean {
  if (marketHints.length === 0 || match.participants.length < 2) return false;
  const normalize = game === 'lol' ? normalizeLolTeamAlias : normalizeValorantTeamAlias;
  const teamA = normalize(match.participants[0].name);
  const teamB = normalize(match.participants[1].name);
  if (!teamA || !teamB) return false;
  return marketHints.some((hint) => {
    const text = normalize(hint);
    return text.includes(teamA) && text.includes(teamB);
  });
}

function asMatchCandidate(match: NormalizedMatchFacts): SourceSnapshotLike {
  return {
    game: match.game,
    source: match.sourceLinks[0]?.source ?? 'normalized',
    entityType: 'match',
    externalId: match.externalMatchId,
    name: match.eventName,
    startsAt: match.startsAt,
    status: match.status,
    payload: {},
    observedAt: match.sourceLinks[0]?.observedAt ?? match.startsAt,
  };
}
