import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERVER_PORT = Number(process.env.POLYRADER_E2E_SERVER_PORT ?? 13101);
const WEB_PORT = Number(process.env.POLYRADER_E2E_WEB_PORT ?? 15174);
const API_BASE = `http://127.0.0.1:${SERVER_PORT}`;
const integrationDb =
  process.env.POLYRADER_E2E_DATABASE_URL ??
  join(tmpdir(), `polyrader-e2e-integration-${process.pid}.db`);

process.env.POLYRADER_E2E_API_BASE = API_BASE;

export default defineConfig({
  testDir: './e2e-integration',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
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
      command: 'npm run dev --workspace=@polyrader/server',
      url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        NODE_ENV: 'test',
        POLYRADER_SKIP_CRON: '1',
        POLYRADER_SKIP_STREAM: '1',
        POLYRADER_SKIP_EXTERNAL_HEALTH: '1',
        CS2_SIMBOOK_ENABLE_MARKET_ORDERS: 'true',
        DATABASE_URL: integrationDb,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'e2e-integration-test-key',
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        POLYRADER_API_PROXY_TARGET: API_BASE,
        POLYRADER_WS_PROXY_TARGET: `ws://127.0.0.1:${SERVER_PORT}`,
      },
    },
  ],
});
