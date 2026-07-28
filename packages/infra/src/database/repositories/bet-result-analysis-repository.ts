import { query, queryOne } from '../connection';
import type {
  BetResultAnalysisArtifact,
  BetResultAnalysisRequestEnvelope,
  BetResultAnalysisResponseV1,
  BetResultAnalysisStatus,
  BetResultAnalysisValidationError,
} from '@polyrader/core';

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function mapArtifact(row: Record<string, unknown>): BetResultAnalysisArtifact {
  const normalizedResponseJson = row.normalized_response_json != null
    ? String(row.normalized_response_json)
    : undefined;
  return {
    id: String(row.id),
    betId: String(row.bet_id),
    status: String(row.status) as BetResultAnalysisStatus,
    contractVersion: 'bet-review.v1',
    promptVersion: 'bet-review.v1.0.0',
    responseSchemaVersion: 'bet-review-response.v1',
    provider: row.provider != null ? String(row.provider) : undefined,
    model: row.model != null ? String(row.model) : undefined,
    promptHash: String(row.prompt_hash),
    systemPrompt: String(row.system_prompt),
    inputJson: String(row.input_json),
    outputSchemaJson: String(row.output_schema_json),
    rawResponse: row.raw_response != null ? String(row.raw_response) : undefined,
    normalizedResponseJson,
    validationErrors: parseJson<BetResultAnalysisValidationError[]>(
      row.validation_errors_json,
      [],
    ),
    response: normalizedResponseJson
      ? parseJson<BetResultAnalysisResponseV1 | undefined>(normalizedResponseJson, undefined)
      : undefined,
    latencyMs: row.latency_ms != null ? Number(row.latency_ms) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class BetResultAnalysisRepository {
  createPrompt(input: {
    id: string;
    envelope: BetResultAnalysisRequestEnvelope;
    promptHash: string;
    systemPrompt: string;
    inputJson: string;
    outputSchemaJson: string;
  }): BetResultAnalysisArtifact {
    const now = new Date().toISOString();
    query(
      `INSERT INTO bet_result_analyses (
        id, bet_id, status, contract_version, prompt_version, response_schema_version,
        prompt_hash, system_prompt, input_json, output_schema_json,
        validation_errors_json, created_at, updated_at
      ) VALUES (?, ?, 'prompt_ready', ?, ?, 'bet-review-response.v1', ?, ?, ?, ?, '[]', ?, ?)`,
      input.id,
      input.envelope.bet.betId,
      input.envelope.contractVersion,
      input.envelope.promptVersion,
      input.promptHash,
      input.systemPrompt,
      input.inputJson,
      input.outputSchemaJson,
      now,
      now,
    );
    return this.getById(input.id)!;
  }

  markRunning(id: string): void {
    query(
      `UPDATE bet_result_analyses
       SET status = 'provider_running', updated_at = ?
       WHERE id = ?`,
      new Date().toISOString(),
      id,
    );
  }

  complete(input: {
    id: string;
    status: 'valid' | 'invalid';
    provider?: string;
    model?: string;
    rawResponse: string;
    normalizedResponse?: BetResultAnalysisResponseV1;
    validationErrors: BetResultAnalysisValidationError[];
    latencyMs?: number;
  }): BetResultAnalysisArtifact {
    query(
      `UPDATE bet_result_analyses SET
        status = ?, provider = ?, model = ?, raw_response = ?, normalized_response_json = ?,
        validation_errors_json = ?, latency_ms = ?, updated_at = ?
       WHERE id = ?`,
      input.status,
      input.provider ?? null,
      input.model ?? null,
      input.rawResponse,
      input.normalizedResponse ? JSON.stringify(input.normalizedResponse) : null,
      JSON.stringify(input.validationErrors),
      input.latencyMs ?? null,
      new Date().toISOString(),
      input.id,
    );
    return this.getById(input.id)!;
  }

  fail(id: string, message: string): BetResultAnalysisArtifact {
    const validationErrors: BetResultAnalysisValidationError[] = [
      { code: 'PROVIDER_FAILED', path: '$', message: message.slice(0, 500) },
    ];
    query(
      `UPDATE bet_result_analyses
       SET status = 'failed', validation_errors_json = ?, updated_at = ?
       WHERE id = ?`,
      JSON.stringify(validationErrors),
      new Date().toISOString(),
      id,
    );
    return this.getById(id)!;
  }

  getById(id: string): BetResultAnalysisArtifact | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM bet_result_analyses WHERE id = ?`,
      id,
    );
    return row ? mapArtifact(row) : undefined;
  }

  getLatestByBetId(betId: string): BetResultAnalysisArtifact | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM bet_result_analyses
       WHERE bet_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`,
      betId,
    );
    return row ? mapArtifact(row) : undefined;
  }

  getLatestValidByBetId(betId: string): BetResultAnalysisArtifact | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM bet_result_analyses
       WHERE bet_id = ? AND status = 'valid'
       ORDER BY created_at DESC, rowid DESC
       LIMIT 1`,
      betId,
    );
    return row ? mapArtifact(row) : undefined;
  }
}
