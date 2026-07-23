import type {
  EsportsGame,
  EsportsMatchSourceIdentity,
  EsportsSourceEntityType,
  EsportsSourceSnapshot,
  EsportsSourceSyncResult,
  EsportsTeamAlias,
  EsportsTeamAliasStatus,
} from '@polyrader/core';
import { query, queryOne, transaction } from '../connection';

export class EsportsSourceRepository {
  upsertSnapshots(snapshots: EsportsSourceSnapshot[]): number {
    if (snapshots.length === 0) return 0;
    transaction(() => {
      for (const snapshot of snapshots) {
        query(
          `INSERT INTO esports_source_snapshots
            (game, source, entity_type, external_id, name, starts_at, status, payload, observed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(game, source, entity_type, external_id) DO UPDATE SET
             name = excluded.name,
             starts_at = excluded.starts_at,
             status = excluded.status,
             payload = excluded.payload,
             observed_at = excluded.observed_at,
             updated_at = datetime('now')`,
          snapshot.game,
          snapshot.source,
          snapshot.entityType,
          snapshot.externalId,
          snapshot.name,
          snapshot.startsAt ?? null,
          snapshot.status ?? '',
          JSON.stringify(snapshot.payload),
          snapshot.observedAt,
        );
      }
    });
    return snapshots.length;
  }

  listSnapshots(game: EsportsGame, options: { entityType?: EsportsSourceEntityType; limit?: number } = {}): EsportsSourceSnapshot[] {
    const limit = clamp(options.limit ?? 50, 1, 200);
    const rows = options.entityType
      ? query<Record<string, unknown>>(
        `SELECT * FROM esports_source_snapshots
         WHERE game = ? AND entity_type = ?
         ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        options.entityType,
        limit,
      )
      : query<Record<string, unknown>>(
        `SELECT * FROM esports_source_snapshots
         WHERE game = ? ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        limit,
      );
    return rows.map(mapSnapshot);
  }

  recordSyncRun(result: EsportsSourceSyncResult): void {
    query(
      `INSERT INTO esports_source_sync_runs
        (game, status, records, sources, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      result.game,
      result.status,
      result.records,
      JSON.stringify(result.sources),
      result.startedAt,
      result.finishedAt,
    );
  }

  getLatestSyncRun(game: EsportsGame): EsportsSourceSyncResult | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM esports_source_sync_runs WHERE game = ? ORDER BY finished_at DESC, id DESC LIMIT 1`,
      game,
    );
    if (!row) return null;
    return {
      game,
      status: String(row.status) as EsportsSourceSyncResult['status'],
      records: Number(row.records) || 0,
      sources: parseJsonArray<EsportsSourceSyncResult['sources'][number]>(row.sources),
      startedAt: String(row.started_at),
      finishedAt: String(row.finished_at),
    };
  }

  upsertMatchIdentities(identities: EsportsMatchSourceIdentity[]): number {
    if (identities.length === 0) return 0;
    transaction(() => {
      for (const identity of identities) {
        query(
          `INSERT INTO esports_match_source_identities
            (game, canonical_match_id, scope, source, external_id,
             parent_canonical_match_id, event_id, team_a_id, team_b_id,
             starts_at, confidence, observed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(game, source, external_id) DO UPDATE SET
             canonical_match_id = excluded.canonical_match_id,
             scope = excluded.scope,
             parent_canonical_match_id = excluded.parent_canonical_match_id,
             event_id = excluded.event_id,
             team_a_id = excluded.team_a_id,
             team_b_id = excluded.team_b_id,
             starts_at = excluded.starts_at,
             confidence = excluded.confidence,
             observed_at = excluded.observed_at,
             updated_at = datetime('now')`,
          identity.game,
          identity.canonicalMatchId,
          identity.scope,
          identity.source,
          identity.externalId,
          identity.parentCanonicalMatchId ?? null,
          identity.eventId ?? null,
          identity.teamAId ?? null,
          identity.teamBId ?? null,
          identity.startsAt ?? null,
          identity.confidence,
          identity.observedAt,
        );
      }
    });
    return identities.length;
  }

  listMatchIdentities(
    game: EsportsGame,
    options: { canonicalMatchId?: string; limit?: number } = {},
  ): EsportsMatchSourceIdentity[] {
    const limit = clamp(options.limit ?? 50, 1, 200);
    const rows = options.canonicalMatchId
      ? query<Record<string, unknown>>(
        `SELECT * FROM esports_match_source_identities
         WHERE game = ? AND (canonical_match_id = ? OR parent_canonical_match_id = ?)
         ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        options.canonicalMatchId,
        options.canonicalMatchId,
        limit,
      )
      : query<Record<string, unknown>>(
        `SELECT * FROM esports_match_source_identities
         WHERE game = ? ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        limit,
      );
    return rows.map(mapMatchIdentity);
  }

  countMatchIdentities(game: EsportsGame): number {
    const row = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM esports_match_source_identities WHERE game = ?',
      game,
    );
    return Number(row?.count) || 0;
  }

  upsertTeamAliases(aliases: EsportsTeamAlias[]): number {
    if (aliases.length === 0) return 0;
    transaction(() => {
      for (const alias of aliases) {
        query(
          `INSERT INTO esports_team_aliases
            (game, source, source_team_id, alias, normalized_alias,
             canonical_team_id, target_source, target_team_id, status, method,
             confidence, candidate_team_ids, evidence, observed_at, confirmed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(game, source, source_team_id, normalized_alias) DO UPDATE SET
             alias = excluded.alias,
             canonical_team_id = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.canonical_team_id
               ELSE excluded.canonical_team_id
             END,
             target_source = excluded.target_source,
             target_team_id = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.target_team_id
               ELSE excluded.target_team_id
             END,
             status = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.status
               ELSE excluded.status
             END,
             method = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.method
               ELSE excluded.method
             END,
             confidence = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.confidence
               ELSE excluded.confidence
             END,
             candidate_team_ids = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.candidate_team_ids
               ELSE excluded.candidate_team_ids
             END,
             evidence = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.evidence
               ELSE excluded.evidence
             END,
             observed_at = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.observed_at
               ELSE excluded.observed_at
             END,
             confirmed_at = CASE
               WHEN esports_team_aliases.method = 'manual_review' AND excluded.method != 'manual_review'
                 THEN esports_team_aliases.confirmed_at
               ELSE excluded.confirmed_at
             END,
             updated_at = datetime('now')`,
          alias.game,
          alias.source,
          alias.sourceTeamId ?? '',
          alias.alias,
          alias.normalizedAlias,
          alias.canonicalTeamId ?? null,
          alias.targetSource,
          alias.targetTeamId ?? null,
          alias.status,
          alias.method,
          alias.confidence,
          JSON.stringify(alias.candidateTeamIds),
          JSON.stringify(alias.evidence),
          alias.observedAt,
          alias.confirmedAt ?? null,
        );
      }
    });
    return aliases.length;
  }

  listTeamAliases(
    game: EsportsGame,
    options: {
      status?: EsportsTeamAliasStatus;
      normalizedAlias?: string;
      limit?: number;
    } = {},
  ): EsportsTeamAlias[] {
    const limit = clamp(options.limit ?? 100, 1, 500);
    const clauses = ['game = ?'];
    const params: unknown[] = [game];
    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }
    if (options.normalizedAlias) {
      clauses.push('normalized_alias = ?');
      params.push(options.normalizedAlias);
    }
    params.push(limit);
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM esports_team_aliases
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE status
         WHEN 'conflict' THEN 0
         WHEN 'unmatched' THEN 1
         WHEN 'candidate' THEN 2
         WHEN 'confirmed' THEN 3
         ELSE 4
       END, observed_at DESC, id DESC
       LIMIT ?`,
      ...params,
    );
    return rows.map(mapTeamAlias);
  }
}

function mapSnapshot(row: Record<string, unknown>): EsportsSourceSnapshot {
  return {
    id: Number(row.id),
    game: String(row.game) as EsportsGame,
    source: String(row.source) as EsportsSourceSnapshot['source'],
    entityType: String(row.entity_type) as EsportsSourceEntityType,
    externalId: String(row.external_id),
    name: String(row.name ?? ''),
    startsAt: row.starts_at ? String(row.starts_at) : undefined,
    status: row.status ? String(row.status) : undefined,
    payload: parseJsonObject(row.payload),
    observedAt: String(row.observed_at),
  };
}

function mapMatchIdentity(row: Record<string, unknown>): EsportsMatchSourceIdentity {
  return {
    id: Number(row.id),
    game: String(row.game) as EsportsGame,
    canonicalMatchId: String(row.canonical_match_id),
    scope: String(row.scope) as EsportsMatchSourceIdentity['scope'],
    source: String(row.source) as EsportsMatchSourceIdentity['source'],
    externalId: String(row.external_id),
    parentCanonicalMatchId: row.parent_canonical_match_id
      ? String(row.parent_canonical_match_id)
      : undefined,
    eventId: row.event_id ? String(row.event_id) : undefined,
    teamAId: row.team_a_id ? String(row.team_a_id) : undefined,
    teamBId: row.team_b_id ? String(row.team_b_id) : undefined,
    startsAt: row.starts_at ? String(row.starts_at) : undefined,
    confidence: Number(row.confidence),
    observedAt: String(row.observed_at),
  };
}

function mapTeamAlias(row: Record<string, unknown>): EsportsTeamAlias {
  return {
    id: Number(row.id),
    game: String(row.game) as EsportsGame,
    source: String(row.source) as EsportsTeamAlias['source'],
    sourceTeamId: row.source_team_id ? String(row.source_team_id) : undefined,
    alias: String(row.alias),
    normalizedAlias: String(row.normalized_alias),
    canonicalTeamId: row.canonical_team_id ? String(row.canonical_team_id) : undefined,
    targetSource: String(row.target_source) as EsportsTeamAlias['targetSource'],
    targetTeamId: row.target_team_id ? String(row.target_team_id) : undefined,
    status: String(row.status) as EsportsTeamAlias['status'],
    method: String(row.method),
    confidence: Number(row.confidence),
    candidateTeamIds: parseJsonArray<string>(row.candidate_team_ids),
    evidence: parseJsonObject(row.evidence),
    observedAt: String(row.observed_at),
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
