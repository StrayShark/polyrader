import { test, expect } from '@playwright/test';

const API = process.env.POLYRADER_E2E_API_BASE ?? 'http://127.0.0.1:13101';

test.describe('Integration — real server health', () => {
  test('GET /api/health returns database and websocket status', async ({ request }) => {
    const startedAt = Date.now();
    const response = await request.get(`${API}/api/health`, { timeout: 10_000 });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
    expect(response.ok()).toBeTruthy();

    const body = await response.json() as {
      status: string;
      dependencies: {
        database: { status: string };
        websocket: { status: string };
        whaleIngestion: { status: string };
      };
    };

    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(body.dependencies.database.status).toBe('ok');
    expect(body.dependencies.websocket.status).toBe('ok');
    expect(body.dependencies.whaleIngestion).toBeDefined();
  });
});
