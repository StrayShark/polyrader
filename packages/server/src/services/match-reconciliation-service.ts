import { buildCanonicalMatchId, type StructuredMatchResult } from '@polyrader/core';
import {
  HLTVCrawler,
  LLMRepository,
  EsportsRepository,
  MarketRepository,
  cacheDelete,
  type HltvMatchOutcome,
} from '@polyrader/infra';
import { SettlementService } from './settlement-service';
import { buildMatchInfo } from './match-helpers';
import { logger } from '../utils/logger';

export interface MatchReconciliationEvent {
  matchId: string;
  status: 'scheduled' | 'pre_match' | 'live' | 'delayed' | 'finished' | 'cancelled';
  previousStatus: string;
  winnerTeamName?: string;
  settledBets: number;
  resolvedMarkets: number;
}

export interface MatchReconciliationReport {
  checked: number;
  unavailable: number;
  updated: number;
  settledBets: number;
  events: MatchReconciliationEvent[];
}

export class MatchReconciliationService {
  private hltv: Pick<HLTVCrawler, 'getMatchOutcome'>;
  private llmRepo: LLMRepository;
  private esportsRepo: EsportsRepository;
  private marketRepo: MarketRepository;
  private settlementService: SettlementService;

  constructor(deps: {
    hltv?: Pick<HLTVCrawler, 'getMatchOutcome'>;
    llmRepo?: LLMRepository;
    esportsRepo?: EsportsRepository;
    marketRepo?: MarketRepository;
    settlementService?: SettlementService;
  } = {}) {
    this.hltv = deps.hltv ?? new HLTVCrawler();
    this.llmRepo = deps.llmRepo ?? new LLMRepository();
    this.esportsRepo = deps.esportsRepo ?? new EsportsRepository();
    this.marketRepo = deps.marketRepo ?? new MarketRepository();
    this.settlementService = deps.settlementService ?? new SettlementService();
  }

  async reconcileActiveMatches(limit = 25): Promise<MatchReconciliationReport> {
    const rows = this.llmRepo.getActiveMatches()
      .filter((row) => row.hltv_match_id)
      .slice(0, limit);
    const report: MatchReconciliationReport = { checked: 0, unavailable: 0, updated: 0, settledBets: 0, events: [] };
    for (const row of rows) {
      const event = await this.reconcileRow(row);
      report.checked++;
      if (!event) {
        report.unavailable++;
        continue;
      }
      report.events.push(event);
      if (event.status !== event.previousStatus) report.updated++;
      report.settledBets += event.settledBets;
    }
    return report;
  }

  async reconcileMatch(matchId: string): Promise<MatchReconciliationEvent | null> {
    const row = this.llmRepo.getMatch(matchId);
    if (!row?.hltv_match_id) return null;
    return this.reconcileRow(row);
  }

  private async reconcileRow(row: Record<string, unknown>): Promise<MatchReconciliationEvent | null> {
    const matchId = String(row.match_id ?? '');
    const hltvMatchId = String(row.hltv_match_id ?? '');
    if (!matchId || !hltvMatchId) return null;
    const sourceUrl = this.esportsRepo.getMatchSourceLinks(matchId)
      .find((link) => link.source === 'hltv')?.sourceUrl;
    let outcome: HltvMatchOutcome;
    try {
      outcome = await this.hltv.getMatchOutcome(hltvMatchId, sourceUrl);
    } catch (err) {
      logger.warn('HLTV match reconciliation failed', { matchId, hltvMatchId, error: (err as Error).message });
      return null;
    }
    if (!outcome.available) return null;

    const previousStatus = String(row.status ?? 'scheduled');
    const canonicalMatchId = String(row.canonical_match_id ?? '') || buildCanonicalMatchId({ hltvMatchId });
    const canonicalRow = { ...row, canonical_match_id: canonicalMatchId };
    this.marketRepo.alignLocalMarketsWithMatch(buildMatchInfo(
      canonicalRow,
      this.llmRepo.getTeam(String(row.team_a_id ?? '')),
      this.llmRepo.getTeam(String(row.team_b_id ?? '')),
    ));
    let status: MatchReconciliationEvent['status'];
    let settledBets = 0;
    let resolvedMarkets = 0;

    if (outcome.status === 'finished') {
      status = 'finished';
      this.llmRepo.updateMatchOutcome(
        matchId,
        'finished',
        outcome.teamAScore !== undefined && outcome.teamBScore !== undefined
          ? { teamA: outcome.teamAScore, teamB: outcome.teamBScore }
          : undefined,
        outcome.winnerTeamId,
      );
      if (outcome.winnerTeamName) {
        resolvedMarkets = this.marketRepo.resolveLocalMarkets(canonicalMatchId, outcome.winnerTeamName).length;
        const mapWinners = (outcome.maps ?? [])
          .filter((map): map is { mapNumber: number; winnerTeamName: string } => Boolean(map.winnerTeamName))
          .map((map) => ({ mapNumber: map.mapNumber, winnerTeamName: map.winnerTeamName }));
        if (mapWinners.length > 0) {
          resolvedMarkets += this.marketRepo.resolveLocalMapMarkets(canonicalMatchId, mapWinners).length;
        }
        const structured: StructuredMatchResult = {
          winnerTeamName: outcome.winnerTeamName,
          teamAName: outcome.teamAName,
          teamBName: outcome.teamBName,
          teamAMapsWon: outcome.teamAScore,
          teamBMapsWon: outcome.teamBScore,
          maps: outcome.maps?.map((map) => ({
            mapNumber: map.mapNumber,
            mapName: map.mapName,
            winnerTeamName: map.winnerTeamName,
            teamARounds: map.teamARounds,
            teamBRounds: map.teamBRounds,
          })),
        };
        // Map / handicap / total stay pending until structured fields exist.
        settledBets = this.settlementService.settleStructuredMatch(matchId, structured).length;
      }
    } else if (outcome.status === 'cancelled') {
      status = 'cancelled';
      this.llmRepo.updateMatchOutcome(matchId, 'cancelled');
      resolvedMarkets = this.marketRepo.closeLocalMarkets(canonicalMatchId).length;
      settledBets = this.settlementService.voidMatch(matchId).length;
    } else {
      status = outcome.status === 'postponed'
        ? 'delayed'
        : outcome.status === 'live'
          ? 'live'
          : scheduledStatus(String(row.scheduled_at ?? ''));
      if (status !== previousStatus) this.llmRepo.updateMatchStatus(matchId, status);
    }

    await Promise.all([
      cacheDelete(`esports:match:${matchId}`),
      cacheDelete('markets:50:0'),
      cacheDelete('markets:100:0'),
      cacheDelete(`daily:${new Date().toISOString().slice(0, 10)}`),
    ]);
    return {
      matchId,
      status,
      previousStatus,
      winnerTeamName: outcome.winnerTeamName,
      settledBets,
      resolvedMarkets,
    };
  }
}

function scheduledStatus(value: string): 'scheduled' | 'pre_match' {
  const start = Date.parse(value);
  return Number.isFinite(start) && start - Date.now() <= 60 * 60 * 1000 && start > Date.now()
    ? 'pre_match'
    : 'scheduled';
}
