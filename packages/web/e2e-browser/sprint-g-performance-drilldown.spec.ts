import { expect, test } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Sprint G performance attribution drilldown', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.addInitScript(() => localStorage.setItem('polyrader-locale', 'zh'));
  });

  test('opens a segment and navigates to its canonical paper order', async ({ page }) => {
    await page.goto('/#/bankroll?section=performance');
    await expect(page.getByText('按数据质量归因')).toBeVisible();
    await expect(page.getByText('按置信度归因')).toBeVisible();
    await expect(page.getByText('按 Edge 档位归因')).toBeVisible();

    const segment = page.getByTestId('performance-segment-game-cs2');
    await segment.getByRole('button', { name: '展开或收起订单明细' }).click();
    const detail = page.getByTestId('performance-drilldown-game-cs2');
    await expect(detail.getByText('sim-bet-1')).toBeVisible();
    await detail.getByRole('link', { name: /查看订单/ }).click();

    await expect(page).toHaveURL(/#\/bankroll\?section=orders&betId=sim-bet-1$/);
    await expect(page.getByTestId('focused-paper-order')).toContainText('sim-bet-1');
    await expect(page.getByTestId('paper-order-sim-bet-1')).toBeVisible();
  });
});
