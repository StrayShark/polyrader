import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:3001';

test.describe('Integration — whale follow API', () => {
  const address = '0x1234567890123456789012345678901234567890';

  test('follow wallet and read copy config via real SQLite', async ({ request }) => {
    const followRes = await request.post(`${API}/api/whale-follow`, {
      data: { address, alertsEnabled: true, autoCopyEnabled: false },
    });
    expect(followRes.status()).toBe(201);

    const listRes = await request.get(`${API}/api/whale-follow`);
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json() as { data: Array<{ address: string }> };
    expect(list.data.some((w) => w.address === address.toLowerCase())).toBe(true);

    const configRes = await request.get(`${API}/api/whale-follow/config`);
    expect(configRes.ok()).toBeTruthy();
    const config = await configRes.json() as { data: { mode: string; enabled: boolean } };
    expect(config.data.mode).toBe('paper');
  });

  test('GET /api/whale-follow/trading-status reflects credential state', async ({ request }) => {
    const res = await request.get(`${API}/api/whale-follow/trading-status`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { data: { liveEnabled: boolean; canPlaceOrders: boolean } };
    expect(typeof body.data.liveEnabled).toBe('boolean');
    expect(typeof body.data.canPlaceOrders).toBe('boolean');
  });

  test('GET /api/whale-follow/trades/summary returns PnL aggregate', async ({ request }) => {
    const res = await request.get(`${API}/api/whale-follow/trades/summary`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { data: { totalPnl: number; settled: number; wins: number; losses: number } };
    expect(typeof body.data.totalPnl).toBe('number');
    expect(typeof body.data.settled).toBe('number');
    expect(typeof body.data.wins).toBe('number');
    expect(typeof body.data.losses).toBe('number');
  });
});
