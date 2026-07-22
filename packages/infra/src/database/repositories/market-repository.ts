import { query, queryOne } from '../connection';
import { parsePolymarketMatch, type Market, type MatchInfo } from '@polyrader/core';

export class MarketRepository {
  findAll(limit = 50, offset = 0): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE question LIKE '%Counter-Strike%' OR question LIKE '%CS2%' OR question LIKE '%CSGO%' ORDER BY volume_24h DESC LIMIT ? OFFSET ?`,
      limit,
      offset,
    );
    return rows.map((row) => this.mapRow(row));
  }

  findByConditionId(conditionId: string): Market | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM markets WHERE condition_id = ?`,
      conditionId,
    );
    return row ? this.mapRow(row) : null;
  }

  findBySlug(slug: string): Market | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM markets WHERE slug = ?`,
      slug,
    );
    return row ? this.mapRow(row) : null;
  }

  findByCanonicalMatchId(canonicalMatchId: string): Market[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE canonical_match_id = ? ORDER BY volume_24h DESC`,
      canonicalMatchId,
    ).map((row) => this.mapRow(row));
  }

  findByTag(tag: string, limit = 50): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE tags LIKE ? ORDER BY volume_24h DESC LIMIT ?`,
      `%${tag}%`,
      limit,
    );
    return rows.map((row) => this.mapRow(row));
  }

  upsert(market: Market): void {
    query(
      `INSERT INTO markets (condition_id, canonical_match_id, slug, question, description, outcomes, outcome_prices, clob_token_ids, volume, volume_24h, liquidity, end_date, start_date, status, tags, match_info, resolved_outcome, resolved_price, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(condition_id) DO UPDATE SET
         canonical_match_id = COALESCE(excluded.canonical_match_id, markets.canonical_match_id),
         question = excluded.question,
         slug = excluded.slug,
         outcomes = excluded.outcomes,
         outcome_prices = excluded.outcome_prices,
         end_date = excluded.end_date,
         start_date = excluded.start_date,
         tags = excluded.tags,
         clob_token_ids = excluded.clob_token_ids,
         volume = excluded.volume,
         volume_24h = excluded.volume_24h,
         liquidity = excluded.liquidity,
         status = excluded.status,
         match_info = excluded.match_info,
         resolved_outcome = excluded.resolved_outcome,
         resolved_price = excluded.resolved_price,
         updated_at = datetime('now')`,
      market.conditionId,
      market.canonicalMatchId ?? market.match?.canonicalMatchId ?? null,
      market.slug,
      market.question,
      market.description,
      JSON.stringify(market.outcomes),
      JSON.stringify(market.outcomePrices),
      JSON.stringify(market.clobTokenIds ?? []),
      market.volume,
      market.volume24h,
      market.liquidity,
      market.endDate,
      market.startDate,
      market.status,
      JSON.stringify(market.tags),
      market.match ? JSON.stringify(market.match) : null,
      market.resolvedOutcome ?? null,
      market.resolvedPrice ?? null,
    );
  }

  getActiveMarkets(): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE status = 'active' ORDER BY volume_24h DESC`,
    );
    return rows.map((row) => this.mapRow(row));
  }

  findResolvedMarkets(limit = 10000): Market[] {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets
       WHERE resolved_outcome IS NOT NULL
         AND TRIM(resolved_outcome) != ''
         AND clob_token_ids IS NOT NULL
         AND clob_token_ids != '[]'
       ORDER BY updated_at DESC
       LIMIT ?`,
      limit,
    );
    return rows.map((row) => this.mapRow(row));
  }

  findByTokenId(tokenId: string): Market | null {
    const rows = query<Record<string, unknown>>(
      `SELECT * FROM markets WHERE clob_token_ids LIKE ? LIMIT 1`,
      `%${tokenId}%`,
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  isCs2Market(question: string | undefined): boolean {
    if (!question) return false;
    return isCs2Text(question);
  }

  isCs2MarketRecord(market: Market | null | undefined): boolean {
    if (!market) return false;
    if (market.match) return true;
    const text = [
      market.question,
      market.slug,
      market.description,
      ...(market.tags ?? []),
    ].filter(Boolean).join(' ');
    return isCs2Text(text);
  }

  getMarketVolumeUsd(market: Market | null | undefined): number {
    if (!market) return 0;
    const vol24h = Number(market.volume24h);
    if (Number.isFinite(vol24h) && vol24h > 0) return vol24h;
    const vol = Number(market.volume);
    return Number.isFinite(vol) && vol > 0 ? vol : 0;
  }

  insertPriceHistory(conditionId: string, price: number): void {
    query(
      `INSERT INTO price_history (condition_id, price) VALUES (?, ?)`,
      conditionId,
      price,
    );
  }

  insertPriceHistoryIfChanged(conditionId: string, price: number, epsilon = 0.0001): boolean {
    const latest = queryOne<{ price: number }>(
      `SELECT price FROM price_history WHERE condition_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1`,
      conditionId,
    );
    if (latest && Math.abs(Number(latest.price) - price) < epsilon) return false;
    this.insertPriceHistory(conditionId, price);
    return true;
  }

  resolveLocalMarkets(canonicalMatchId: string, winnerSelection: string): Market[] {
    const markets = this.findByCanonicalMatchId(canonicalMatchId)
      .filter((market) => market.tags.includes('local-sim') && isSeriesWinnerMarket(market));
    const normalizedWinner = normalizeSelection(winnerSelection);
    const resolved: Market[] = [];
    for (const market of markets) {
      const winnerIndex = market.outcomes.findIndex((outcome) => normalizeSelection(outcome) === normalizedWinner);
      if (winnerIndex < 0) continue;
      const next: Market = {
        ...market,
        outcomePrices: market.outcomes.map((_outcome, index) => index === winnerIndex ? '1.00' : '0.00'),
        status: 'resolved',
        resolvedOutcome: market.outcomes[winnerIndex],
        resolvedPrice: 1,
      };
      this.upsert(next);
      this.insertPriceHistoryIfChanged(next.conditionId, winnerIndex === 0 ? 1 : 0);
      resolved.push(next);
    }
    return resolved;
  }

  /** Resolve local map-winner markets from structured per-map winners. */
  resolveLocalMapMarkets(
    canonicalMatchId: string,
    maps: Array<{ mapNumber: number; winnerTeamName: string }>,
  ): Market[] {
    const byMap = new Map(maps.map((map) => [map.mapNumber, map.winnerTeamName]));
    const markets = this.findByCanonicalMatchId(canonicalMatchId)
      .filter((market) => market.tags.includes('local-sim') && isMapWinnerMarket(market));
    const resolved: Market[] = [];
    for (const market of markets) {
      const mapNumber = parsePolymarketMatch(market.question)?.mapNumber;
      if (!mapNumber) continue;
      const winnerSelection = byMap.get(mapNumber);
      if (!winnerSelection) continue;
      const normalizedWinner = normalizeSelection(winnerSelection);
      const winnerIndex = market.outcomes.findIndex((outcome) => normalizeSelection(outcome) === normalizedWinner);
      if (winnerIndex < 0) continue;
      const next: Market = {
        ...market,
        outcomePrices: market.outcomes.map((_outcome, index) => index === winnerIndex ? '1.00' : '0.00'),
        status: 'resolved',
        resolvedOutcome: market.outcomes[winnerIndex],
        resolvedPrice: 1,
      };
      this.upsert(next);
      this.insertPriceHistoryIfChanged(next.conditionId, winnerIndex === 0 ? 1 : 0);
      resolved.push(next);
    }
    return resolved;
  }

  closeLocalMarkets(canonicalMatchId: string): Market[] {
    const markets = this.findByCanonicalMatchId(canonicalMatchId)
      .filter((market) => market.tags.includes('local-sim'));
    for (const market of markets) this.upsert({ ...market, status: 'closed' });
    return markets;
  }

  alignLocalMarketsWithMatch(match: MatchInfo): Market[] {
    if (!match.canonicalMatchId) return [];
    const candidates = this.findByCanonicalMatchId(match.canonicalMatchId);
    const direct = this.findByConditionId(match.matchId);
    if (direct && !candidates.some((market) => market.conditionId === direct.conditionId)) candidates.push(direct);
    const aligned: Market[] = [];
    for (const market of candidates) {
      if (!market.tags.includes('local-sim') || !isSeriesWinnerMarket(market)) continue;
      const next: Market = {
        ...market,
        canonicalMatchId: match.canonicalMatchId,
        question: `Counter-Strike: ${match.teamA.name} vs ${match.teamB.name} (${match.format}) - ${match.eventName}`,
        outcomes: [match.teamA.name, match.teamB.name],
        match: { ...match, canonicalMatchId: match.canonicalMatchId },
      };
      this.upsert(next);
      aligned.push(next);
    }
    return aligned;
  }

  getPriceHistory(conditionId: string, limit = 100): Array<{ timestamp: string; price: number }> {
    return query<{ timestamp: string; price: number }>(
      `SELECT timestamp, price FROM price_history WHERE condition_id = ? ORDER BY timestamp DESC LIMIT ?`,
      conditionId,
      limit,
    );
  }

  private parseJson(val: unknown): unknown {
    if (typeof val === 'string') {
      try { return JSON.parse(val) as unknown; } catch { return null; }
    }
    if (typeof val === 'object' && val !== null) {
      return val;
    }
    return null;
  }

  private mapRow(row: Record<string, unknown>): Market {
    return {
      conditionId: row.condition_id as string,
      canonicalMatchId: row.canonical_match_id ? String(row.canonical_match_id) : undefined,
      slug: row.slug as string,
      question: row.question as string,
      description: row.description as string,
      outcomes: (this.parseJson(row.outcomes) as string[]) ?? [],
      outcomePrices: (this.parseJson(row.outcome_prices) as string[]) ?? [],
      clobTokenIds: (this.parseJson(row.clob_token_ids) as string[]) ?? undefined,
      volume: row.volume as number,
      volume24h: row.volume_24h as number,
      liquidity: row.liquidity as number,
      endDate: row.end_date as string,
      startDate: row.start_date as string,
      status: row.status as Market['status'],
      tags: (this.parseJson(row.tags) as string[]) ?? [],
      match: row.match_info ? this.parseJson(row.match_info) as MatchInfo | undefined : undefined,
      resolvedOutcome: row.resolved_outcome ? String(row.resolved_outcome) : undefined,
      resolvedPrice: row.resolved_price === null || row.resolved_price === undefined ? undefined : Number(row.resolved_price),
    };
  }
}

function normalizeSelection(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isSeriesWinnerMarket(market: Market): boolean {
  const parsed = parsePolymarketMatch(market.question);
  return !!parsed && !parsed.isMapMarket
    && !/\b(handicap|spread|total|rounds?|correct\s+score|scoreline|pistol|map\s*\d+)\b/i.test(market.question);
}

function isMapWinnerMarket(market: Market): boolean {
  if (market.tags.includes('map-winner')) return true;
  return Boolean(parsePolymarketMatch(market.question)?.isMapMarket);
}

function isCs2Text(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('counter-strike')
    || normalized.includes('cs2')
    || normalized.includes('csgo')
    || normalized.includes('cs 2')
  );
}
