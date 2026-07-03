import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:3001';

test.describe('Integration — market orders API', () => {
  test('GET /api/market-orders/status returns trading capability', async ({ request }) => {
    const res = await request.get(`${API}/api/market-orders/status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { data: { liveEnabled: boolean; canPlaceOrders: boolean; message?: string } };
    expect(typeof body.data.liveEnabled).toBe('boolean');
    expect(typeof body.data.canPlaceOrders).toBe('boolean');
  });

  test('POST /api/market-orders rejects when live credentials missing', async ({ request }) => {
    const res = await request.post(`${API}/api/market-orders`, {
      data: {
        slug: 'spirit-vs-g2-bo3',
        side: 'buy',
        team: 'team_a',
        amountUsd: 10,
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
