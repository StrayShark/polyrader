import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Database page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);

    await page.route('**/api/backup/export', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: {
          'Content-Disposition': 'attachment; filename="polyrader-backup-2026-07-06.db"',
        },
        body: '',
      }),
    );
  });

  test('shows database info and table counts', async ({ page }) => {
    await page.goto('/#/database');

    await expect(page.getByRole('heading', { name: /本地数据库|Local Database/ })).toBeVisible();
    await expect(page.getByText('polyrader.db')).toBeVisible();
    await expect(page.getByText('1.00 MB').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'markets' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'matches' })).toBeVisible();
    await expect(page.getByText(/表数据预览|Table Data Preview/)).toBeVisible();
    await expect(page.getByText('Counter-Strike: Spirit vs G2')).toBeVisible();
  });

  test('exports backup on button click', async ({ page }) => {
    await page.goto('/#/database');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /导出备份|Export Backup/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/polyrader-backup-.*\.db/);
  });

  test('has no real trading CTA', async ({ page }) => {
    await page.goto('/#/database');
    const main = page.locator('main');
    for (const keyword of ['实盘下单', '真实限价单', 'Deposit', 'market-orders']) {
      await expect(main).not.toContainText(keyword);
    }
  });
});
