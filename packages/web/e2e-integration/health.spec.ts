import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:3001';

test.describe('Integration — real server health', () => {
  test('GET /api/health returns database and websocket status', async ({ request }) => {
    const response = await request.get(`${API}/api/health`);
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
