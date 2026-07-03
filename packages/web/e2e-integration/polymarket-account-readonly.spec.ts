import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3001';
const enabled = process.env.POLYMARKET_ACCOUNT_E2E === '1';

test.describe('Integration — Polymarket account read-only', () => {
  test.skip(!enabled, 'Set POLYMARKET_ACCOUNT_E2E=1 to run read-only Polymarket account checks');

  test('connects account and returns historical stats without placing orders', async ({ request }) => {
    const response = await request.get(`${API}/api/polymarket/account`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const overview = body.data;

    expect(overview.status.hasAddress).toBe(true);
    expect(overview.status.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(overview.status.hasApiCredentials).toBe(true);
    expect(overview.status.canReadPrivate).toBe(true);

    expect(typeof overview.stats.tradeCount).toBe('number');
    expect(typeof overview.stats.tradedVolume).toBe('number');
    expect(typeof overview.stats.winRate).toBe('number');
    expect(typeof overview.stats.totalPnl).toBe('number');
    expect(Array.isArray(overview.equityCurve)).toBe(true);
    expect(Array.isArray(overview.trades)).toBe(true);

    const successfulChecks = overview.diagnostics.filter((item: { ok: boolean }) => item.ok);
    expect(successfulChecks.length, JSON.stringify(overview.diagnostics, null, 2)).toBeGreaterThan(0);
  });
});
