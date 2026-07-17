import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Global search + notification center', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
    await page.goto('/#/');
    await page.getByTestId('app-sidebar').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('Cmd+K opens the command palette and lists pages', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await expect(dialog).toBeVisible();

    // Default (empty query) shows page quick-jumps.
    await expect(dialog.getByText('页面')).toBeVisible();

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('search filters and navigates to a page', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await expect(dialog).toBeVisible();

    await page.locator('input[placeholder="搜索市场、战队、地址…"]').fill('赛事');
    const esports = dialog.getByText('赛事分析').first();
    await expect(esports).toBeVisible();
    await esports.click();

    await expect(dialog).toBeHidden();
    await page.waitForURL('**/#/esports**', { timeout: 10000 });
  });

  test('header search button opens the palette', async ({ page }) => {
    await page.getByRole('button', { name: '全局搜索' }).first().click();
    await expect(page.getByRole('dialog', { name: '全局搜索' })).toBeVisible();
  });

  test('notification bell opens an (empty) notification center', async ({ page }) => {
    await page.getByRole('button', { name: '通知中心' }).click();
    await expect(page.getByText('暂无通知')).toBeVisible();
  });
});
