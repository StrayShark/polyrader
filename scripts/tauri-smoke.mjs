import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const port = Number(process.env.TAURI_SIDECAR_PORT ?? 13001);
const base = `http://127.0.0.1:${port}/api`;
const updaterSigningConfigured = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);

async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSidecar() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await get('/health');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError ?? new Error(`Tauri sidecar did not become ready on ${port}`);
}

const health = await waitForSidecar();
const [bankroll, performance, releaseReport, backup] = await Promise.all([
  get('/sim/bankroll'),
  get('/performance/summary'),
  get('/validation-lab/release-report'),
  get('/backup/info'),
]);

if (!Array.isArray(releaseReport.data?.boards) || releaseReport.data.boards.length !== 4) {
  throw new Error('Expected four release-gate boards');
}
if (!bankroll.data?.account?.id) throw new Error('Tauri bankroll account is unavailable');
if (typeof performance.data?.settledCount !== 'number') {
  throw new Error('Tauri performance summary is unavailable');
}

const result = {
  generatedAt: new Date().toISOString(),
  sidecarPort: port,
  health: health.status,
  updaterSigningConfigured,
  buildLabel: updaterSigningConfigured ? 'signed-release' : 'unsigned-local-debug',
  database: {
    filename: backup.data?.dbPath,
    fileSize: backup.data?.fileSize,
    tableCount: Object.keys(backup.data?.tableCounts ?? {}).length,
    migrationCount: backup.data?.schema?.migrationCount,
    latestMigration: backup.data?.schema?.latestMigration,
  },
  accountId: bankroll.data.account.id,
  equity: bankroll.data.account.currentBankroll,
  openExposure: bankroll.data.account.openExposure,
  settledCount: performance.data.settledCount,
  openCount: performance.data.openCount,
  releaseReady: releaseReport.data.releaseReady,
  releaseStatus: Object.fromEntries(
    releaseReport.data.boards.map((gate) => [gate.game, gate.status]),
  ),
};

if (typeof backup.data?.schema?.migrationCount !== 'number') {
  throw new Error('Tauri database migration diagnostics are unavailable');
}

const output = `${JSON.stringify(result, null, 2)}\n`;
if (process.env.TAURI_SMOKE_OUTPUT) {
  await mkdir(dirname(process.env.TAURI_SMOKE_OUTPUT), { recursive: true });
  await writeFile(process.env.TAURI_SMOKE_OUTPUT, output, 'utf8');
}

process.stdout.write(output);
