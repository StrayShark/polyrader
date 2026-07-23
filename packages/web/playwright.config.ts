import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.PLAYWRIGHT_PORT ?? '15175';
const baseURL = `http://127.0.0.1:${port}`;
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '13180';
const apiBase = `http://127.0.0.1:${apiPort}`;
const browserDb =
  process.env.PLAYWRIGHT_DATABASE_URL ?? join(tmpdir(), `polyrader-e2e-browser-${process.pid}.db`);

export default defineConfig({
  testDir: './e2e-browser',
  // Single worker to avoid race conditions on shared dev server
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
  timeout: 60_000,
  expect: {
    threshold: 0.2,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev --workspace=@polyrader/server -- --port=${apiPort}`,
      url: `${apiBase}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        POLYRADER_SKIP_CRON: '1',
        POLYRADER_SKIP_STREAM: '1',
        POLYRADER_SKIP_EXTERNAL_HEALTH: '1',
        POLYRADER_SKIP_EXTERNAL_MARKETS: '1',
        CS2_SIMBOOK_ENABLE_POLYMARKET_ACCOUNT: 'false',
        POLYMARKET_ACCOUNT_ENABLED: 'false',
        POLYMARKET_LIVE_TRADING_ENABLED: 'false',
        DATABASE_URL: browserDb,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'e2e-browser-test-key',
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        POLYRADER_API_PROXY_TARGET: apiBase,
        POLYRADER_WS_PROXY_TARGET: `ws://127.0.0.1:${apiPort}`,
      },
    },
  ],
});
