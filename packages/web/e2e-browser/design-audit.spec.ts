import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks } from './fixtures/api-mocks';
import { setTheme, type AppTheme } from './fixtures/theme';
import { DESIGN_AUDIT_PAGES } from './fixtures/routes';
import { isNearColor, isShadowNone, themeExpectations } from './design/cursor-tokens';
import { writeAuditReport, type AuditEntry } from './design/report-writer';

const auditResults: AuditEntry[] = [];
const THEMES: AppTheme[] = ['light', 'dark', 'matrix'];

const FORBIDDEN_REAL_MONEY_KEYWORDS = [
  'Deposit',
  'Withdraw',
  'Bonus',
  'VIP',
  'Cashback',
  'Cashout',
  'Real balance',
  'Real bet',
  'Bet real',
  'Win money',
  '实盘下单',
  '实盘买入',
  '真实限价单',
  '真实下注',
  '真钱',
  '充值',
  '提现',
  '奖金',
  '返现',
];

async function scanForbiddenText(page: import('@playwright/test').Page): Promise<string[]> {
  const bodyText = await page.evaluate(() => document.body.innerText);
  const lower = bodyText.toLowerCase();
  return FORBIDDEN_REAL_MONEY_KEYWORDS.filter((keyword) =>
    lower.includes(keyword.toLowerCase()),
  );
}

function record(page: string, module: string, theme: string, status: AuditEntry['status'], note?: string) {
  auditResults.push({ page, module, theme, status, note });
}

async function readCssVar(page: import('@playwright/test').Page, name: string): Promise<string> {
  return page.evaluate((varName) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return '';
    const probe = document.createElement('div');
    probe.style.backgroundColor = raw;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  }, name);
}

test.describe('Cursor design audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  test.afterAll(() => {
    writeAuditReport('e2e-design-audit.json', auditResults, 'E2E Cursor 视觉审计');
  });

  for (const theme of THEMES) {
    test(`theme tokens — ${theme}`, async ({ page }) => {
      await page.goto('/#/');
      await page.getByTestId('app-sidebar').first().waitFor({ state: 'visible', timeout: 10000 });
      await setTheme(page, theme);

      const expected = themeExpectations(theme);
      const background = await readCssVar(page, '--background');
      const foreground = await readCssVar(page, '--foreground');
      const primary = await readCssVar(page, '--primary');
      const border = await readCssVar(page, '--border');

      record('global', 'background', theme, isNearColor(background, expected.background) ? 'pass' : 'fail', `got ${background}`);
      record('global', 'foreground', theme, isNearColor(foreground, expected.foreground) ? 'pass' : 'fail', `got ${foreground}`);

      if (expected.primaryException) {
        record('global', 'primary', theme, 'exception', `Matrix green primary allowed: ${primary}`);
      } else {
        record('global', 'primary', theme, isNearColor(primary, expected.primary) ? 'pass' : 'fail', `got ${primary}`);
      }

      record('global', 'border', theme, isNearColor(border, expected.border) ? 'pass' : 'partial', `got ${border}`);
    });
  }

  for (const theme of THEMES) {
    for (const route of DESIGN_AUDIT_PAGES) {
      test(`components — ${route.name} @ ${theme}`, async ({ page }) => {
        await page.goto(route.hash);
        await page.getByTestId('app-sidebar').first().waitFor({ state: 'visible', timeout: 10000 });
        await setTheme(page, theme);
        await page.waitForTimeout(500);

        const card = page.locator('[class*="rounded-lg"][class*="border"]').first();
        if (await card.count()) {
          const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
          record(route.name, 'card-no-shadow', theme, isShadowNone(shadow) ? 'pass' : 'fail', shadow);
        }

        const primaryBtn = page.locator('main button.bg-primary, main button[class*="bg-primary"]').first();
        if (await primaryBtn.count()) {
          const height = await primaryBtn.evaluate((el) => el.getBoundingClientRect().height);
          const min = themeExpectations(theme).primaryButtonMinHeight;
          record(route.name, 'primary-button-height', theme, height >= min - 2 ? 'pass' : 'partial', `${height}px`);
        }

        const mono = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        record(route.name, 'body-font-inter', theme, /Inter/i.test(mono) ? 'pass' : 'partial', mono);
      });
    }
  }

  for (const route of DESIGN_AUDIT_PAGES) {
    test(`forbidden real-money text — ${route.name}`, async ({ page }) => {
      await page.goto(route.hash);
      await page.getByTestId('app-sidebar').first().waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);

      const found = await scanForbiddenText(page);
      record(route.name, 'no-real-money-text', 'all', found.length === 0 ? 'pass' : 'fail', found.join(', '));
      expect(found, `Found forbidden real-money keywords on ${route.name}: ${found.join(', ')}`).toHaveLength(0);
    });
  }
});
