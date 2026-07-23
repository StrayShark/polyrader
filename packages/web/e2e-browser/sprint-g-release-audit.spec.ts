import { expect, test } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test('Sprint G release audit shows an explicit blocker instead of running on practice data', async ({
  page,
}) => {
  await setupCommonMocks(page);
  await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  await page.goto('/#/validation-lab');

  await page.getByTestId('validation-game-dota2').click();
  await page.getByTestId('run-release-audit').click();

  const result = page.getByTestId('release-audit-result');
  await expect(result).toContainText('skipped');
  await expect(result).toContainText('market alignment must pass');
  await expect(result).toContainText('fixture_ready');
});
