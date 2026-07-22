import { randomUUID } from 'crypto';
import { query, queryOne, transaction } from '../connection';
import type {
  AnalysisReport,
  AnalysisRequestEnvelope,
  AnalysisRunStatus,
  AnalysisValidationStatus,
  PaperDecisionResult,
} from '@polyrader/core';

export interface AnalysisRunRecord {
  runId: string;
  game: string;
  matchId: string;
  marketId: string;
  marketKind: string;
  contractVersion: string;
  promptVersion: string;
  responseSchemaVersion: string;
  gameAdapterVersion: string;
  marketAdapterVersion: string;
  dataSnapshotHash: string;
  promptHash: string | null;
  status: AnalysisRunStatus;
  validationStatus: AnalysisValidationStatus;
  provider: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisPromptArtifactRecord {
  id: string;
  runId: string;
  systemPrompt: string;
  userEnvelopeJson: string;
  outputSchemaJson: string;
  promptHash: string;
  createdAt: string;
}

export interface AnalysisResponseArtifactRecord {
  id: string;
  runId: string;
  attempt: number;
  rawResponse: string;
  normalizedResponseJson: string | null;
  validationErrorsJson: string;
  isValid: boolean;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: string;
}

export interface AnalysisRunEventRecord {
  id: number;
  runId: string;
  stage: string;
  status: string;
  detail: string;
  createdAt: string;
}

export interface AnalysisReportRecord {
  id: string;
  runId: string;
  reportVersion: number;
  reportJson: string;
  decisionAction: string;
  decisionReasonCodesJson: string;
  modelProbability: number | null;
  marketProbability: number | null;
  edgeAtEntry: number | null;
  createdAt: string;
}

export interface PaperDecisionRecord {
  id: string;
  runId: string;
  reportId: string | null;
  game: string;
  matchId: string;
  marketId: string;
  marketKind: string;
  provider: string | null;
  policyVersion: string;
  action: string;
  outcomeId: string | null;
  reasonCodesJson: string;
  modelProbability: number | null;
  marketProbability: number | null;
  edgeAtEntry: number | null;
  stake: number | null;
  price: number | null;
  betId: string | null;
  createdAt: string;
}

function mapRun(row: Record<string, unknown>): AnalysisRunRecord {
  return {
    runId: String(row.run_id),
    game: String(row.game),
    matchId: String(row.match_id),
    marketId: String(row.market_id),
    marketKind: String(row.market_kind),
    contractVersion: String(row.contract_version),
    promptVersion: String(row.prompt_version),
    responseSchemaVersion: String(row.response_schema_version),
    gameAdapterVersion: String(row.game_adapter_version),
    marketAdapterVersion: String(row.market_adapter_version),
    dataSnapshotHash: String(row.data_snapshot_hash),
    promptHash: row.prompt_hash != null ? String(row.prompt_hash) : null,
    status: String(row.status) as AnalysisRunStatus,
    validationStatus: String(row.validation_status) as AnalysisValidationStatus,
    provider: row.provider != null ? String(row.provider) : null,
    model: row.model != null ? String(row.model) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class AnalysisRunRepository {
  createRun(input: {
    runId: string;
    envelope: AnalysisRequestEnvelope;
    promptHash?: string;
    provider?: string;
    model?: string;
    gameAdapterVersion?: string;
    marketAdapterVersion?: string;
  }): AnalysisRunRecord {
    const now = new Date().toISOString();
    query(
      `INSERT INTO analysis_runs (
        run_id, game, match_id, market_id, market_kind, contract_version, prompt_version,
        response_schema_version, game_adapter_version, market_adapter_version,
        data_snapshot_hash, prompt_hash, status, validation_status, provider, model,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.runId,
      input.envelope.game,
      input.envelope.match.matchId,
      input.envelope.market.marketId,
      input.envelope.market.kind,
      input.envelope.contractVersion,
      input.envelope.promptVersion,
      'analysis-response.v1',
      input.gameAdapterVersion ?? 'cs2.v1',
      input.marketAdapterVersion ?? 'market.v1',
      input.envelope.dataSnapshot.dataSnapshotHash,
      input.promptHash ?? null,
      'created',
      'pending',
      input.provider ?? null,
      input.model ?? null,
      now,
      now,
    );
    return this.getRun(input.runId)!;
  }

  updateRunStatus(
    runId: string,
    patch: {
      status?: AnalysisRunStatus;
      validationStatus?: AnalysisValidationStatus;
      promptHash?: string;
      provider?: string;
      model?: string;
    },
  ): void {
    const current = this.getRun(runId);
    if (!current) throw new Error(`Analysis run ${runId} not found`);
    const now = new Date().toISOString();
    query(
      `UPDATE analysis_runs SET
        status = ?,
        validation_status = ?,
        prompt_hash = ?,
        provider = ?,
        model = ?,
        updated_at = ?
      WHERE run_id = ?`,
      patch.status ?? current.status,
      patch.validationStatus ?? current.validationStatus,
      patch.promptHash ?? current.promptHash,
      patch.provider ?? current.provider,
      patch.model ?? current.model,
      now,
      runId,
    );
  }

  getRun(runId: string): AnalysisRunRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM analysis_runs WHERE run_id = ?`,
      runId,
    );
    return row ? mapRun(row) : undefined;
  }

  listRuns(limit = 50, game?: string): AnalysisRunRecord[] {
    if (game) {
      return query<Record<string, unknown>>(
        `SELECT * FROM analysis_runs WHERE game = ? ORDER BY created_at DESC LIMIT ?`,
        game,
        limit,
      ).map(mapRun);
    }
    return query<Record<string, unknown>>(
      `SELECT * FROM analysis_runs ORDER BY created_at DESC LIMIT ?`,
      limit,
    ).map(mapRun);
  }

  savePromptArtifact(input: {
    runId: string;
    systemPrompt: string;
    userEnvelopeJson: string;
    outputSchemaJson: string;
    promptHash: string;
  }): AnalysisPromptArtifactRecord {
    const id = `apa-${randomUUID()}`;
    const now = new Date().toISOString();
    query(
      `INSERT INTO analysis_prompt_artifacts (
        id, run_id, system_prompt, user_envelope_json, output_schema_json, prompt_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        system_prompt = excluded.system_prompt,
        user_envelope_json = excluded.user_envelope_json,
        output_schema_json = excluded.output_schema_json,
        prompt_hash = excluded.prompt_hash`,
      id,
      input.runId,
      input.systemPrompt,
      input.userEnvelopeJson,
      input.outputSchemaJson,
      input.promptHash,
      now,
    );
    return this.getPromptArtifact(input.runId)!;
  }

  getPromptArtifact(runId: string): AnalysisPromptArtifactRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM analysis_prompt_artifacts WHERE run_id = ?`,
      runId,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      runId: String(row.run_id),
      systemPrompt: String(row.system_prompt),
      userEnvelopeJson: String(row.user_envelope_json),
      outputSchemaJson: String(row.output_schema_json),
      promptHash: String(row.prompt_hash),
      createdAt: String(row.created_at),
    };
  }

  saveResponseArtifact(input: {
    runId: string;
    attempt: number;
    rawResponse: string;
    normalizedResponseJson?: string | null;
    validationErrors: unknown[];
    isValid: boolean;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }): AnalysisResponseArtifactRecord {
    const id = `ara-${randomUUID()}`;
    const now = new Date().toISOString();
    query(
      `INSERT INTO analysis_response_artifacts (
        id, run_id, attempt, raw_response, normalized_response_json, validation_errors_json,
        is_valid, latency_ms, prompt_tokens, completion_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.runId,
      input.attempt,
      input.rawResponse,
      input.normalizedResponseJson ?? null,
      JSON.stringify(input.validationErrors),
      input.isValid ? 1 : 0,
      input.latencyMs ?? null,
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      input.totalTokens ?? null,
      now,
    );
    return this.listResponseArtifacts(input.runId).find((item) => item.id === id)!;
  }

  listResponseArtifacts(runId: string): AnalysisResponseArtifactRecord[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM analysis_response_artifacts WHERE run_id = ? ORDER BY attempt ASC`,
      runId,
    ).map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      attempt: Number(row.attempt),
      rawResponse: String(row.raw_response),
      normalizedResponseJson: row.normalized_response_json != null ? String(row.normalized_response_json) : null,
      validationErrorsJson: String(row.validation_errors_json ?? '[]'),
      isValid: Number(row.is_valid) === 1,
      latencyMs: row.latency_ms != null ? Number(row.latency_ms) : null,
      promptTokens: row.prompt_tokens != null ? Number(row.prompt_tokens) : null,
      completionTokens: row.completion_tokens != null ? Number(row.completion_tokens) : null,
      totalTokens: row.total_tokens != null ? Number(row.total_tokens) : null,
      createdAt: String(row.created_at),
    }));
  }

  addEvent(runId: string, stage: string, status: string, detail = ''): void {
    query(
      `INSERT INTO analysis_run_events (run_id, stage, status, detail) VALUES (?, ?, ?, ?)`,
      runId,
      stage,
      status,
      detail,
    );
  }

  listEvents(runId: string): AnalysisRunEventRecord[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM analysis_run_events WHERE run_id = ? ORDER BY id ASC`,
      runId,
    ).map((row) => ({
      id: Number(row.id),
      runId: String(row.run_id),
      stage: String(row.stage),
      status: String(row.status),
      detail: String(row.detail ?? ''),
      createdAt: String(row.created_at),
    }));
  }

  saveReport(input: {
    reportId: string;
    runId: string;
    report: AnalysisReport;
    decision: PaperDecisionResult;
  }): AnalysisReportRecord {
    const now = new Date().toISOString();
    query(
      `INSERT INTO analysis_reports (
        id, run_id, report_version, report_json, decision_action, decision_reason_codes_json,
        model_probability, market_probability, edge_at_entry, created_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      input.reportId,
      input.runId,
      JSON.stringify(input.report),
      input.decision.action,
      JSON.stringify(input.decision.reasonCodes),
      input.decision.modelProbability,
      input.decision.marketProbability,
      input.decision.edgeAtEntry,
      now,
    );
    return this.getReportByRun(input.runId)!;
  }

  getReportByRun(runId: string): AnalysisReportRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM analysis_reports WHERE run_id = ? ORDER BY report_version DESC LIMIT 1`,
      runId,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      runId: String(row.run_id),
      reportVersion: Number(row.report_version),
      reportJson: String(row.report_json),
      decisionAction: String(row.decision_action),
      decisionReasonCodesJson: String(row.decision_reason_codes_json ?? '[]'),
      modelProbability: row.model_probability != null ? Number(row.model_probability) : null,
      marketProbability: row.market_probability != null ? Number(row.market_probability) : null,
      edgeAtEntry: row.edge_at_entry != null ? Number(row.edge_at_entry) : null,
      createdAt: String(row.created_at),
    };
  }

  getReport(reportId: string): AnalysisReportRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM analysis_reports WHERE id = ?`,
      reportId,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      runId: String(row.run_id),
      reportVersion: Number(row.report_version),
      reportJson: String(row.report_json),
      decisionAction: String(row.decision_action),
      decisionReasonCodesJson: String(row.decision_reason_codes_json ?? '[]'),
      modelProbability: row.model_probability != null ? Number(row.model_probability) : null,
      marketProbability: row.market_probability != null ? Number(row.market_probability) : null,
      edgeAtEntry: row.edge_at_entry != null ? Number(row.edge_at_entry) : null,
      createdAt: String(row.created_at),
    };
  }

  savePaperDecision(input: {
    runId: string;
    reportId: string;
    envelope: AnalysisRequestEnvelope;
    decision: PaperDecisionResult;
    provider?: string;
    betId?: string;
  }): PaperDecisionRecord {
    const id = `pd-${randomUUID()}`;
    const now = new Date().toISOString();
    query(
      `INSERT INTO paper_decisions (
        id, run_id, report_id, game, match_id, market_id, market_kind, provider, policy_version,
        action, outcome_id, reason_codes_json, model_probability, market_probability,
        edge_at_entry, stake, price, bet_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.runId,
      input.reportId,
      input.envelope.game,
      input.envelope.match.matchId,
      input.envelope.market.marketId,
      input.envelope.market.kind,
      input.provider ?? null,
      input.decision.policyVersion,
      input.decision.action,
      input.decision.outcomeId,
      JSON.stringify(input.decision.reasonCodes),
      input.decision.modelProbability,
      input.decision.marketProbability,
      input.decision.edgeAtEntry,
      input.decision.stake,
      input.decision.price,
      input.betId ?? null,
      now,
    );
    return this.getPaperDecision(id)!;
  }

  getPaperDecision(id: string): PaperDecisionRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM paper_decisions WHERE id = ?`,
      id,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      runId: String(row.run_id),
      reportId: row.report_id != null ? String(row.report_id) : null,
      game: String(row.game),
      matchId: String(row.match_id),
      marketId: String(row.market_id),
      marketKind: String(row.market_kind),
      provider: row.provider != null ? String(row.provider) : null,
      policyVersion: String(row.policy_version),
      action: String(row.action),
      outcomeId: row.outcome_id != null ? String(row.outcome_id) : null,
      reasonCodesJson: String(row.reason_codes_json ?? '[]'),
      modelProbability: row.model_probability != null ? Number(row.model_probability) : null,
      marketProbability: row.market_probability != null ? Number(row.market_probability) : null,
      edgeAtEntry: row.edge_at_entry != null ? Number(row.edge_at_entry) : null,
      stake: row.stake != null ? Number(row.stake) : null,
      price: row.price != null ? Number(row.price) : null,
      betId: row.bet_id != null ? String(row.bet_id) : null,
      createdAt: String(row.created_at),
    };
  }

  getPaperDecisionByRun(runId: string): PaperDecisionRecord | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM paper_decisions WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
      runId,
    );
    return row ? this.getPaperDecision(String(row.id)) : undefined;
  }

  attachBetToDecision(decisionId: string, betId: string): void {
    query(`UPDATE paper_decisions SET bet_id = ? WHERE id = ?`, betId, decisionId);
  }

  listPaperDecisions(limit = 50, action?: string): PaperDecisionRecord[] {
    const rows = action
      ? query<Record<string, unknown>>(
        `SELECT * FROM paper_decisions WHERE action = ? ORDER BY created_at DESC LIMIT ?`,
        action,
        limit,
      )
      : query<Record<string, unknown>>(
        `SELECT * FROM paper_decisions ORDER BY created_at DESC LIMIT ?`,
        limit,
      );
    return rows.map((row) => this.getPaperDecision(String(row.id))!).filter(Boolean);
  }

  persistValidatedPipeline(fn: () => void): void {
    transaction(fn);
  }
}
