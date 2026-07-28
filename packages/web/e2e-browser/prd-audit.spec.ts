import { test, expect } from '@playwright/test';
import { blockWs } from './fixtures/block-ws';
import { setupCommonMocks, setupMatchDetailMocks } from './fixtures/api-mocks';
import { waitForMainHeading } from './fixtures/theme';
import { writeAuditReport, type AuditEntry } from './design/report-writer';

const auditResults: AuditEntry[] = [];

function record(page: string, module: string, status: AuditEntry['status'], note?: string) {
  auditResults.push({ page, module, status, note });
}

test.describe('PRD module audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockWs(page);
    await setupCommonMocks(page);
    await page.addInitScript(() => {
      localStorage.setItem('polyrader-locale', 'zh');
    });
  });

  test.afterAll(() => {
    writeAuditReport('e2e-prd-audit.json', auditResults, 'E2E PRD 功能审计');
  });

  test('Overview — time filter, match matrix, and +N expand', async ({ page }) => {
    await page.goto('/#/');
    await waitForMainHeading(page);

    record('lobby', 'page-render', 'pass');
    record(
      'lobby',
      'title',
      (await page.getByRole('heading', { name: '总览' }).isVisible()) ? 'pass' : 'fail',
    );

    const rail = page
      .locator('main')
      .getByRole('button', { name: /全部|进行中|即将开始|今日|明日|未来/ })
      .first();
    record('lobby', 'time-filter', (await rail.isVisible().catch(() => false)) ? 'pass' : 'fail');

    const oddsQuote = page.locator('main [data-testid="odds-quote"][aria-label*="Spirit"]').first();
    record(
      'lobby',
      'odds-matrix',
      (await oddsQuote.isVisible().catch(() => false)) ? 'pass' : 'partial',
    );

    record(
      'lobby',
      'practice-slip-removed',
      (await page.getByTestId('desktop-bet-slip').count()) === 0 ? 'pass' : 'fail',
    );
  });

  test('Match Detail — overview odds and practice slip path', async ({ page }) => {
    await setupMatchDetailMocks(page);
    await page.goto('/#/match/spirit-vs-g2-bo3');
    await waitForMainHeading(page);

    record('match-detail', 'page-render', 'pass');
    record(
      'match-detail',
      'match-info',
      (await page.getByText('IEM Cologne').count()) > 0 ? 'pass' : 'fail',
    );
    record(
      'match-detail',
      'format-badge',
      (await page.getByText('BO3').count()) > 0 ? 'pass' : 'fail',
    );

    const teamOdds = page.locator('main [aria-label*="Spirit"]').first();
    record(
      'match-detail',
      'odds-matrix',
      (await teamOdds.isVisible().catch(() => false)) ? 'pass' : 'partial',
    );

    await teamOdds.click().catch(() => {});
    const slipHasSelection =
      (await page
        .getByTestId('desktop-bet-slip')
        .getByText(/Spirit|G2/)
        .count()) > 0;
    record('match-detail', 'practice-slip-path', slipHasSelection ? 'pass' : 'partial');
  });

  test('Sim Trading — balance cards and RiskMeter', async ({ page }) => {
    await page.goto('/#/bankroll');
    await waitForMainHeading(page);

    record('bankroll', 'page-render', 'pass');
    record(
      'bankroll',
      'title',
      (await page.getByRole('heading', { name: '模拟盘' }).isVisible()) ? 'pass' : 'fail',
    );
    record(
      'bankroll',
      'balance-cards',
      (await page.locator('main .grid').first().isVisible()) ? 'pass' : 'fail',
    );
    record(
      'bankroll',
      'risk-meter',
      (await page.getByText(/风险|Risk/).count()) > 0 ? 'pass' : 'fail',
    );
    record(
      'bankroll',
      'bets-tabs',
      (await page.getByRole('tab', { name: /未结算|已结算/ }).count()) > 0 ? 'pass' : 'fail',
    );
  });

  test('Review Center — filters and settled bets list', async ({ page }) => {
    await page.goto('/#/review');
    await waitForMainHeading(page);

    record('review', 'page-render', 'pass');
    record(
      'review',
      'title',
      (await page.getByRole('heading', { name: '模拟盘' }).isVisible()) ? 'pass' : 'fail',
    );
    record(
      'review',
      'active-tab',
      (await page.getByRole('tab', { name: '复盘', exact: true }).getAttribute('aria-selected')) ===
        'true'
        ? 'pass'
        : 'fail',
    );
    record('review', 'filter-format', (await page.getByText('赛制').count()) > 0 ? 'pass' : 'fail');
    record('review', 'filter-result', (await page.getByText('结果').count()) > 0 ? 'pass' : 'fail');
    record(
      'review',
      'bets-table',
      (await page.locator('main table').count()) > 0 ? 'pass' : 'fail',
    );
  });

  test('Database — backup info and CSV/JSON export', async ({ page }) => {
    await page.goto('/#/database');
    await waitForMainHeading(page);

    record('database', 'page-render', 'pass');
    record(
      'database',
      'title',
      (await page.getByRole('heading', { name: '本地数据库' }).isVisible()) ? 'pass' : 'fail',
    );
    record(
      'database',
      'backup-info',
      (await page.getByText('总记录数').count()) > 0 ? 'pass' : 'fail',
    );

    const hasCsv = (await page.getByRole('button', { name: /CSV/ }).count()) > 0;
    const hasJson = (await page.getByRole('button', { name: /JSON/ }).count()) > 0;
    record('database', 'csv-export', hasCsv ? 'pass' : 'fail');
    record('database', 'json-export', hasJson ? 'pass' : 'fail');
  });

  test('Strategy Lab — tabs and empty state', async ({ page }) => {
    await page.goto('/#/strategy');
    await waitForMainHeading(page);

    record('strategy-lab', 'page-render', 'pass');
    record(
      'strategy-lab',
      'title',
      (await page.getByRole('heading', { name: '策略实验室' }).isVisible()) ? 'pass' : 'fail',
    );
    record('strategy-lab', 'tabs', (await page.getByRole('tab').count()) > 0 ? 'pass' : 'fail');
  });
});
