import type { NormalizedMatchFacts } from '@polyrader/core';
import {
  FactRepository,
  GridClient,
  MarketRepository,
  OpenDotaClient,
  SimBetRepository,
} from '@polyrader/infra';
import { SettlementService } from './settlement-service';

export interface Dota2ReconciliationEvent {
  matchId: string;
  source: 'opendota' | 'grid' | 'unknown';
  status: 'pending' | 'settled' | 'unavailable';
  winnerTeamName?: string;
  settledBets: number;
  resolvedMarkets: number;
  message?: string;
}

export interface Dota2ReconciliationReport {
  checked: number;
  settledBets: number;
  resolvedMarkets: number;
  events: Dota2ReconciliationEvent[];
}

/** Authoritative Dota 2 paper settlement for OpenDota games and GRID series. */
export class Dota2MatchReconciliationService {
  private readonly facts: Pick<FactRepository, 'getByGameExternalId'>;
  private readonly openBets: Pick<SimBetRepository, 'listOpenMatchIdsByGame'>;
  private readonly openDota: Pick<OpenDotaClient, 'getMatchDetails'>;
  private readonly grid: Pick<GridClient, 'getSeriesState'>;
  private readonly settlement: Pick<SettlementService, 'settleStructuredMatch'>;
  private readonly markets: Pick<MarketRepository, 'resolveLocalMarkets'>;

  constructor(deps?: {
    facts?: Pick<FactRepository, 'getByGameExternalId'>;
    openBets?: Pick<SimBetRepository, 'listOpenMatchIdsByGame'>;
    openDota?: Pick<OpenDotaClient, 'getMatchDetails'>;
    grid?: Pick<GridClient, 'getSeriesState'>;
    settlement?: Pick<SettlementService, 'settleStructuredMatch'>;
    markets?: Pick<MarketRepository, 'resolveLocalMarkets'>;
  }) {
    this.facts = deps?.facts ?? new FactRepository();
    this.openBets = deps?.openBets ?? new SimBetRepository();
    this.openDota = deps?.openDota ?? new OpenDotaClient();
    this.grid = deps?.grid ?? new GridClient();
    this.settlement = deps?.settlement ?? new SettlementService();
    this.markets = deps?.markets ?? new MarketRepository();
  }

  async reconcileOpenBets(limit = 25): Promise<Dota2ReconciliationReport> {
    const matchIds = this.openBets.listOpenMatchIdsByGame('dota2', limit);
    const events: Dota2ReconciliationEvent[] = [];
    for (const matchId of matchIds) events.push(await this.reconcileMatch(matchId));
    return {
      checked: events.length,
      settledBets: events.reduce((sum, event) => sum + event.settledBets, 0),
      resolvedMarkets: events.reduce((sum, event) => sum + event.resolvedMarkets, 0),
      events,
    };
  }

  async reconcileMatch(matchId: string): Promise<Dota2ReconciliationEvent> {
    const facts = this.facts.getByGameExternalId('dota2', matchId);
    if (!facts) return unavailable(matchId, 'normalized Dota 2 facts not found');
    const source = authoritativeSource(facts);
    try {
      const result =
        source === 'grid'
          ? await this.readGridResult(matchId, facts)
          : source === 'opendota'
            ? await this.readOpenDotaResult(matchId, facts)
            : null;
      if (!result) {
        return {
          matchId,
          source,
          status: source === 'unknown' ? 'unavailable' : 'pending',
          settledBets: 0,
          resolvedMarkets: 0,
          message:
            source === 'unknown'
              ? 'no authoritative OpenDota or GRID source link'
              : 'authoritative result is not final',
        };
      }
      const settled = this.settlement.settleStructuredMatch(
        matchId,
        {
          winnerTeamName: result.winnerTeamName,
          teamAName: facts.participants[0]?.name,
          teamBName: facts.participants[1]?.name,
          teamAMapsWon: result.teamAScore,
          teamBMapsWon: result.teamBScore,
        },
        { kinds: ['match_winner'], settlementSource: source === 'grid' ? 'grid' : 'opendota' },
      );
      const resolved = this.markets.resolveLocalMarkets(`dota2:${matchId}`, result.winnerTeamName);
      return {
        matchId,
        source,
        status: 'settled',
        winnerTeamName: result.winnerTeamName,
        settledBets: settled.length,
        resolvedMarkets: resolved.length,
      };
    } catch (error) {
      return {
        matchId,
        source,
        status: 'unavailable',
        settledBets: 0,
        resolvedMarkets: 0,
        message: (error as Error).message,
      };
    }
  }

  private async readOpenDotaResult(matchId: string, facts: NormalizedMatchFacts) {
    const details = await this.openDota.getMatchDetails(matchId);
    if (details.radiantWin == null || details.duration <= 0) return null;
    const winnerId = details.radiantWin ? details.radiantTeamId : details.direTeamId;
    const winnerFallback = details.radiantWin ? details.radiantTeamName : details.direTeamName;
    const winner = facts.participants.find((participant) => participant.participantId === winnerId);
    return {
      winnerTeamName: winner?.name ?? winnerFallback,
      teamAScore: details.radiantWin ? 1 : 0,
      teamBScore: details.radiantWin ? 0 : 1,
    };
  }

  private async readGridResult(matchId: string, facts: NormalizedMatchFacts) {
    const state = await this.grid.getSeriesState(matchId);
    if (!state?.finished) return null;
    return {
      winnerTeamName: state.teamAWon
        ? (facts.participants[0]?.name ?? 'Team A')
        : (facts.participants[1]?.name ?? 'Team B'),
      teamAScore: state.teamAScore,
      teamBScore: state.teamBScore,
    };
  }
}

function authoritativeSource(facts: NormalizedMatchFacts): Dota2ReconciliationEvent['source'] {
  const sources = [...facts.sourceLinks].sort((a, b) => a.precedence - b.precedence);
  if (sources.some((item) => item.source === 'grid')) return 'grid';
  if (sources.some((item) => item.source === 'opendota')) return 'opendota';
  return 'unknown';
}

function unavailable(matchId: string, message: string): Dota2ReconciliationEvent {
  return {
    matchId,
    source: 'unknown',
    status: 'unavailable',
    settledBets: 0,
    resolvedMarkets: 0,
    message,
  };
}
