import type {
  BoardReleaseGateSummary,
  BoardValidationSummary,
  EsportsGame,
  ReleaseGateEvidence,
  ReleaseGateReport,
  ReleaseGateStage,
  ReleaseGateStageName,
} from '@polyrader/core';
import { brierForBet } from '@polyrader/core';
import { AnalysisRunRepository, SimBetRepository } from '@polyrader/infra';
import { FactNormalizationService } from './fact-normalization-service';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];
const STAGES: ReleaseGateStageName[] = [
  'source',
  'facts',
  'market',
  'prompt',
  'response',
  'report',
  'decision',
  'settlement',
  'statistics',
];

type RunRecord = ReturnType<AnalysisRunRepository['listRuns']>[number];

export class ReleaseGateService {
  private readonly normalization: Pick<FactNormalizationService, 'getBoard'>;
  private readonly runs: AnalysisRunRepository;
  private readonly bets: SimBetRepository;

  constructor(deps?: {
    normalization?: Pick<FactNormalizationService, 'getBoard'>;
    runs?: AnalysisRunRepository;
    bets?: SimBetRepository;
  }) {
    this.normalization = deps?.normalization ?? new FactNormalizationService();
    this.runs = deps?.runs ?? new AnalysisRunRepository();
    this.bets = deps?.bets ?? new SimBetRepository();
  }

  list(): BoardReleaseGateSummary[] {
    return GAMES.map((game) => this.get(game));
  }

  report(): ReleaseGateReport {
    const boards = this.list();
    const verifiedCount = boards.filter((board) => board.status === 'verified').length;
    return {
      generatedAt: new Date().toISOString(),
      releaseReady: verifiedCount === GAMES.length,
      verifiedCount,
      fixtureReadyCount: boards.filter((board) => board.status === 'fixture_ready').length,
      blockedCount: boards.filter((board) => board.status === 'blocked').length,
      boards,
    };
  }

  get(
    game: EsportsGame,
    options?: { board?: BoardValidationSummary; runId?: string },
  ): BoardReleaseGateSummary {
    const checkedAt = new Date().toISOString();
    const board = options?.board ?? this.normalization.getBoard(game).summary;
    const runs = this.runs.listRuns(100, game);
    const fixtureRun = runs.find((run) => isFixtureRun(run));
    const currentRun = selectCurrentSourceRun(runs, board, options?.runId);
    const fixture = this.fixtureEvidence(fixtureRun, checkedAt);
    const currentSource = this.currentSourceEvidence(board, currentRun, checkedAt);
    return {
      game,
      status:
        fixture.status === 'passed' && currentSource.status === 'passed'
          ? 'verified'
          : fixture.status === 'passed'
            ? 'fixture_ready'
            : 'blocked',
      fixture,
      currentSource,
    };
  }

  private fixtureEvidence(run: RunRecord | undefined, checkedAt: string): ReleaseGateEvidence {
    if (!run) return missingEvidence(checkedAt, 'no deterministic fixture run');
    const base: ReleaseGateStage[] = [
      passed('source', 'deterministic fixture source is versioned'),
      run.dataSnapshotHash.startsWith('sha256:')
        ? passed('facts', `${run.gameAdapterVersion} · ${run.dataSnapshotHash.slice(0, 18)}`)
        : blocked('facts', 'fixture data snapshot hash is missing'),
      run.marketId && run.marketKind
        ? passed('market', `${run.marketKind} · ${run.marketId}`)
        : blocked('market', 'fixture market identity is missing'),
    ];
    return this.completeEvidence(run, checkedAt, base);
  }

  private currentSourceEvidence(
    board: BoardValidationSummary,
    run: RunRecord | undefined,
    checkedAt: string,
  ): ReleaseGateEvidence {
    const sourceStage = board.stages.find((stage) => stage.stage === 'source_sync');
    const factsStage = board.stages.find((stage) => stage.stage === 'fact_normalize');
    const marketStage = board.stages.find((stage) => stage.stage === 'market_align');
    const base: ReleaseGateStage[] = [
      fromBoardStage('source', sourceStage?.status, sourceStage?.detail ?? 'source not checked'),
      fromBoardStage('facts', factsStage?.status, factsStage?.detail ?? 'facts not normalized'),
      fromBoardStage('market', marketStage?.status, marketStage?.detail ?? 'market not aligned'),
    ];
    if (!run) {
      const stages = [
        ...base,
        ...(['prompt', 'response', 'report', 'decision', 'settlement', 'statistics'] as const).map(
          (stage) => missing(stage, 'no current-source provider run'),
        ),
      ];
      return summarizeEvidence(stages, checkedAt);
    }
    return this.completeEvidence(run, checkedAt, base);
  }

  private completeEvidence(
    run: RunRecord,
    checkedAt: string,
    base: ReleaseGateStage[],
  ): ReleaseGateEvidence {
    const prompt = this.runs.getPromptArtifact(run.runId);
    const validResponse = this.runs.listResponseArtifacts(run.runId).some((item) => item.isValid);
    const report = this.runs.getReportByRun(run.runId);
    const decision = this.runs.getPaperDecisionByRun(run.runId);
    const bet = decision?.betId ? this.bets.getById(decision.betId) : undefined;
    const brier = bet ? brierForBet(bet) : undefined;
    const stages: ReleaseGateStage[] = [
      ...base,
      prompt?.promptHash && run.promptHash === prompt.promptHash
        ? passed('prompt', `${run.promptVersion} · stable hash`)
        : missing('prompt', 'versioned prompt artifact is missing or mismatched'),
      validResponse
        ? passed('response', 'schema-valid provider response persisted')
        : missing('response', 'no schema-valid provider response'),
      report
        ? passed('report', `${report.id} · analysis.v1 report persisted`)
        : missing('report', 'normalized report is missing'),
      decision
        ? passed('decision', `${decision.action} · ${decision.policyVersion}`)
        : missing('decision', 'deterministic paper decision is missing'),
      bet?.status === 'settled'
        ? passed('settlement', `${bet.result ?? 'unknown'} · ${bet.settledAt ?? 'settled'}`)
        : missing(
            'settlement',
            decision?.action === 'paper_bet'
              ? 'linked bet is not settled'
              : 'no settled linked bet',
          ),
      bet?.status === 'settled' &&
      bet.clvStatus === 'captured' &&
      brier != null &&
      Number.isFinite(bet.pnl)
        ? passed(
            'statistics',
            `linked bet · Brier ${brier.toFixed(4)} · CLV ${(bet.clv ?? 0).toFixed(4)} · PnL ${bet.pnl.toFixed(2)}`,
          )
        : missing('statistics', 'linked bet Brier, captured CLV, and PnL sample is missing'),
    ];
    return summarizeEvidence(stages, checkedAt, run.runId);
  }
}

function isFixtureRun(run: RunRecord): boolean {
  return /^fixture(?:-|$)/i.test(run.provider ?? '') || /fixture/i.test(run.model ?? '');
}

/** Prefer exact snapshot hash; fall back to same-match current runs when freshness rehash drifts. */
function selectCurrentSourceRun(
  runs: RunRecord[],
  board: BoardValidationSummary,
  preferredRunId?: string,
): RunRecord | undefined {
  if (preferredRunId) {
    const preferred = runs.find((run) => run.runId === preferredRunId);
    if (preferred && !isFixtureRun(preferred)) return preferred;
  }
  const matchId = board.sampleMatch?.externalMatchId;
  if (!matchId) return undefined;
  const candidates = runs.filter(
    (run) =>
      !isFixtureRun(run) &&
      run.matchId === matchId &&
      !run.marketId.startsWith('local-practice:'),
  );
  if (candidates.length === 0) return undefined;
  const exactHash = board.sampleMatch?.dataSnapshotHash;
  return (
    candidates.find((run) => exactHash && run.dataSnapshotHash === exactHash) ?? candidates[0]
  );
}

function summarizeEvidence(
  stages: ReleaseGateStage[],
  checkedAt: string,
  runId?: string,
): ReleaseGateEvidence {
  const blockers = stages
    .filter((stage) => stage.status !== 'passed')
    .map((stage) => `${stage.stage}: ${stage.detail}`);
  return {
    status:
      blockers.length === 0
        ? 'passed'
        : stages.every((stage) => stage.status === 'missing')
          ? 'missing'
          : 'blocked',
    runId,
    checkedAt,
    stages,
    blockers,
  };
}

function missingEvidence(checkedAt: string, detail: string): ReleaseGateEvidence {
  return summarizeEvidence(
    STAGES.map((stage) => missing(stage, detail)),
    checkedAt,
  );
}

function fromBoardStage(
  stage: ReleaseGateStageName,
  status: BoardValidationSummary['stages'][number]['status'] | undefined,
  detail: string,
): ReleaseGateStage {
  if (status === 'passed') return passed(stage, detail);
  if (status === 'failed' || status === 'warning') return blocked(stage, detail);
  return missing(stage, detail);
}

function passed(stage: ReleaseGateStageName, detail: string): ReleaseGateStage {
  return { stage, status: 'passed', detail };
}

function blocked(stage: ReleaseGateStageName, detail: string): ReleaseGateStage {
  return { stage, status: 'blocked', detail };
}

function missing(stage: ReleaseGateStageName, detail: string): ReleaseGateStage {
  return { stage, status: 'missing', detail };
}
