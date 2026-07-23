import { test, expect } from '@playwright/test';
import { setupCommonMocks } from './fixtures/api-mocks';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
  });

  test('centralizes appearance, LLM, database, and system settings', async ({ page }) => {
    await page.goto('/#/settings');

    await expect(page.getByRole('heading', { name: /设置|Settings/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /常规|General/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'LLM' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /本地数据库|Local Database/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /系统|System/ })).toBeVisible();
    await expect(page.getByText(/外观与语言|Appearance & Language/)).toBeVisible();
    await expect(page.getByText('资金与风控', { exact: true })).toBeVisible();
    await expect(page.getByText(/Polymarket 只读账户|Polymarket Read-only Account/)).toBeVisible();
    await expect(page.getByText(/CS2_SIMBOOK_ENABLE_POLYMARKET_ACCOUNT/)).toBeVisible();

    await page.getByRole('tab', { name: 'LLM' }).click();
    await expect(page.getByRole('heading', { name: /LLM 设置|LLM Settings/ })).toBeVisible();
    await expect(page.getByText(/API Key 管理|API Key Management/)).toBeVisible();

    await page.getByRole('tab', { name: /本地数据库|Local Database/ }).click();
    await expect(page.getByRole('heading', { name: /本地数据库|Local Database/ })).toBeVisible();
    await expect(page.getByText(/本地数据表|Local Tables/)).toBeVisible();

    await page.getByRole('tab', { name: /系统|System/ }).click();
    await expect(page.getByText(/数据源健康|Data Source Health/)).toBeVisible();
    await expect(page.getByTestId('esports-data-sources')).toBeVisible();
  });

  test('shows all game source states and syncs public Dota 2 data', async ({ page }) => {
    await page.goto('/#/settings?section=system');

    await expect(page.getByTestId('source-game-cs2')).toBeVisible();
    await expect(page.getByTestId('source-game-lol')).toBeVisible();
    await expect(page.getByTestId('source-game-dota2')).toContainText('OpenDota');
    await expect(page.getByTestId('source-game-dota2')).toContainText(
      /1 条赛事身份|1 match identity/,
    );
    await expect(page.getByTestId('source-readiness-dota2-opendota')).toContainText(
      /数据可用|Data available/,
    );
    await expect(page.getByTestId('source-game-valorant')).toContainText('Riot VAL API');

    const requestPromise = page.waitForRequest((request) =>
      request.url().endsWith('/api/esports/sources/dota2/sync') && request.method() === 'POST',
    );
    await page.getByTestId('source-game-dota2').getByRole('button', { name: /同步|Sync/ }).click();
    await requestPromise;

    await expect(page.getByTestId('source-game-dota2')).toContainText('50');
  });

  test('redirects legacy AI and database routes into settings sections', async ({ page }) => {
    await page.goto('/#/ai/config');
    await expect(page).toHaveURL(/#\/settings\?section=llm$/);
    await expect(page.getByRole('tab', { name: 'LLM' })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/#/database');
    await expect(page).toHaveURL(/#\/settings\?section=database$/);
    await expect(page.getByRole('tab', { name: /本地数据库|Local Database/ })).toHaveAttribute('aria-selected', 'true');
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
