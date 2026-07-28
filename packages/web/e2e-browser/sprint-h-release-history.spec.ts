import { expect, test } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test('Sprint H renders persisted audit history, lifecycle, timings, and diagnostics export', async ({
  page,
}) => {
  await setupCommonMocks(page);
  await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  await page.goto('/#/validation-lab');

  await expect(page.getByTestId('release-audit-history')).toContainText('2396006');
  await expect(page.getByTestId('release-audit-history')).toContainText('1000ms');
  await expect(page.getByTestId('release-lifecycle')).toContainText('not_applicable');

  const download = page.waitForEvent('download');
  await page.getByTestId('export-release-diagnostics').click();
  expect((await download).suggestedFilename()).toMatch(/^polyrader-release-diagnostics-/);

  await page.getByTestId('validation-game-dota2').click();
  await page.getByTestId('run-release-audit').click();
  await expect(page.getByTestId('release-audit-result')).toContainText('source sync');
  await expect(page.getByTestId('release-audit-result')).toContainText('100ms');

  await page.getByTestId('run-current-source-smoke').click();
  const smoke = page.getByTestId('current-source-smoke-summary');
  await expect(smoke).toContainText(/真实源 Smoke|Current-source smoke/);
  await expect(smoke).toContainText('0/4');
  await expect(smoke).toContainText('current source market is missing');
});
