import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Bankroll page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('shows practice account summary and no real trading CTA', async ({ page }) => {
    await page.goto('/#/bankroll');

    await expect(page.getByRole('heading', { name: /我的账本|My Bankroll/ })).toBeVisible();
    await expect(page.getByText('初始本金').first()).toBeVisible();
    await expect(page.getByText('总权益').first()).toBeVisible();
    await expect(page.getByText('可用余额').first()).toBeVisible();
    await expect(page.getByText('今日盈亏').first()).toBeVisible();

    // Risk metrics
    await expect(page.getByText('未结算暴露').first()).toBeVisible();
    await expect(page.getByText('最大回撤').first()).toBeVisible();
    await expect(page.getByText('胜率').first()).toBeVisible();

    const body = page.locator('body');
    for (const keyword of ['实盘下单', 'Live bet', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(body).not.toContainText(keyword);
    }
  });

  test('switches equity curve granularity', async ({ page }) => {
    await page.goto('/#/bankroll');

    const weekTab = page.getByRole('tab', { name: /周|Week/ });
    await weekTab.click();
    await expect(weekTab).toHaveAttribute('aria-selected', 'true');

    const monthTab = page.getByRole('tab', { name: /月|Month/ });
    await monthTab.click();
    await expect(monthTab).toHaveAttribute('aria-selected', 'true');
  });
});
