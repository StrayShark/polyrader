import { randomUUID } from 'crypto';
import { query, queryOne } from '../connection';
import type { BetReview } from '@polyrader/core';

function mapReview(row: Record<string, unknown>): BetReview {
  return {
    id: String(row.id),
    betId: String(row.bet_id),
    errorTags: JSON.parse(String(row.error_tags ?? '[]')),
    note: row.note ? String(row.note) : undefined,
    brierScore: row.brier_score ? Number(row.brier_score) : undefined,
    closingLineValue: row.closing_line_value ? Number(row.closing_line_value) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface CreateBetReviewInput {
  betId: string;
  errorTags?: string[];
  note?: string;
  brierScore?: number;
  closingLineValue?: number;
}

export class BetReviewRepository {
  getById(id: string): BetReview | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM bet_reviews WHERE id = ?`, id);
    return row ? mapReview(row) : undefined;
  }

  getByBetId(betId: string): BetReview | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM bet_reviews WHERE bet_id = ?`, betId);
    return row ? mapReview(row) : undefined;
  }

  create(input: CreateBetReviewInput): BetReview {
    const now = new Date().toISOString();
    const review: BetReview = {
      id: `brev-${randomUUID()}`,
      betId: input.betId,
      errorTags: input.errorTags ?? [],
      note: input.note,
      brierScore: input.brierScore,
      closingLineValue: input.closingLineValue,
      createdAt: now,
      updatedAt: now,
    };

    query(
      `INSERT INTO bet_reviews (
        id, bet_id, error_tags, note, brier_score, closing_line_value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      review.id,
      review.betId,
      JSON.stringify(review.errorTags),
      review.note ?? null,
      review.brierScore ?? null,
      review.closingLineValue ?? null,
      review.createdAt,
      review.updatedAt,
    );

    return review;
  }

  update(betId: string, input: Partial<CreateBetReviewInput>): BetReview {
    const current = this.getByBetId(betId);
    if (!current) throw new Error(`BetReview for bet ${betId} not found`);

    const updated: BetReview = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    query(
      `UPDATE bet_reviews SET
        error_tags = ?,
        note = ?,
        brier_score = ?,
        closing_line_value = ?,
        updated_at = ?
      WHERE bet_id = ?`,
      JSON.stringify(updated.errorTags),
      updated.note ?? null,
      updated.brierScore ?? null,
      updated.closingLineValue ?? null,
      updated.updatedAt,
      betId,
    );

    return updated;
  }
}
