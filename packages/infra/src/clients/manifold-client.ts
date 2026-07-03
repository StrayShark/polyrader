import { cacheGet, cacheSet } from '../cache/index.js';

export interface ManifoldMarketMatch {
  marketId: string;
  question: string;
  probability: number;
  url: string;
}

/**
 * Lightweight Manifold Markets search for community probability signals.
 * Public API — no auth required.
 */
export class ManifoldClient {
  private baseUrl = process.env.MANIFOLD_API_URL ?? 'https://api.manifold.markets';

  async searchMatchProbability(query: string): Promise<number | undefined> {
    const market = await this.findBestMarket(query);
    return market?.probability;
  }

  async findBestMarket(query: string): Promise<ManifoldMarketMatch | undefined> {
    const cacheKey = `manifold:search:${query.toLowerCase().slice(0, 120)}`;
    const cached = await cacheGet<ManifoldMarketMatch | null>(cacheKey);
    if (cached !== undefined) return cached ?? undefined;

    try {
      const params = new URLSearchParams({
        term: query,
        limit: '5',
        sort: 'score',
      });
      const response = await fetch(`${this.baseUrl}/v0/search-markets?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        await cacheSet(cacheKey, null, 300);
        return undefined;
      }

      const rows = await response.json() as Array<Record<string, unknown>>;
      const best = rows
        .map((row) => this.mapRow(row))
        .filter((row): row is ManifoldMarketMatch => row !== null)
        .sort((a, b) => b.probability - a.probability)[0];

      await cacheSet(cacheKey, best ?? null, 900);
      return best;
    } catch {
      await cacheSet(cacheKey, null, 300);
      return undefined;
    }
  }

  private mapRow(row: Record<string, unknown>): ManifoldMarketMatch | null {
    const probability = Number(row.probability ?? row.prob);
    if (!Number.isFinite(probability)) return null;
    const question = String(row.question ?? row.text ?? '').trim();
    if (!question) return null;
    const id = String(row.id ?? '');
    if (!id) return null;
    return {
      marketId: id,
      question,
      probability: clamp(probability, 0.01, 0.99),
      url: String(row.url ?? `https://manifold.markets/${row.creatorUsername ?? 'market'}/${row.slug ?? id}`),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
