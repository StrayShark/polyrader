import { checkDbConnection, getCacheStats, PolymarketClobClient, GridClient } from '@polyrader/infra';
import { sharedWhaleIngestion } from './services/whale-ingestion-service';
import { sharedPolymarketStream } from './services/polymarket-stream-service';

// Lazy reference to WebSocket server (set via setWsServer)
let wssRef: { clients: Set<unknown> } | null = null;

export function setWsServer(wss: { clients: Set<unknown> }): void {
  wssRef = wss;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: { status: string; latency?: number };
    cache: { status: string; size: number; maxSize: number };
    websocket: { status: string; connections: number };
    whaleIngestion: {
      status: string;
      consecutiveFailures: number;
      lastIngestedCount: number;
      lastScanAt?: string;
      lastSuccessAt?: string;
      lastError?: string;
    };
    priceStream: {
      status: string;
      connected: boolean;
      subscriptionCount: number;
      lastMessageAt?: string;
      lastError?: string;
    };
    grid: { status: string; configured: boolean };
    externalApis: { status: string; checks: Array<{ name: string; status: string }> };
  };
}

export async function checkHealth(): Promise<HealthStatus> {
  const dbResult = await checkDbHealth();

  const cacheStats = getCacheStats();

  const wsInfo = checkWebSocket();

  const externalChecks = process.env.POLYRADER_SKIP_EXTERNAL_HEALTH === '1'
    ? { status: 'ok', checks: [] as Array<{ name: string; status: string }> }
    : await checkExternalApis();
  const ingestion = sharedWhaleIngestion.getStatus();
  const ingestionStatus = ingestion.consecutiveFailures >= 3 ? 'error'
    : ingestion.consecutiveFailures > 0 ? 'degraded'
    : 'ok';
  const stream = sharedPolymarketStream.getStatus();
  const streamStatus = process.env.POLYRADER_SKIP_STREAM === '1'
    ? 'skipped'
    : stream.lastError && !stream.connected
      ? 'degraded'
      : stream.connected
        ? 'ok'
        : stream.subscriptionCount > 0
          ? 'degraded'
          : 'idle';

  const gridConfigured = Boolean(process.env.GRID_API_KEY);
  let gridStatus = gridConfigured ? 'unknown' : 'skipped';
  if (gridConfigured && process.env.POLYRADER_SKIP_EXTERNAL_HEALTH !== '1') {
    try {
      const gridOk = await new GridClient().testConnection();
      gridStatus = gridOk ? 'ok' : 'error';
    } catch {
      gridStatus = 'error';
    }
  } else if (gridConfigured) {
    gridStatus = 'skipped';
  }

  // Determine overall status
  const allOk = dbResult.status === 'ok' && wsInfo.status === 'ok'
    && externalChecks.status === 'ok' && ingestionStatus === 'ok'
    && (streamStatus === 'ok' || streamStatus === 'skipped' || streamStatus === 'idle')
    && (gridStatus === 'ok' || gridStatus === 'skipped');
  const hasError = dbResult.status === 'error' || ingestionStatus === 'error'
    || gridStatus === 'error';

  return {
    status: hasError ? 'unhealthy' : allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      database: dbResult,
      cache: { status: 'ok', ...cacheStats },
      websocket: wsInfo,
      whaleIngestion: {
        status: ingestionStatus,
        consecutiveFailures: ingestion.consecutiveFailures,
        lastIngestedCount: ingestion.lastIngestedCount,
        lastScanAt: ingestion.lastScanAt ?? undefined,
        lastSuccessAt: ingestion.lastSuccessAt ?? undefined,
        lastError: ingestion.lastError ?? undefined,
      },
      priceStream: {
        status: streamStatus,
        connected: stream.connected,
        subscriptionCount: stream.subscriptionCount,
        lastMessageAt: stream.lastMessageAt ?? undefined,
        lastError: stream.lastError ?? undefined,
      },
      grid: {
        status: gridStatus,
        configured: gridConfigured,
      },
      externalApis: externalChecks,
    },
  };
}

async function checkDbHealth(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    checkDbConnection();
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error' };
  }
}

function checkWebSocket(): { status: string; connections: number } {
  try {
    const connections = wssRef?.clients?.size ?? 0;
    return { status: 'ok', connections };
  } catch {
    return { status: 'error', connections: 0 };
  }
}

/**
 * Check external API reachability with a short timeout.
 * Only checks if the endpoint responds — does not validate response body.
 */
async function checkExternalApis(): Promise<{ status: string; checks: Array<{ name: string; status: string }> }> {
  const checks: Array<{ name: string; status: string }> = [];

  // Check Polymarket Gamma API
  const gammaUrl = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';
  checks.push(await checkEndpoint('polymarket-gamma', `${gammaUrl}/markets?limit=1`));

  // Check Polymarket CLOB API
  const clobClient = new PolymarketClobClient();
  const clobProbe = await clobClient.probeReachability();
  checks.push({ name: 'polymarket-clob', status: clobProbe.ok ? 'ok' : 'error' });

  // Check Polygon RPC
  const polygonUrl = process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com';
  checks.push(await checkEndpoint('polygon-rpc', polygonUrl));

  const anyError = checks.some((c) => c.status === 'error');
  return { status: anyError ? 'degraded' : 'ok', checks };
}

async function checkEndpoint(name: string, url: string): Promise<{ name: string; status: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { name, status: 'ok' };
  } catch {
    return { name, status: 'error' };
  }
}
