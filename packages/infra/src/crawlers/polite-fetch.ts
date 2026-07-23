const DEFAULT_USER_AGENT =
  'PolyRader/0.3 local-data-client (set POLYRADER_CRAWLER_USER_AGENT with contact details)';

interface CacheEntry {
  body: string;
  expiresAt: number;
  etag?: string;
  lastModified?: string;
}

export interface PoliteFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  minIntervalMs?: number;
  cacheTtlMs?: number;
  maxRetries?: number;
  userAgent?: string;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const cache = new Map<string, CacheEntry>();
const nextRequestAt = new Map<string, number>();

export async function fetchTextPolitely(
  url: string,
  options: PoliteFetchOptions = {},
): Promise<string> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const fetcher = options.fetcher ?? fetch;
  const minIntervalMs = options.minIntervalMs ?? envNumber('POLYRADER_CRAWLER_MIN_INTERVAL_MS', 3000, 0, 60_000);
  const cacheTtlMs = options.cacheTtlMs ?? envNumber('POLYRADER_CRAWLER_CACHE_TTL_MS', 15 * 60_000, 0, 24 * 60 * 60_000);
  const timeoutMs = options.timeoutMs ?? envNumber('POLYRADER_CRAWLER_TIMEOUT_MS', 20_000, 500, 120_000);
  const maxRetries = options.maxRetries ?? envNumber('POLYRADER_CRAWLER_MAX_RETRIES', 2, 0, 5);
  const cached = cache.get(url);

  if (cached && cached.expiresAt > now()) return cached.body;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await reserveOriginSlot(url, minIntervalMs, now, sleep);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': options.userAgent ?? process.env.POLYRADER_CRAWLER_USER_AGENT ?? DEFAULT_USER_AGENT,
          ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}),
          ...(cached?.lastModified ? { 'If-Modified-Since': cached.lastModified } : {}),
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (response.status === 304 && cached) {
        cache.set(url, { ...cached, expiresAt: now() + cacheTtlMs });
        return cached.body;
      }
      if (response.ok) {
        const body = await response.text();
        cache.set(url, {
          body,
          expiresAt: now() + cacheTtlMs,
          etag: response.headers.get('etag') ?? undefined,
          lastModified: response.headers.get('last-modified') ?? undefined,
        });
        return body;
      }

      const detail = (await response.text().catch(() => '')).slice(0, 180);
      const error = new Error(
        `HTTP ${response.status} from ${new URL(url).host}${detail ? `: ${detail}` : ''}`,
      );
      if (!isRetryableStatus(response.status) || attempt === maxRetries) throw error;
      await sleep(retryDelayMs(response.headers.get('retry-after'), attempt));
      lastError = error;
    } catch (error) {
      const normalized = normalizeFetchError(error, url);
      if (isNonRetryableHttpError(normalized) || attempt === maxRetries) throw normalized;
      lastError = normalized;
      await sleep(retryDelayMs(null, attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`Unable to fetch ${url}`);
}

export function clearPoliteFetchState(): void {
  cache.clear();
  nextRequestAt.clear();
}

async function reserveOriginSlot(
  url: string,
  minIntervalMs: number,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  if (minIntervalMs <= 0) return;
  const origin = new URL(url).origin;
  const current = now();
  const reservedAt = Math.max(current, nextRequestAt.get(origin) ?? current);
  nextRequestAt.set(origin, reservedAt + minIntervalMs);
  if (reservedAt > current) await sleep(reservedAt - current);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(0, seconds * 1000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(30_000, Math.max(0, date - Date.now()));
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function normalizeFetchError(error: unknown, url: string): Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(`Request timed out for ${url}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function isNonRetryableHttpError(error: Error): boolean {
  const status = Number(error.message.match(/HTTP (\d{3})\b/)?.[1]);
  return status >= 400 && status < 500 && status !== 429;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
