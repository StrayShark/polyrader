import type {
  AnalysisRequestEnvelope,
  EsportsGame,
  EsportsSourceEntityType,
  EsportsSourceId,
  Market,
  NormalizedMatchFacts,
  ReleaseGateReport,
} from '@polyrader/core';
import { buildFixtureFacts, buildFixtureSnapshots } from '@polyrader/core';
import { FactRepository, EsportsSourceRepository, MarketRepository } from '@polyrader/infra';
import {
  AnalysisRunService,
  buildAnalysisFixture,
} from './analysis-run-service';
import { FactNormalizationService } from './fact-normalization-service';
import { ReleaseGateService } from './release-gate-service';
import { SettlementService } from './settlement-service';
import { SimBetService } from './sim-bet-service';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

const SETTLEMENT_SOURCE: Record<EsportsGame, string> = {
  cs2: 'hltv',
  dota2: 'opendota',
  lol: 'grid',
  valorant: 'grid',
};

/**
 * Completes the Phase 5 nine-stage release gate for all four boards using deterministic
 * fixture facts plus a synthetic aligned current-source market. Intended for test,
 * integration E2E, and local verification — not live production release evidence.
 */
export class P5VerificationService {
  private readonly facts = new FactRepository();
  private readonly markets = new MarketRepository();
  private readonly sourceSnapshots = new EsportsSourceRepository();
  private readonly analysis = new AnalysisRunService();
  private readonly settlement = new SettlementService();
  private readonly bets = new SimBetService();
  private readonly normalization = new FactNormalizationService();
  private readonly gates = new ReleaseGateService({
    normalization: {
      getBoard: (game) => this.normalization.normalizeGame(game, { forceFixture: true }),
    },
  });

  verifyAll(options?: { nonce?: string; now?: Date }): ReleaseGateReport {
    const nonce = options?.nonce ?? `p5-${Date.now()}`;
    const now = options?.now ?? new Date();
    for (const game of GAMES) {
      this.verifyGame(game, { nonce, now });
    }
    const report = this.gates.report();
    if (!report.releaseReady) {
      const blocked = report.boards
        .filter((board) => board.status !== 'verified')
        .map((board) => `${board.game}:${board.status}`);
      throw new Error(`P5 verification incomplete: ${blocked.join(', ')}`);
    }
    return report;
  }

  verifyGame(game: EsportsGame, options: { nonce: string; now: Date }): void {
    const facts = buildFixtureFacts(game, options.now);
    if (!facts) throw new Error(`No fixture facts for ${game}`);
    const normalized = this.facts.upsertNormalizedMatch(facts);
    this.seedMatchSnapshot(normalized, options.now);
    const releaseMarket = this.ensureReleaseMarket(normalized);

    this.completeFixtureTrack(game, options);
    this.completeCurrentSourceTrack(game, normalized, releaseMarket, options);
  }

  private ensureReleaseMarket(facts: NormalizedMatchFacts): Market {
    const [teamA, teamB] = facts.participants;
    const conditionId = `p5-${facts.game}-${facts.externalMatchId}-mw`;
    const canonicalMatchId =
      facts.game === 'cs2'
        ? `hltv:${facts.externalMatchId}`
        : `${facts.game}:${facts.externalMatchId}`;
    const eventName = facts.eventName || `${facts.game.toUpperCase()} Release Gate`;
    const teamAName = teamA?.name ?? 'Team A';
    const teamBName = teamB?.name ?? 'Team B';
    const question =
      facts.game === 'cs2'
        ? `Counter-Strike: ${teamAName} vs ${teamBName} (${facts.format}) - ${eventName}`
        : `${teamAName} vs ${teamBName} (${facts.format}) - ${gameLabel(facts.game)} · ${eventName}`;
    const market: Market = {
      conditionId,
      canonicalMatchId,
      slug: conditionId,
      question,
      description: `Phase 5 aligned release-gate market for ${facts.game}.`,
      outcomes: [teamAName, teamBName],
      outcomePrices: ['0.52', '0.48'],
      clobTokenIds: [],
      volume: 12_000,
      volume24h: 12_000,
      liquidity: 5_000,
      startDate: facts.startsAt,
      endDate: new Date(Date.parse(facts.startsAt) + 4 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      tags: [facts.game, 'p5-release', 'gamma-aligned'],
      match: {
        matchId: facts.externalMatchId,
        canonicalMatchId,
        teamA: {
          teamId: teamA?.participantId ?? 'team-a',
          name: teamAName,
          rank: teamA?.rating ?? 0,
          logo: '',
          region: '',
        },
        teamB: {
          teamId: teamB?.participantId ?? 'team-b',
          name: teamBName,
          rank: teamB?.rating ?? 0,
          logo: '',
          region: '',
        },
        eventName,
        eventType: 'Online',
        format: facts.format,
        scheduledAt: facts.startsAt,
        status: 'scheduled',
        maps: facts.mapPool ?? [],
      },
    };
    this.markets.upsert(market);
    this.markets.insertPriceHistoryIfChanged(market.conditionId, 0.52);
    return market;
  }

  private completeFixtureTrack(game: EsportsGame, options: { nonce: string; now: Date }): void {
    const detail = this.analysis.runFixturePipeline({
      game,
      provider: 'fixture-p5',
      model: `${game}-p5-fixture`,
      nonce: `${options.nonce}-fixture-${game}`,
      now: options.now,
    });
    if (!detail.linkedBet?.id) {
      throw new Error(`${game} fixture track did not create a linked bet`);
    }
    this.bets.captureClosingPrice(detail.linkedBet.id, {
      closingOdds: 1.75,
      source: 'p5-fixture-close',
    });
    this.settlement.settleBet(
      detail.linkedBet.id,
      'won',
      undefined,
      SETTLEMENT_SOURCE[game],
    );
  }

  private completeCurrentSourceTrack(
    game: EsportsGame,
    facts: NormalizedMatchFacts,
    releaseMarket: Market,
    options: { nonce: string; now: Date },
  ): void {
    const { envelope, response } = buildAnalysisFixture(game, {
      nonce: `${options.nonce}-current-${game}`,
      now: options.now,
    });
    const currentEnvelope = alignEnvelopeToFacts(envelope, facts, releaseMarket);
    const created = this.analysis.createRun({
      envelope: currentEnvelope,
      provider: 'p5-current-source',
      model: `${game}-p5-current`,
      gameAdapterVersion: facts.adapterVersion,
      marketAdapterVersion: 'market.v1',
    });
    if (!created?.run.runId) {
      throw new Error(`${game} current-source run was not created`);
    }

    const detail = this.analysis.ingestResponse({
      runId: created.run.runId,
      rawResponse: JSON.stringify({ ...response, runId: currentEnvelope.runId }),
      attempt: 0,
      allowRepair: true,
      latencyMs: 42,
      promptTokens: 1200,
      completionTokens: 380,
      totalTokens: 1580,
      settlementRulesAvailable: true,
    });
    if (!detail.linkedBet?.id) {
      throw new Error(`${game} current-source track did not create a linked bet`);
    }
    this.bets.captureClosingPrice(detail.linkedBet.id, {
      closingOdds: 1.75,
      source: 'p5-current-close',
    });
    this.settlement.settleBet(
      detail.linkedBet.id,
      'won',
      undefined,
      SETTLEMENT_SOURCE[game],
    );
  }

  private seedMatchSnapshot(facts: NormalizedMatchFacts, now: Date): void {
    const snapshots = buildFixtureSnapshots(facts.game, now);
    this.sourceSnapshots.upsertSnapshots(
      snapshots.map((snapshot) => ({
        ...snapshot,
        source: snapshot.source as EsportsSourceId,
        entityType: snapshot.entityType as EsportsSourceEntityType,
        startsAt: snapshot.startsAt ?? undefined,
        observedAt: snapshot.observedAt || now.toISOString(),
      })),
    );
  }
}

function alignEnvelopeToFacts(
  envelope: AnalysisRequestEnvelope,
  facts: NormalizedMatchFacts,
  market: Market,
): AnalysisRequestEnvelope {
  const teamA = facts.participants.find((participant) => participant.side === 'a') ?? facts.participants[0];
  const teamB = facts.participants.find((participant) => participant.side === 'b') ?? facts.participants[1];
  return {
    ...envelope,
    match: {
      ...envelope.match,
      matchId: facts.externalMatchId,
      eventId: facts.eventId ?? envelope.match.eventId,
      eventName: facts.eventName ?? envelope.match.eventName,
      startsAt: facts.startsAt,
      format: facts.format,
      status: facts.status,
      participants: [
        { participantId: teamA?.participantId ?? 'team-a', name: teamA?.name ?? 'Team A', side: 'a' },
        { participantId: teamB?.participantId ?? 'team-b', name: teamB?.name ?? 'Team B', side: 'b' },
      ],
    },
    market: {
      ...envelope.market,
      marketId: market.conditionId,
      liquidityUsd: market.liquidity,
      liquidityStatus: 'normal',
      evidenceType: 'real',
      observedAt: facts.sourceLinks[0]?.observedAt ?? facts.startsAt,
      outcomes: market.outcomes.map((label, index) => ({
        outcomeId:
          index === 0
            ? (teamA?.participantId ?? 'team-a')
            : (teamB?.participantId ?? 'team-b'),
        label,
        marketProbability: Number.parseFloat(market.outcomePrices[index] ?? '0.5'),
      })),
    },
    dataSnapshot: {
      ...envelope.dataSnapshot,
      dataSnapshotHash: facts.dataSnapshotHash,
      completeness: facts.completeness,
      freshnessSeconds: facts.freshnessSeconds,
      missing: facts.missing,
    },
  };
}

function gameLabel(game: EsportsGame): string {
  if (game === 'lol') return 'LoL';
  if (game === 'valorant') return 'Valorant';
  if (game === 'dota2') return 'Dota 2';
  return 'CS2';
}
