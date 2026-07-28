import type {
  SimBet,
  SimBetLeg,
  SimBetRecord,
  PlaceSimBetInput,
  SimBetResult,
} from '@polyrader/core';
import {
  SimBetRepository,
  SimAccountRepository,
  OddsSnapshotRepository,
  LLMRepository,
  Cs2MatchSnapshotRepository,
} from '@polyrader/infra';
import { oddsToImpliedProbability, calculateEdge, calculateEv } from '@polyrader/core';
import { SettlementService } from './settlement-service';
import { PaperPolicyService } from './paper-policy-service';
import { ClosingPriceService, type ClosingPriceCaptureInput } from './closing-price-service';

export interface SimBetWithLegs {
  bet: SimBet;
  legs: SimBetLeg[];
}

function parseMaybeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export class SimBetService {
  private betRepo = new SimBetRepository();
  private accountRepo = new SimAccountRepository();
  private snapshotRepo = new OddsSnapshotRepository();
  private matchSnapshotRepo = new Cs2MatchSnapshotRepository();
  private llmRepo = new LLMRepository();
  private settlementService = new SettlementService();
  private policyService = new PaperPolicyService();
  private closingPriceService = new ClosingPriceService();

  listBets(accountId: string, status?: 'open' | 'settled' | 'voided'): SimBetRecord[] {
    return this.betRepo
      .getBetsWithLegs(accountId, status)
      .map(({ bet, legs }) => this.toRecord(bet, legs));
  }

  getBet(id: string): SimBetWithLegs | undefined {
    return this.betRepo.getWithLegs(id);
  }

  getBetByRunId(runId: string): SimBetWithLegs | undefined {
    const bet = this.betRepo.getByRunId(runId);
    if (!bet) return undefined;
    return { bet, legs: this.betRepo.getLegs(bet.id) };
  }

  private toRecord(bet: SimBet, legs: SimBetLeg[]): SimBetRecord {
    const snapshot = this.matchSnapshotRepo.getByBetId(bet.id);
    const persistedMatch = bet.matchId ? this.llmRepo.getMatch(bet.matchId) : null;
    const teamAName = snapshot?.teamAName ?? persistedMatch?.team_a_name;
    const teamBName = snapshot?.teamBName ?? persistedMatch?.team_b_name;
    const eventName = snapshot?.eventName ?? persistedMatch?.event_name;
    const matchName = teamAName && teamBName
      ? `${String(teamAName)} vs ${String(teamBName)}${eventName ? ` · ${String(eventName)}` : ''}`
      : undefined;

    return { ...bet, legs, matchName };
  }

  placeBet(input: PlaceSimBetInput): SimBetWithLegs {
    const account = input.accountId
      ? this.accountRepo.getById(input.accountId)
      : this.accountRepo.getDefault();

    if (!account) {
      throw new Error(`Account ${input.accountId ?? 'default'} not found`);
    }

    if (!input.legs || input.legs.length === 0) {
      throw new Error('At least one bet leg is required');
    }

    const totalOdds = input.legs.reduce((product, leg) => product * Math.max(1.01, leg.odds), 1);
    const impliedProbability = oddsToImpliedProbability(totalOdds);
    const marketProbability = input.marketProbability ?? impliedProbability;
    const userProbability = input.userProbability ?? marketProbability;
    const edge = calculateEdge(userProbability, marketProbability);
    const ev = calculateEv(input.stake, userProbability, totalOdds);

    const policy = this.policyService.getActive();

    const { bet, legs } = this.betRepo.create(
      {
        accountId: account.id,
        matchId: input.matchId,
        marketId: input.marketId,
        betType: input.betType,
        stake: input.stake,
        totalOdds,
        impliedProbability,
        userProbability,
        modelProbability: input.modelProbability,
        marketProbability,
        edge: input.edgeAtEntry ?? edge,
        ev,
        reasoning: input.reasoning,
        matchFormat: input.matchFormat,
        matchTier: input.matchTier,
        runId: input.runId,
        reportId: input.reportId,
        policyVersion: input.policyVersion ?? policy.policyVersion,
        provider: input.provider ?? 'user',
        game: input.game,
        marketKind: input.marketKind,
        edgeAtEntry: input.edgeAtEntry ?? edge,
        legs: input.legs.map((leg) => ({
          matchId: leg.matchId,
          marketId: leg.marketId,
          selection: leg.selection,
          odds: leg.odds,
          impliedProbability: oddsToImpliedProbability(leg.odds),
          source: leg.source,
        })),
      },
      {
        maxSingleStake: policy.maxSingleStake,
        maxDailyStake: policy.maxDailyStake,
        maxOpenExposure: policy.maxOpenExposure,
        maxGameExposure: policy.maxGameExposure,
        maxProviderExposure: policy.maxProviderExposure,
        maxMarketKindExposure: policy.maxMarketKindExposure,
      },
    );

    for (const leg of legs) {
      this.snapshotRepo.create({
        betId: bet.id,
        matchId: leg.matchId,
        marketId: leg.marketId,
        selection: leg.selection,
        odds: leg.odds,
        impliedProbability: leg.impliedProbability,
        source: 'placement',
      });
    }

    this.captureMatchSnapshot(bet.id, input);

    return { bet, legs };
  }

  private captureMatchSnapshot(betId: string, input: PlaceSimBetInput): void {
    const matchId = input.matchId;
    if (!matchId) {
      this.matchSnapshotRepo.create({
        betId,
        format: input.matchFormat ?? undefined,
        tier: input.matchTier ?? undefined,
        status: 'unknown',
      });
      return;
    }

    const match = this.llmRepo.getMatch(matchId);
    const teamAId = match?.team_a_id ? String(match.team_a_id) : undefined;
    const teamBId = match?.team_b_id ? String(match.team_b_id) : undefined;
    const teamA = teamAId ? this.llmRepo.getTeam(teamAId) : null;
    const teamB = teamBId ? this.llmRepo.getTeam(teamBId) : null;

    this.matchSnapshotRepo.create({
      betId,
      matchId,
      teamAName: match?.team_a_name ? String(match.team_a_name) : undefined,
      teamBName: match?.team_b_name ? String(match.team_b_name) : undefined,
      teamARank: teamA?.rank !== undefined && teamA?.rank !== null ? Number(teamA.rank) : undefined,
      teamBRank: teamB?.rank !== undefined && teamB?.rank !== null ? Number(teamB.rank) : undefined,
      format: input.matchFormat ?? (match?.format ? String(match.format) : undefined),
      tier: input.matchTier ?? undefined,
      eventName: match?.event_name ? String(match.event_name) : undefined,
      status: match?.status ? String(match.status) : 'upcoming',
      lineups: parseMaybeJson(match?.lineups),
      mapPool: {
        teamA: parseMaybeJson(teamA?.map_pool),
        teamB: parseMaybeJson(teamB?.map_pool),
      },
      rankings: {
        teamA: teamA?.rank ?? null,
        teamB: teamB?.rank ?? null,
      },
    });
  }

  settleBet(id: string, result: SimBetResult, pnl?: number, settlementSource = 'manual'): SimBet {
    return this.settlementService.settleBet(id, result, pnl, settlementSource);
  }

  captureClosingPrice(id: string, input: ClosingPriceCaptureInput): SimBet {
    return this.closingPriceService.captureForBet(id, input);
  }

  settleMatch(matchId: string, winnerSelection: string) {
    return this.settlementService.settleMatch(matchId, winnerSelection);
  }
}
