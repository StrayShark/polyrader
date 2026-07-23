import type {
  BoardValidationSummary,
  CurrentSourceReleaseAuditResult,
  EsportsGame,
  EsportsSourceSyncResult,
  ReleaseAuditHistoryEntry,
  ReleaseAuditStageName,
  ReleaseAuditStageTiming,
} from '@polyrader/core';
import { randomUUID } from 'node:crypto';
import { ReleaseAuditRepository } from '@polyrader/infra';
import { EsportsSourceService } from './esports-source-service';
import { FactNormalizationService } from './fact-normalization-service';
import { ReleaseGateService } from './release-gate-service';
import { AnalysisFactPreparationService } from './analysis-fact-preparation-service';
import {
  StandardAnalysisService,
  type ExecuteStandardAnalysisInput,
} from './standard-analysis-service';
import { classifyProviderFailure, sanitizeDiagnosticText } from './diagnostic-redaction';
import { Dota2MarketDiscoveryService } from './dota2-market-discovery-service';
import { Cs2MarketDiscoveryService } from './cs2-market-discovery-service';
import {
  LolMarketDiscoveryService,
  ValorantMarketDiscoveryService,
} from './riot-games-market-discovery-service';

interface AuditDependencies {
  sources?: Pick<EsportsSourceService, 'syncGame'>;
  normalization?: Pick<FactNormalizationService, 'normalizeGame'>;
  preparation?: Pick<AnalysisFactPreparationService, 'prepare'>;
  analysis?: Pick<StandardAnalysisService, 'execute'>;
  marketDiscovery?: Pick<Dota2MarketDiscoveryService, 'discoverForFacts'>;
  cs2MarketDiscovery?: Pick<Cs2MarketDiscoveryService, 'discoverForFacts'>;
  lolMarketDiscovery?: Pick<
    LolMarketDiscoveryService,
    'discoverForFacts' | 'discoverForCandidates'
  >;
  valorantMarketDiscovery?: Pick<
    ValorantMarketDiscoveryService,
    'discoverForFacts' | 'discoverForCandidates'
  >;
  gates?: Pick<ReleaseGateService, 'get'>;
  history?: Pick<ReleaseAuditRepository, 'save'> | null;
  now?: () => Date;
  clockMs?: () => number;
}

export class CurrentSourceReleaseAuditService {
  private readonly sources: NonNullable<AuditDependencies['sources']>;
  private readonly normalization: NonNullable<AuditDependencies['normalization']>;
  private readonly preparation: NonNullable<AuditDependencies['preparation']>;
  private readonly analysis: NonNullable<AuditDependencies['analysis']>;
  private readonly marketDiscovery: NonNullable<AuditDependencies['marketDiscovery']>;
  private readonly cs2MarketDiscovery: NonNullable<AuditDependencies['cs2MarketDiscovery']>;
  private readonly lolMarketDiscovery: NonNullable<AuditDependencies['lolMarketDiscovery']>;
  private readonly valorantMarketDiscovery: NonNullable<
    AuditDependencies['valorantMarketDiscovery']
  >;
  private readonly gates: NonNullable<AuditDependencies['gates']>;
  private readonly history: Pick<ReleaseAuditRepository, 'save'> | null;
  private readonly now: () => Date;
  private readonly clockMs: () => number;

  constructor(deps: AuditDependencies = {}) {
    this.sources = deps.sources ?? new EsportsSourceService();
    this.normalization = deps.normalization ?? new FactNormalizationService();
    this.preparation = deps.preparation ?? new AnalysisFactPreparationService();
    this.analysis = deps.analysis ?? new StandardAnalysisService();
    this.marketDiscovery = deps.marketDiscovery ?? new Dota2MarketDiscoveryService();
    this.cs2MarketDiscovery = deps.cs2MarketDiscovery ?? new Cs2MarketDiscoveryService();
    this.lolMarketDiscovery = deps.lolMarketDiscovery ?? new LolMarketDiscoveryService();
    this.valorantMarketDiscovery =
      deps.valorantMarketDiscovery ?? new ValorantMarketDiscoveryService();
    this.gates = deps.gates ?? new ReleaseGateService();
    this.history = deps.history === null ? null : (deps.history ?? new ReleaseAuditRepository());
    this.now = deps.now ?? (() => new Date());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async run(
    game: EsportsGame,
    options: {
      executeAnalysis?: boolean;
      provider?: string;
      preferredExternalMatchId?: string;
    } = {},
  ): Promise<CurrentSourceReleaseAuditResult> {
    const auditId = `ra-${randomUUID()}`;
    const startedAt = this.now().toISOString();
    const auditStartedMs = this.clockMs();
    const stageTimings: ReleaseAuditStageTiming[] = [];

    const sourceStage = this.beginStage('source_sync', stageTimings);
    const sync = await this.sources.syncGame(game);
    sourceStage.finish(
      sync.status === 'success' ? 'passed' : sync.status === 'partial' ? 'blocked' : 'failed',
      `${sync.records} records · ${sync.status}`,
    );

    const normalizeOpts = options.preferredExternalMatchId
      ? { preferredExternalMatchId: options.preferredExternalMatchId }
      : undefined;

    const factsStage = this.beginStage('fact_normalize', stageTimings);
    let normalized = this.normalization.normalizeGame(game, normalizeOpts);
    let board = normalized.summary;
    let factsPassed = board.stages.some(
      (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
    );
    const preferredMatchId =
      options.preferredExternalMatchId ?? board.sampleMatch?.externalMatchId;
    if (
      game === 'cs2' &&
      preferredMatchId &&
      (!factsPassed || board.boardState !== 'paper_ready' || !factsAreFresh(board))
    ) {
      await this.preparation.prepare('cs2', preferredMatchId);
      normalized = this.normalization.normalizeGame(game, normalizeOpts);
      board = normalized.summary;
      factsPassed = board.stages.some(
        (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
      );
    }
    let discoveryDetail: string | undefined;
    if (game === 'cs2' && board.sampleMatch) {
      try {
        const discovery = await this.cs2MarketDiscovery.discoverForFacts(board.sampleMatch);
        discoveryDetail = discovery.detail;
        board = annotateBoardMarketDiscovery(
          this.normalization.normalizeGame(game, normalizeOpts).summary,
          discovery,
        );
        factsPassed = board.stages.some(
          (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
        );
      } catch {
        // Missing public markets is an explicit market-stage blocker, not an audit crash.
      }
    }
    if (game === 'dota2' && board.sampleMatch) {
      try {
        const discovery = await this.marketDiscovery.discoverForFacts(board.sampleMatch);
        discoveryDetail = discovery.detail;
        board = annotateBoardMarketDiscovery(
          this.normalization.normalizeGame(game, normalizeOpts).summary,
          discovery,
        );
        factsPassed = board.stages.some(
          (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
        );
      } catch {
        // Missing public markets is an explicit market-stage blocker, not an audit crash.
      }
    }
    if (game === 'lol' && board.sampleMatch) {
      try {
        const discovery = await this.lolMarketDiscovery.discoverForCandidates(
          normalized.persisted.length > 0 ? normalized.persisted : [board.sampleMatch],
        );
        discoveryDetail = discovery.detail;
        board = annotateBoardMarketDiscovery(
          this.normalization.normalizeGame(game, {
            preferredExternalMatchId: discovery.matchedExternalMatchId,
          }).summary,
          discovery,
        );
        factsPassed = board.stages.some(
          (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
        );
      } catch {
        // Missing public markets is an explicit market-stage blocker, not an audit crash.
      }
    }
    if (game === 'valorant' && board.sampleMatch) {
      try {
        const discovery = await this.valorantMarketDiscovery.discoverForCandidates(
          normalized.persisted.length > 0 ? normalized.persisted : [board.sampleMatch],
        );
        discoveryDetail = discovery.detail;
        board = annotateBoardMarketDiscovery(
          this.normalization.normalizeGame(game, {
            preferredExternalMatchId: discovery.matchedExternalMatchId,
          }).summary,
          discovery,
        );
        factsPassed = board.stages.some(
          (stage) => stage.stage === 'fact_normalize' && stage.status === 'passed',
        );
      } catch {
        // Missing public markets is an explicit market-stage blocker, not an audit crash.
      }
    }
    factsStage.finish(
      factsPassed ? 'passed' : 'blocked',
      discoveryDetail
        ? `${Math.round(board.completeness * 100)}% · ${board.boardState} · ${discoveryDetail}`
        : `${Math.round(board.completeness * 100)}% · ${board.boardState}`,
    );
    const marketPassed = board.stages.some(
      (stage) => stage.stage === 'market_align' && stage.status === 'passed',
    );
    let analysis: CurrentSourceReleaseAuditResult['analysis'];
    const providerStage = this.beginStage('provider_execute', stageTimings);

    if (options.executeAnalysis === false) {
      analysis = { status: 'skipped', detail: 'provider execution disabled for this audit' };
      providerStage.finish('skipped', analysis.detail);
    } else if (!board.sampleMatch) {
      analysis = { status: 'skipped', detail: 'no normalized current-source match is available' };
      providerStage.finish('skipped', analysis.detail);
    } else if (
      !isCurrentPrematch(board.sampleMatch.startsAt, board.sampleMatch.status, this.now())
    ) {
      analysis = {
        status: 'skipped',
        detail: 'selected match is no longer an eligible pre-match sample',
      };
      providerStage.finish('skipped', analysis.detail);
    } else if (board.boardState !== 'paper_ready' || !marketPassed) {
      analysis = {
        status: 'skipped',
        detail: `board is ${board.boardState}; current-source facts and market alignment must pass`,
      };
      providerStage.finish('skipped', analysis.detail);
    } else {
      const input: ExecuteStandardAnalysisInput = {
        game,
        matchId: board.sampleMatch.externalMatchId,
        provider: options.provider,
      };
      try {
        const detail = await this.analysis.execute(input);
        analysis = {
          status: 'completed',
          runId: detail.run.runId,
          provider: detail.run.provider ?? undefined,
          detail: 'current snapshot provider run persisted',
        };
        providerStage.finish('passed', `${analysis.provider ?? 'provider'} · persisted`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'provider execution failed';
        const failureCategory = classifyProviderFailure(message);
        analysis = {
          status: 'failed',
          failure: {
            category: failureCategory,
            detail: sanitizeDiagnosticText(message),
          },
          detail: sanitizeDiagnosticText(message),
        };
        providerStage.finish('failed', `${failureCategory} · ${analysis.detail}`);
      }
    }

    const gateStage = this.beginStage('gate_evaluate', stageTimings);
    const gate = this.gates.get(game);
    gateStage.finish(
      gate.status === 'verified' ? 'passed' : 'blocked',
      gate.currentSource.blockers[0] ?? 'all current-source stages passed',
    );
    const finishedAt = this.now().toISOString();
    const result: CurrentSourceReleaseAuditResult = {
      auditId,
      game,
      startedAt,
      finishedAt,
      sync: sync as EsportsSourceSyncResult,
      board,
      analysis,
      stageTimings,
      gate,
    };
    this.history?.save(this.toHistoryEntry(result, Math.max(0, this.clockMs() - auditStartedMs)));
    return result;
  }

  private beginStage(stage: ReleaseAuditStageName, target: ReleaseAuditStageTiming[]) {
    const startedAt = this.now().toISOString();
    const startedMs = this.clockMs();
    return {
      finish: (status: ReleaseAuditStageTiming['status'], detail: string) => {
        target.push({
          stage,
          status,
          startedAt,
          finishedAt: this.now().toISOString(),
          durationMs: Math.max(0, this.clockMs() - startedMs),
          detail: sanitizeDiagnosticText(detail, 240),
        });
      },
    };
  }

  private toHistoryEntry(
    result: CurrentSourceReleaseAuditResult,
    durationMs: number,
  ): ReleaseAuditHistoryEntry {
    return {
      auditId: result.auditId,
      game: result.game,
      outcome:
        result.analysis.status === 'failed'
          ? 'failed'
          : result.gate.status === 'verified'
            ? 'verified'
            : 'blocked',
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs,
      boardState: result.board.boardState,
      externalMatchId: result.board.sampleMatch?.externalMatchId,
      dataSnapshotHash: result.board.sampleMatch?.dataSnapshotHash,
      syncStatus: result.sync.status,
      sourceRecords: result.sync.records,
      analysisStatus: result.analysis.status,
      analysisRunId: result.analysis.runId,
      provider: result.analysis.provider,
      providerFailure: result.analysis.failure,
      gateStatus: result.gate.status,
      stageTimings: result.stageTimings,
      blockers: result.gate.currentSource.blockers.map((blocker) =>
        sanitizeDiagnosticText(blocker, 240),
      ),
    };
  }
}

function isCurrentPrematch(startsAt: string, status: string, now: Date): boolean {
  if (['finished', 'completed', 'cancelled', 'canceled'].includes(status.toLowerCase()))
    return false;
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp >= now.getTime() - 15 * 60 * 1000;
}

function factsAreFresh(board: {
  freshnessSeconds?: number;
  stages: Array<{ stage: string; status: string }>;
}): boolean {
  const sourceStage = board.stages.find((stage) => stage.stage === 'source_sync');
  if (sourceStage?.status === 'passed') return true;
  return (
    typeof board.freshnessSeconds === 'number' &&
    Number.isFinite(board.freshnessSeconds) &&
    board.freshnessSeconds <= 3_600
  );
}

export function annotateBoardMarketDiscovery(
  board: BoardValidationSummary,
  discovery: { scanned: number; aligned: number; detail: string },
): BoardValidationSummary {
  return {
    ...board,
    stages: board.stages.map((stage) =>
      stage.stage === 'market_align'
        ? {
            ...stage,
            detail: `${stage.detail} · discovery ${discovery.aligned}/${discovery.scanned} · ${discovery.detail}`,
          }
        : stage,
    ),
  };
}
