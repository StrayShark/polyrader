import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows practice risk, data health, and advanced access state', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(page.getByRole('heading', { name: /设置|Settings/ })).toBeVisible();
    await expect(page.getByText('练习账户与风险纪律', { exact: true })).toBeVisible();
    await expect(page.getByText('数据源健康', { exact: true })).toBeVisible();
    await expect(page.getByText(/Polymarket 只读账户|Polymarket Read-only Account/)).toBeVisible();
    await expect(page.getByText(/CS2_SIMBOOK_ENABLE_POLYMARKET_ACCOUNT/)).toBeVisible();
  });

  test('saves risk configuration to sim account endpoint', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByLabel(/账户名称|Account Name/).fill('Training Desk');
    await page.getByLabel(/单笔风险上限|Max Single Risk/).fill('3');

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes('/api/sim/account/default') && req.method() === 'PUT',
    );
    await page.getByRole('button', { name: /保存|Save/ }).click();

    const request = await requestPromise;
    const body = request.postDataJSON();
    expect(body.name).toBe('Training Desk');
    expect(body.maxSingleRiskPct).toBeCloseTo(0.03);
  });

  test('has no direct market order action', async ({ page }) => {
    await page.goto('/#/settings');
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: /实盘下单|Live bet|真实限价单/ })).toHaveCount(0);
  });
});
