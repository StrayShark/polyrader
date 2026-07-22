import { randomUUID } from 'crypto';
import { query, queryOne, transaction } from '../connection';
import type { NormalizedMatchFacts } from '@polyrader/core';

export class FactRepository {
  upsertNormalizedMatch(facts: NormalizedMatchFacts): NormalizedMatchFacts {
    transaction(() => {
      query(
        `INSERT INTO esports_fact_matches (
          id, game, external_match_id, event_id, event_name, starts_at, format, status,
          patch_version, map_pool_json, data_snapshot_hash, completeness, freshness_seconds,
          missing_json, conflict_flags_json, source_precedence_json, adapter_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(game, external_match_id) DO UPDATE SET
          event_id = excluded.event_id,
          event_name = excluded.event_name,
          starts_at = excluded.starts_at,
          format = excluded.format,
          status = excluded.status,
          patch_version = excluded.patch_version,
          map_pool_json = excluded.map_pool_json,
          data_snapshot_hash = excluded.data_snapshot_hash,
          completeness = excluded.completeness,
          freshness_seconds = excluded.freshness_seconds,
          missing_json = excluded.missing_json,
          conflict_flags_json = excluded.conflict_flags_json,
          source_precedence_json = excluded.source_precedence_json,
          adapter_version = excluded.adapter_version,
          updated_at = datetime('now')`,
        facts.id,
        facts.game,
        facts.externalMatchId,
        facts.eventId ?? null,
        facts.eventName,
        facts.startsAt,
        facts.format,
        facts.status,
        facts.patchVersion ?? null,
        JSON.stringify(facts.mapPool),
        facts.dataSnapshotHash,
        facts.completeness,
        Number.isFinite(facts.freshnessSeconds) ? facts.freshnessSeconds : null,
        JSON.stringify(facts.missing),
        JSON.stringify(facts.conflictFlags),
        JSON.stringify(facts.sourceLinks),
        facts.adapterVersion,
      );

      const matchId = this.resolveId(facts.game, facts.externalMatchId) ?? facts.id;
      query(`DELETE FROM esports_fact_participants WHERE match_fact_id = ?`, matchId);
      query(`DELETE FROM esports_fact_players WHERE match_fact_id = ?`, matchId);
      query(`DELETE FROM esports_fact_links WHERE match_fact_id = ?`, matchId);
      query(`DELETE FROM esports_fact_atoms WHERE match_fact_id = ?`, matchId);

      for (const participant of facts.participants) {
        query(
          `INSERT INTO esports_fact_participants (
            id, match_fact_id, participant_id, side, name, rating, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          `fp-${randomUUID()}`,
          matchId,
          participant.participantId,
          participant.side,
          participant.name,
          participant.rating ?? null,
          participant.source,
        );
      }

      for (const player of facts.players) {
        query(
          `INSERT INTO esports_fact_players (
            id, match_fact_id, participant_id, player_id, display_name, position, is_starter, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `fpl-${randomUUID()}`,
          matchId,
          player.participantId,
          player.playerId,
          player.displayName,
          player.position ?? null,
          player.isStarter ? 1 : 0,
          player.source,
        );
      }

      for (const link of facts.sourceLinks) {
        query(
          `INSERT INTO esports_fact_links (
            id, match_fact_id, source, entity_type, external_id, precedence, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          `fl-${randomUUID()}`,
          matchId,
          link.source,
          link.entityType,
          link.externalId,
          link.precedence,
          link.observedAt,
        );
      }

      for (const atom of facts.facts) {
        query(
          `INSERT INTO esports_fact_atoms (
            id, match_fact_id, fact_id, entity_type, source, field, value_json, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `fa-${randomUUID()}`,
          matchId,
          atom.factId,
          atom.entityType,
          atom.source,
          atom.field,
          JSON.stringify(atom.value),
          atom.observedAt,
        );
      }
    });

    return this.getByGameExternalId(facts.game, facts.externalMatchId) ?? facts;
  }

  getByGameExternalId(game: string, externalMatchId: string): NormalizedMatchFacts | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM esports_fact_matches WHERE game = ? AND external_match_id = ?`,
      game,
      externalMatchId,
    );
    if (!row) return undefined;
    return this.mapMatch(row);
  }

  listByGame(game: string, limit = 20): NormalizedMatchFacts[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM esports_fact_matches
       WHERE game = ?
       ORDER BY
         CASE
           WHEN status IN ('scheduled', 'upcoming', 'pre_match') AND datetime(starts_at) >= datetime('now') THEN 0
           ELSE 1
         END ASC,
         CASE
           WHEN status IN ('scheduled', 'upcoming', 'pre_match') AND datetime(starts_at) >= datetime('now') THEN datetime(starts_at)
         END ASC,
         datetime(starts_at) DESC
       LIMIT ?`,
      game,
      limit,
    ).map((row) => this.mapMatch(row));
  }

  private resolveId(game: string, externalMatchId: string): string | undefined {
    const row = queryOne<{ id: string }>(
      `SELECT id FROM esports_fact_matches WHERE game = ? AND external_match_id = ?`,
      game,
      externalMatchId,
    );
    return row?.id;
  }

  private mapMatch(row: Record<string, unknown>): NormalizedMatchFacts {
    const matchFactId = String(row.id);
    const participants = query<Record<string, unknown>>(
      `SELECT * FROM esports_fact_participants WHERE match_fact_id = ?`,
      matchFactId,
    ).map((item) => ({
      participantId: String(item.participant_id),
      side: String(item.side) as 'a' | 'b',
      name: String(item.name),
      rating: item.rating != null ? Number(item.rating) : undefined,
      source: String(item.source ?? ''),
    }));
    const players = query<Record<string, unknown>>(
      `SELECT * FROM esports_fact_players WHERE match_fact_id = ?`,
      matchFactId,
    ).map((item) => ({
      participantId: String(item.participant_id),
      playerId: String(item.player_id),
      displayName: String(item.display_name),
      position: item.position != null ? String(item.position) : undefined,
      isStarter: Number(item.is_starter) === 1,
      source: String(item.source ?? ''),
    }));
    const sourceLinks = query<Record<string, unknown>>(
      `SELECT * FROM esports_fact_links WHERE match_fact_id = ?`,
      matchFactId,
    ).map((item) => ({
      source: String(item.source),
      entityType: String(item.entity_type),
      externalId: String(item.external_id),
      precedence: Number(item.precedence),
      observedAt: String(item.observed_at),
    }));
    const facts = query<Record<string, unknown>>(
      `SELECT * FROM esports_fact_atoms WHERE match_fact_id = ?`,
      matchFactId,
    ).map((item) => ({
      factId: String(item.fact_id),
      entityType: String(item.entity_type),
      source: String(item.source),
      observedAt: String(item.observed_at),
      field: String(item.field),
      value: JSON.parse(String(item.value_json ?? 'null')),
    }));

    return {
      id: matchFactId,
      game: String(row.game) as NormalizedMatchFacts['game'],
      externalMatchId: String(row.external_match_id),
      eventId: row.event_id != null ? String(row.event_id) : undefined,
      eventName: String(row.event_name ?? ''),
      startsAt: String(row.starts_at),
      format: String(row.format) as NormalizedMatchFacts['format'],
      status: String(row.status ?? 'scheduled'),
      patchVersion: row.patch_version != null ? String(row.patch_version) : undefined,
      mapPool: JSON.parse(String(row.map_pool_json ?? '[]')),
      participants,
      players,
      sourceLinks,
      facts,
      missing: JSON.parse(String(row.missing_json ?? '[]')),
      conflictFlags: JSON.parse(String(row.conflict_flags_json ?? '[]')),
      completeness: Number(row.completeness) || 0,
      freshnessSeconds:
        row.freshness_seconds != null ? Number(row.freshness_seconds) : Number.POSITIVE_INFINITY,
      dataSnapshotHash: String(row.data_snapshot_hash),
      adapterVersion: String(row.adapter_version ?? `${String(row.game)}.facts.v1`),
    };
  }
}
