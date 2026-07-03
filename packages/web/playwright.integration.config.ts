import { defineConfig, devices } from '@playwright/test';

const SERVER_PORT = 3001;
const WEB_PORT = 5174;
const integrationDb = 'data/e2e-integration-test.db';

export default defineConfig({
  testDir: './e2e-integration',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
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
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        NODE_ENV: 'test',
        POLYRADER_SKIP_CRON: '1',
        POLYRADER_SKIP_STREAM: '1',
        POLYRADER_SKIP_EXTERNAL_HEALTH: '1',
        DATABASE_URL: integrationDb,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'e2e-integration-test-key',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
