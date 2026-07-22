import { checkDbConnection, getCacheStats, PolymarketClobClient, GridClient } from '@polyrader/infra';
import { sharedWhaleIngestion } from './services/whale-ingestion-service';
import { sharedPolymarketStream } from './services/polymarket-stream-service';
import { envNumber, withTimeout } from './utils/timeout';

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
      source?: string;
      lastWarning?: string;
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
      const gridOk = await withTimeout(
        new GridClient().testConnection(),
        healthProbeTimeoutMs(),
        'grid health probe',
      );
      gridStatus = gridOk ? 'ok' : 'error';
    } catch {
      gridStatus = 'error';
    }
  } else if (gridConfigured) {
    gridStatus = 'skipped';
  }

  // Local database + websocket determine whether the app itself is usable.
  // External data providers degrade live data quality but should not mark the local practice database as down.
  const coreError = dbResult.status === 'error' || wsInfo.status === 'error';
  const degraded =
    externalChecks.status !== 'ok' ||
    ingestionStatus !== 'ok' ||
    !['ok', 'skipped', 'idle'].includes(streamStatus) ||
    gridStatus === 'error';

  return {
    status: coreError ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
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
        source: ingestion.source ?? undefined,
        lastWarning: ingestion.lastWarning ?? undefined,
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
  // Check Polymarket Gamma API
  const gammaUrl = process.env.POLYMARKET_GAMMA_API_URL ?? 'https://gamma-api.polymarket.com';

  // Check Polymarket CLOB API
  const clobClient = new PolymarketClobClient();

  // Check Polygon RPC
  const polygonUrl = process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com';
  const [gammaCheck, clobProbe, polygonCheck] = await Promise.all([
    checkEndpoint('polymarket-gamma', `${gammaUrl}/markets?limit=1`),
    withTimeout(
      clobClient.probeReachability(),
      healthProbeTimeoutMs(),
      'polymarket clob health probe',
    ).catch((err) => ({ ok: false, message: (err as Error).message })),
    checkEndpoint('polygon-rpc', polygonUrl),
  ]);
  const checks = [
    gammaCheck,
    { name: 'polymarket-clob', status: clobProbe.ok ? 'ok' : 'error' },
    polygonCheck,
  ];

  const anyError = checks.some((c) => c.status === 'error');
  return { status: anyError ? 'degraded' : 'ok', checks };
}

async function checkEndpoint(name: string, url: string): Promise<{ name: string; status: string }> {
  const timeoutMs = healthProbeTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    return { name, status: 'ok' };
  } catch {
    return { name, status: 'error' };
  } finally {
    clearTimeout(timeout);
  }
}

function healthProbeTimeoutMs(): number {
  return envNumber('POLYRADER_HEALTH_PROBE_TIMEOUT_MS', envNumber('POLYRADER_EXTERNAL_TIMEOUT_MS', 2500, 250, 10000), 250, 10000);
}
