interface RiotClientOptions {
  apiKey?: string;
  lolRoute?: string;
  valorantRoute?: string;
  timeoutMs?: number;
  dataDragonUrl?: string;
}

export interface RiotLolPatch {
  version: string;
  sourceUrl: string;
}

export interface RiotValorantContent {
  version: string;
  characters: unknown[];
  maps: unknown[];
  acts: unknown[];
  raw: Record<string, unknown>;
}

export class RiotClient {
  private readonly apiKey: string;
  private readonly lolRoute: string;
  private readonly valorantRoute: string;
  private readonly timeoutMs: number;
  private readonly dataDragonUrl: string;

  constructor(options: RiotClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.RIOT_API_KEY ?? '';
    this.lolRoute = options.lolRoute ?? process.env.RIOT_LOL_PLATFORM_ROUTE ?? 'euw1';
    this.valorantRoute = options.valorantRoute ?? process.env.RIOT_VALORANT_ROUTE ?? 'eu';
    this.timeoutMs = options.timeoutMs ?? envNumber('RIOT_API_TIMEOUT_MS', 10_000, 500, 30_000);
    this.dataDragonUrl = (options.dataDragonUrl ?? process.env.RIOT_DATA_DRAGON_URL ?? 'https://ddragon.leagueoflegends.com').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async getLatestLolPatch(): Promise<RiotLolPatch> {
    const versions = await this.fetchJson<unknown>(`${this.dataDragonUrl}/api/versions.json`, false);
    if (!Array.isArray(versions) || typeof versions[0] !== 'string') {
      throw new Error('Riot Data Dragon returned an invalid versions payload');
    }
    return {
      version: versions[0],
      sourceUrl: `${this.dataDragonUrl}/cdn/${versions[0]}/data/en_US/champion.json`,
    };
  }

  async getLolPlatformStatus(): Promise<Record<string, unknown>> {
    return this.fetchJson<Record<string, unknown>>(
      `https://${this.lolRoute}.api.riotgames.com/lol/status/v4/platform-data`,
      true,
    );
  }

  async getValorantContent(locale = 'en-US'): Promise<RiotValorantContent> {
    const raw = await this.fetchJson<Record<string, unknown>>(
      `https://${this.valorantRoute}.api.riotgames.com/val/content/v1/contents?locale=${encodeURIComponent(locale)}`,
      true,
    );
    return {
      version: String(raw.version ?? ''),
      characters: arrayValue(raw.characters),
      maps: arrayValue(raw.maps),
      acts: arrayValue(raw.acts),
      raw,
    };
  }

  private async fetchJson<T>(url: string, requiresKey: boolean): Promise<T> {
    if (requiresKey && !this.apiKey) throw new Error('RIOT_API_KEY not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(requiresKey ? { 'X-Riot-Token': this.apiKey } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Riot API HTTP ${response.status}: ${text.slice(0, 160)}`);
      }
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
