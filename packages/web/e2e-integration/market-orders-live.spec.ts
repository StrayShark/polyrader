import { test, expect } from '@playwright/test';

const API = process.env.POLYRADER_E2E_API_BASE ?? 'http://127.0.0.1:13101';
const hasLiveCreds = Boolean(
  process.env.POLYMARKET_PRIVATE_KEY
  && process.env.POLYMARKET_API_KEY
  && process.env.POLYMARKET_API_SECRET
  && process.env.POLYMARKET_API_PASSPHRASE,
);

test.describe('Live — Polymarket trading smoke', () => {
  test.skip(!hasLiveCreds, 'Requires POLYMARKET_PRIVATE_KEY and L2 API credentials');

  test('GET /api/market-orders/status reports live trading ready', async ({ request }) => {
    const res = await request.get(`${API}/api/market-orders/status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { data: { liveEnabled: boolean; canPlaceOrders: boolean; message?: string } };
    expect(body.data.liveEnabled).toBe(true);
    expect(body.data.canPlaceOrders).toBe(true);
    expect(body.data.message ?? '').toBe('');
  });

  test('GET /api/whale-follow/trading-status matches market order capability', async ({ request }) => {
    const res = await request.get(`${API}/api/whale-follow/trading-status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { data: { liveEnabled: boolean; canPlaceOrders: boolean } };
    expect(body.data.canPlaceOrders).toBe(true);
  });
});
