import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

/**
 * P1 UI audit fixes:
 * 1. Match detail — no duplicate practice surface
 * 2. CopyFollowPanel — design-system Input (not raw <input>)
 * 3. Sidebar and content titles — text-only navigation and headings
 * 4. Whales follow tab — onboarding guide when no followed wallets
 */
test.describe('P1 UI audit fixes', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('match detail uses one odds surface and no repeated mode notice', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.getByRole('tab', { name: /模拟|Practice/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Spirit \d/ })).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('follow tab shows onboarding guide when wallet list is empty', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    await expect(
      page.getByText(/如何开始关注跟单|Getting Started with Copy Follow/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/关注钱包|Follow Wallets/i).first()).toBeVisible();
    await expect(page.getByText(/配置跟单|Configure Copy/i).first()).toBeVisible();
    await expect(page.getByText(/接收信号|Receive Signals/i).first()).toBeVisible();
  });

  test('copy config uses design-system number inputs', async ({ page }) => {
    await page.goto('/#/whales');
    await waitForMainHeading(page);
    await page.getByRole('tab', { name: /关注跟单|Follow & Copy/i }).click();

    const spinbuttons = page.getByRole('spinbutton');
    await expect(spinbuttons).toHaveCount(10);
    expect(await page.locator('input:not([class*="flex"])').count()).toBe(0);
  });

  test('sidebar exposes only the consolidated text navigation', async ({ page }) => {
    await page.goto('/#/');
    await waitForMainHeading(page);

    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveCount(4);
    await expect(sidebar.getByRole('link', { name: /总览|Overview/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /模拟盘|Sim Trading/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /巨鲸追踪|Whale Tracking/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /日历|Calendar/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /设置|Settings/i })).toBeVisible();
  });

  test('content titles do not show decorative icons', async ({ page }) => {
    await page.goto('/#/');
    await waitForMainHeading(page);

    const titleIcons = page.locator(
      'main :is(h1, h2, h3) > svg, main svg:has(+ :is(h1, h2, h3)), main [data-slot="card-title"] > svg, main svg:has(+ [data-slot="card-title"])',
    );
    await expect(titleIcons).toHaveCount(0);

    await page.goto('/#/bankroll');
    await waitForMainHeading(page);
    await expect(page.getByTestId('account-workspace').locator(':scope > div:first-child svg')).toHaveCount(0);
  });
});
