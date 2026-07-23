import type { EsportsGame, NormalizedMatchFacts } from '@polyrader/core';
import { findSettlementRule } from '@polyrader/core';
import { FactRepository, GridClient, MarketRepository, SimBetRepository } from '@polyrader/infra';
import { SettlementService } from './settlement-service';

export type GridSettlementGame = Extract<EsportsGame, 'lol' | 'valorant'>;

export interface GridReconciliationEvent {
  game: GridSettlementGame;
  matchId: string;
  source: 'grid';
  status: 'pending' | 'settled' | 'unavailable';
  winnerTeamName?: string;
  settledBets: number;
  resolvedMarkets: number;
  message?: string;
}

export interface GridReconciliationReport {
  game: GridSettlementGame;
  checked: number;
  settledBets: number;
  resolvedMarkets: number;
  events: GridReconciliationEvent[];
}

/** GRID-backed match-winner settlement for LoL and Valorant practice orders. */
export class GridMatchReconciliationService {
  private readonly facts: Pick<FactRepository, 'getByGameExternalId'>;
  private readonly bets: Pick<SimBetRepository, 'listOpenMatchIdsByGame'>;
  private readonly markets: Pick<MarketRepository, 'resolveLocalMarkets'>;
  private readonly grid: Pick<GridClient, 'getSeriesState'>;
  private readonly settlement: Pick<SettlementService, 'settleStructuredMatch'>;

  constructor(deps?: {
    facts?: Pick<FactRepository, 'getByGameExternalId'>;
    bets?: Pick<SimBetRepository, 'listOpenMatchIdsByGame'>;
    markets?: Pick<MarketRepository, 'resolveLocalMarkets'>;
    grid?: Pick<GridClient, 'getSeriesState'>;
    settlement?: Pick<SettlementService, 'settleStructuredMatch'>;
  }) {
    this.facts = deps?.facts ?? new FactRepository();
    this.bets = deps?.bets ?? new SimBetRepository();
    this.markets = deps?.markets ?? new MarketRepository();
    this.grid = deps?.grid ?? new GridClient();
    this.settlement = deps?.settlement ?? new SettlementService();
  }

  async reconcileOpenBets(game: GridSettlementGame, limit = 25): Promise<GridReconciliationReport> {
    const matchIds = this.bets.listOpenMatchIdsByGame(game, limit);
    const events: GridReconciliationEvent[] = [];
    for (const matchId of matchIds) events.push(await this.reconcileMatch(game, matchId));
    return {
      game,
      checked: matchIds.length,
      settledBets: events.reduce((sum, event) => sum + event.settledBets, 0),
      resolvedMarkets: events.reduce((sum, event) => sum + event.resolvedMarkets, 0),
      events,
    };
  }

  async reconcileMatch(
    game: GridSettlementGame,
    matchId: string,
  ): Promise<GridReconciliationEvent> {
    const facts = this.facts.getByGameExternalId(game, matchId);
    if (!facts) return unavailable(game, matchId, 'normalized facts not found');
    if (!findSettlementRule(game, 'match_winner')?.supported) {
      return unavailable(game, matchId, 'match-winner settlement rule is unavailable');
    }
    if (!hasGridMatchLink(facts, matchId)) {
      return unavailable(game, matchId, 'no authoritative GRID series link');
    }

    try {
      const state = await this.grid.getSeriesState(matchId);
      if (!state?.finished) {
        return {
          game,
          matchId,
          source: 'grid',
          status: 'pending',
          settledBets: 0,
          resolvedMarkets: 0,
          message: 'authoritative GRID result is not final',
        };
      }
      const winnerTeamName = state.teamAWon
        ? (facts.participants.find((participant) => participant.side === 'a')?.name ?? 'Team A')
        : (facts.participants.find((participant) => participant.side === 'b')?.name ?? 'Team B');
      const settled = this.settlement.settleStructuredMatch(
        matchId,
        {
          winnerTeamName,
          teamAName: facts.participants.find((participant) => participant.side === 'a')?.name,
          teamBName: facts.participants.find((participant) => participant.side === 'b')?.name,
          teamAMapsWon: state.teamAScore,
          teamBMapsWon: state.teamBScore,
        },
        { kinds: ['match_winner'], settlementSource: 'grid' },
      );
      const resolved = this.markets.resolveLocalMarkets(`${game}:${matchId}`, winnerTeamName);
      return {
        game,
        matchId,
        source: 'grid',
        status: 'settled',
        winnerTeamName,
        settledBets: settled.length,
        resolvedMarkets: resolved.length,
      };
    } catch (error) {
      return unavailable(game, matchId, (error as Error).message);
    }
  }
}

function hasGridMatchLink(facts: NormalizedMatchFacts, matchId: string): boolean {
  return facts.sourceLinks.some(
    (link) => link.source === 'grid' && link.entityType === 'match' && link.externalId === matchId,
  );
}

function unavailable(
  game: GridSettlementGame,
  matchId: string,
  message: string,
): GridReconciliationEvent {
  return {
    game,
    matchId,
    source: 'grid',
    status: 'unavailable',
    settledBets: 0,
    resolvedMarkets: 0,
    message,
  };
}
