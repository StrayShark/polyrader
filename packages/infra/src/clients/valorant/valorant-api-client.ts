import { fetchTextPolitely } from '../../crawlers/polite-fetch';

export interface ValorantPublicContent {
  version: string;
  manifestId: string;
  characters: Array<Record<string, unknown>>;
  maps: Array<Record<string, unknown>>;
  sourceUrl: string;
}

interface ValorantApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
  cacheTtlMs?: number;
}

export class ValorantApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly minIntervalMs: number;
  private readonly cacheTtlMs: number;

  constructor(options: ValorantApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.VALORANT_API_URL ?? 'https://valorant-api.com').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? envNumber('VALORANT_API_TIMEOUT_MS', 10_000, 500, 30_000);
    this.minIntervalMs = options.minIntervalMs ?? envNumber('VALORANT_API_MIN_INTERVAL_MS', 500, 0, 10_000);
    this.cacheTtlMs = options.cacheTtlMs ?? envNumber('VALORANT_API_CACHE_TTL_MS', 6 * 60 * 60_000, 0, 24 * 60 * 60_000);
  }

  async getContent(): Promise<ValorantPublicContent> {
    const [version, characters, maps] = await Promise.all([
      this.get('/v1/version'),
      this.get('/v1/agents?isPlayableCharacter=true'),
      this.get('/v1/maps'),
    ]);
    const versionData = recordValue(version.data);
    return {
      version: String(versionData.version ?? versionData.riotClientVersion ?? ''),
      manifestId: String(versionData.manifestId ?? ''),
      characters: recordArray(characters.data),
      maps: recordArray(maps.data),
      sourceUrl: this.baseUrl,
    };
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const text = await fetchTextPolitely(`${this.baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      timeoutMs: this.timeoutMs,
      minIntervalMs: this.minIntervalMs,
      cacheTtlMs: this.cacheTtlMs,
    });
    const payload = JSON.parse(text) as Record<string, unknown>;
    if (Number(payload.status) !== 200) {
      throw new Error(`Valorant API returned status ${String(payload.status ?? 'unknown')}`);
    }
    return payload;
  }
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
