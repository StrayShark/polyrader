import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';

const viewports = [
  { name: 'narrow', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const surfaces = [
  { name: 'validation', url: '/#/validation-lab', testId: 'validation-lab-page' },
  { name: 'report', url: '/#/analysis/report', testId: 'analysis-report-page' },
  { name: 'orders', url: '/#/bankroll?section=orders', testId: 'paper-orders-page' },
  { name: 'performance', url: '/#/bankroll?section=performance', testId: 'performance-page' },
];

async function prepare(page: Page): Promise<void> {
  await blockWs(page);
  await setupCommonMocks(page);
  await page.addInitScript(() => {
    localStorage.setItem('polyrader-locale', 'zh');
    localStorage.setItem('polyrader-theme', 'dark');
  });
}

async function assertLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    loadFailed: document.body.innerText.includes('Load failed'),
    clippedControls: [...document.querySelectorAll('button, select, input')]
      .filter((element) => {
        const node = element as HTMLElement;
        return node.offsetParent !== null && node.scrollWidth > node.clientWidth + 2;
      })
      .map((element) => (element as HTMLElement).innerText || element.getAttribute('aria-label'))
      .filter(Boolean)
      .slice(0, 10),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.loadFailed).toBe(false);
  expect(layout.clippedControls).toEqual([]);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`sprint-f-${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('Sprint F responsive release matrix', () => {
  for (const viewport of viewports) {
    for (const surface of surfaces) {
      test(`${surface.name} @ ${viewport.width}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await prepare(page);
        await page.goto(surface.url);
        await expect(page.getByTestId(surface.testId)).toBeVisible();
        if (surface.name === 'performance') {
          await expect(page.getByText(/已结算样本少于 10/)).toBeVisible();
        }
        if (surface.name === 'validation') {
          await expect(page.getByTestId('release-gate-summary')).toBeVisible();
        }
        await assertLayout(page);
        await attachScreenshot(page, testInfo, `${viewport.name}-${surface.name}`);
      });
    }
  }

  test('validation error state @ 390', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.route('**/api/validation-lab/boards', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Source unavailable"}',
      }),
    );
    await page.goto('/#/validation-lab');
    await expect(page.getByText('Source unavailable')).toBeVisible();
    await assertLayout(page);
    await attachScreenshot(page, testInfo, 'narrow-validation-error');
  });

  test('orders empty state @ 390', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    await page.route('**/api/sim/bets**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    );
    await page.goto('/#/bankroll?section=orders');
    await expect(page.getByTestId('paper-orders-page')).toBeVisible();
    await assertLayout(page);
    await attachScreenshot(page, testInfo, 'narrow-orders-empty');
  });

  test('performance loading state @ 390', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);

    let resumeRequest!: () => void;
    const pendingRequest = new Promise<void>((resolve) => {
      resumeRequest = resolve;
    });
    await page.route('**/api/performance/summary**', async (route) => {
      await pendingRequest;
      await route.abort();
    });

    await page.goto('/#/bankroll?section=performance');
    await expect(page.getByTestId('performance-page')).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新' })).toBeDisabled();
    await assertLayout(page);
    await attachScreenshot(page, testInfo, 'narrow-performance-loading');

    resumeRequest();
  });
});
