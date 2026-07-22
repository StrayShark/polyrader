import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, waitForMainHeading } from './fixtures/theme';

test.describe('Data backup panel', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await setTheme(page, 'dark');
  });

  test('shows backup export/import in local database settings', async ({ page }) => {
    await page.goto('/#/settings?section=database');
    await waitForMainHeading(page);

    await expect(page.getByRole('heading', { name: /本地数据库|Local Database/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /导出备份|Export Backup/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /导入备份|Import Backup/i })).toBeVisible();
    await expect(page.getByText('polyrader.db', { exact: true })).toBeVisible();
  });
});
