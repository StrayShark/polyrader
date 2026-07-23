import type { EsportsGame, Market } from '@polyrader/core';
import { fetchJsonWithBrowser } from '../../crawlers/browser-fetch.js';

const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';

/**
 * Fetch JSON from Gamma API via headless Chromium.
 *
 * Direct Node.js fetch is blocked by SNI-based DPI filtering in this
 * environment (TLS handshake gets Connection Reset). Chromium's BoringSSL
 * stack bypasses this, so all Gamma API calls route through Playwright.
 */
async function gammaFetch<T>(url: string): Promise<T> {
  return fetchJsonWithBrowser<T>(url, { timeoutMs: envNumber('POLYMARKET_GAMMA_TIMEOUT_MS', 8000) });
}

export class PolymarketGammaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? GAMMA_API_URL;
  }

  async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return gammaFetch<T>(url.toString());
  }

  /**
   * Get active CS2 markets.
   * Polymarket Gamma API does not support tag=cs2 filtering (CS2 markets
   * have empty tags arrays). Instead, we fetch active markets sorted by
   * volume and filter by "Counter-Strike" in the question text.
   */
  async getMarkets(limit = 50, offset = 0): Promise<Market[]> {
    const isCs2 = (item: unknown): boolean => {
      const m = item as Record<string, unknown>;
      const q = String(m.question ?? '').toLowerCase();
      return q.startsWith('counter-strike') || q.includes('cs2') || q.includes('csgo');
    };

    // Paginate through active markets to find all CS2 markets.
    // Gamma API caps at 500 per request; CS2 markets are often buried
    // among thousands of non-CS2 markets sorted by volume.
    const pageSize = 500;
    const maxPages = 5; // up to 2500 markets scanned
    let cs2Markets: Market[] = [];

    // 1) Paginate active markets
    for (let page = 0; page < maxPages; page++) {
      const currentOffset = offset + page * pageSize;
      let batch: unknown[];
      try {
        batch = await this.fetch<unknown[]>('/markets', {
          limit: String(pageSize),
          offset: String(currentOffset),
          active: 'true',
          closed: 'false',
          order: 'volume24hr',
          ascending: 'false',
        });
      } catch { break; }
      if (!batch || batch.length === 0) break;

      const cs2Batch = batch
        .filter((item) => isCs2(item) && this.isTradableMarket(item as Record<string, unknown>))
        .map((item) => this.mapMarket(item as Record<string, unknown>));
      cs2Markets = cs2Markets.concat(cs2Batch);

      // Stop early if we have enough and this page had no CS2 markets
      if (cs2Markets.length >= limit && cs2Batch.length === 0 && page > 0) break;
      if (batch.length < pageSize) break; // last page
    }

    return cs2Markets.slice(0, limit);
  }

  /** Scan public Gamma markets for an esports title without requiring account credentials. */
  async getMarketsForGame(
    game: EsportsGame,
    limit = 50,
    offset = 0,
  ): Promise<Market[]> {
    if (game === 'cs2') return this.getMarkets(limit, offset);
    const errors: string[] = [];
    const volumeRanked = await this.scanVolumeRankedMarkets(game, limit, offset, errors);
    const searched =
      volumeRanked.length >= limit ? [] : await this.searchGameMarkets(game, limit, errors);
    const merged = dedupeMarkets([...volumeRanked, ...searched]);
    if (merged.length === 0 && errors.length > 0) {
      throw new Error(`Gamma ${game} fetch failed: ${errors.slice(0, 3).join(' | ')}`);
    }
    return merged.slice(0, limit);
  }

  private async scanVolumeRankedMarkets(
    game: Exclude<EsportsGame, 'cs2'>,
    limit: number,
    offset: number,
    errors: string[],
  ): Promise<Market[]> {
    const pageSize = 500;
    const maxPages = 8;
    const matches: Market[] = [];
    for (let page = 0; page < maxPages; page++) {
      let batch: unknown[];
      try {
        batch = await this.fetch<unknown[]>('/markets', {
          limit: String(pageSize),
          offset: String(offset + page * pageSize),
          active: 'true',
          closed: 'false',
          order: 'volume24hr',
          ascending: 'false',
        });
      } catch (error) {
        errors.push(`markets@${page}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      if (!batch?.length) break;
      const gameBatch = batch
        .filter(
          (item) =>
            marketMatchesGame(item as Record<string, unknown>, game) &&
            this.isTradableMarket(item as Record<string, unknown>),
        )
        .map((item) => this.mapMarket(item as Record<string, unknown>));
      matches.push(...gameBatch);
      if (matches.length >= limit) break;
      if (batch.length < pageSize) break;
    }
    return matches;
  }

  /** Full-text search fallback when low-volume LoL/Valorant markets never appear in volume pages. */
  private async searchGameMarkets(
    game: Exclude<EsportsGame, 'cs2'>,
    limit: number,
    errors: string[],
  ): Promise<Market[]> {
    const queries =
      game === 'dota2'
        ? ['dota 2', 'dota2']
        : game === 'lol'
          ? ['league of legends', 'lck', 'lpl', 'lec']
          : ['valorant', 'vct'];
    const matches: Market[] = [];
    for (const query of queries) {
      if (matches.length >= limit) break;
      let payload: unknown;
      try {
        payload = await this.fetch<unknown>('/public-search', {
          q: query,
          limit_per_type: String(Math.min(25, limit)),
        });
      } catch (error) {
        errors.push(`search:${query}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      for (const item of extractSearchMarkets(payload)) {
        if (!marketMatchesGame(item, game) || !this.isTradableMarket(item)) continue;
        matches.push(this.mapMarket(item));
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  /**
   * Get a single market by condition ID.
   */
  async getMarket(conditionId: string): Promise<Market | null> {
    try {
      const data = await this.fetch<Record<string, unknown>>(`/markets/${conditionId}`);
      return this.mapMarket(data);
    } catch {
      return null;
    }
  }

  /**
   * Get market price history.
   */
  async getPriceHistory(
    conditionId: string,
    interval: '1h' | '6h' | '1d' = '1h',
  ): Promise<Array<{ timestamp: string; price: number }>> {
    const data = await this.fetch<unknown[]>(
      `/markets/${conditionId}/prices-history`,
      { interval },
    );
    return data.map((p: unknown) => {
      const item = p as Record<string, unknown>;
      return {
        timestamp: String(item.t ?? ''),
        price: parseFloat(String(item.p ?? '0')),
      };
    });
  }

  /**
   * Search CS2 markets by keyword.
   */
  async searchMarkets(query: string, limit = 20): Promise<Market[]> {
    const fetchLimit = Math.min(limit * 5, 200);
    const data = await this.fetch<unknown[]>('/markets', {
      limit: String(fetchLimit),
      active: 'true',
      closed: 'false',
      order: 'volume24hr',
      ascending: 'false',
    });

    const q = query.toLowerCase();
    return data
      .filter((item: unknown) => {
        const m = item as Record<string, unknown>;
        const question = String(m.question ?? '').toLowerCase();
        const isCs2 = question.startsWith('counter-strike') || question.includes('cs2') || question.includes('csgo');
        return isCs2 && question.includes(q);
      })
      .map((item: unknown) => this.mapMarket(item as Record<string, unknown>))
      .slice(0, limit);
  }

  private mapMarket(data: Record<string, unknown>): Market {
    let outcomePrices: string[] = [];
    if (data.outcomePrices) {
      try { outcomePrices = JSON.parse(String(data.outcomePrices)); } catch { /* malformed */ }
    } else if (Array.isArray(data.outcomes)) {
      outcomePrices = (data.outcomes as string[]).map(() => '0.5');
    } else {
      outcomePrices = ['0.5', '0.5'];
    }

    let outcomes: string[] = [];
    if (Array.isArray(data.outcomes)) {
      outcomes = data.outcomes as string[];
    } else {
      try { outcomes = JSON.parse(String(data.outcomes ?? '[]')); } catch { /* malformed */ }
    }

    const resolvedOutcome = data.resolvedOutcome === null || data.resolvedOutcome === undefined
      ? undefined
      : String(data.resolvedOutcome);
    const resolvedPrice = data.resolvedPrice === null || data.resolvedPrice === undefined
      ? undefined
      : parseFloat(String(data.resolvedPrice));

    return {
      conditionId: String(data.id ?? data.conditionId ?? ''),
      slug: String(data.slug ?? ''),
      question: String(data.question ?? ''),
      description: String(data.description ?? ''),
      outcomes,
      outcomePrices,
      clobTokenIds: Array.isArray(data.clobTokenIds) ? data.clobTokenIds as string[] : undefined,
      volume: parseFloat(String(data.volume ?? '0')),
      volume24h: parseFloat(String(data.volume24hr ?? data.volume24h ?? '0')),
      liquidity: parseFloat(String(data.liquidity ?? '0')),
      endDate: String(data.endDate ?? data.end_date_iso ?? ''),
      startDate: String(data.startDate ?? data.start_date_iso ?? ''),
      status: resolvedOutcome !== undefined || resolvedPrice !== undefined ? 'resolved' : data.closed ? 'closed' : 'active',
      tags: Array.isArray(data.tags) ? data.tags as string[] : [],
      resolvedOutcome,
      resolvedPrice: Number.isFinite(resolvedPrice) ? resolvedPrice : undefined,
    };
  }

  private isTradableMarket(data: Record<string, unknown>): boolean {
    const closed = data.closed === true || String(data.closed ?? '').toLowerCase() === 'true';
    const active = data.active === undefined || String(data.active).toLowerCase() !== 'false';
    const resolved = data.resolvedOutcome !== null && data.resolvedOutcome !== undefined
      || data.resolvedPrice !== null && data.resolvedPrice !== undefined;
    if (!active || closed || resolved) return false;

    const endDate = String(data.endDate ?? data.end_date_iso ?? '');
    if (!endDate) return true;
    const endMs = Date.parse(endDate);
    if (!Number.isFinite(endMs)) return true;

    return endMs >= Date.now() - 5 * 60 * 1000;
  }
}

function marketMatchesGame(data: Record<string, unknown>, game: Exclude<EsportsGame, 'cs2'>) {
  const text = [data.question, data.slug, data.description, ...(asStringArray(data.tags) ?? [])]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ');
  if (game === 'dota2') return /\bdota\s*2?\b|\bdpc\b/.test(text);
  if (game === 'lol') {
    return (
      /\bleague of legends\b|\bworlds\b|\blck\b|\blec\b|\blpl\b|\blcs\b|\bmsi\b/.test(text) ||
      /(^|\b)lol(\b|:)/.test(text)
    );
  }
  return /\bvalorant\b|\bvct\b|(^|\b)val(\b|:)/.test(text);
}

function extractSearchMarkets(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const buckets: unknown[] = [];
  for (const key of ['markets', 'Market', 'market']) {
    if (Array.isArray(root[key])) buckets.push(...(root[key] as unknown[]));
  }
  if (Array.isArray(root.events)) {
    for (const event of root.events as unknown[]) {
      if (!event || typeof event !== 'object') continue;
      const markets = (event as Record<string, unknown>).markets;
      if (Array.isArray(markets)) buckets.push(...markets);
    }
  }
  return buckets.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
  );
}

function dedupeMarkets(markets: Market[]): Market[] {
  const unique = new Map<string, Market>();
  for (const market of markets) {
    if (!unique.has(market.conditionId)) unique.set(market.conditionId, market);
  }
  return [...unique.values()];
}

function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? process.env.POLYRADER_EXTERNAL_TIMEOUT_MS);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30000, Math.max(250, value));
}
