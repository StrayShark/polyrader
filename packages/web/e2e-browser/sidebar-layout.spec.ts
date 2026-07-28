import { test, expect, type Page } from '@playwright/test';

/**
 * Navigate to a page and wait for the sidebar to be fully rendered.
 * No API mocking — the app handles API failures gracefully (sidebar renders
 * with empty data; main content shows error/loading states).
 */
async function gotoWithSidebar(page: Page, path = '/') {
  const hashPath = path.startsWith('/#') ? path : `/#${path}`;
  await page.goto(hashPath);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('app-sidebar')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

// ============================================================
// Sidebar: Layout Structure (Desktop)
// ============================================================
test.describe('Sidebar layout structure (desktop)', () => {
  test('renders exactly one sidebar', async ({ page }) => {
    await gotoWithSidebar(page);
    await expect(page.getByTestId('app-sidebar')).toHaveCount(1);
  });

  test('sidebar border extends to full viewport height', async ({ page }) => {
    await gotoWithSidebar(page);

    const height = await page.getByTestId('app-sidebar').evaluate((el) => {
      return el.getBoundingClientRect().height;
    });

    const viewportHeight = page.viewportSize()?.height ?? 720;
    expect(height).toBeGreaterThan(viewportHeight * 0.95);
  });

  test('sidebar has right border', async ({ page }) => {
    await gotoWithSidebar(page);

    const borderRightWidth = await page.getByTestId('app-sidebar').evaluate((el) => {
      return getComputedStyle(el).borderRightWidth;
    });
    expect(parseFloat(borderRightWidth)).toBeGreaterThan(0);
  });

  test('window top area has a bottom separator line', async ({ page }) => {
    await gotoWithSidebar(page);

    const topBorder = page.getByTestId('window-top-border');
    await expect(topBorder).toBeVisible();
    const style = await topBorder.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const computed = getComputedStyle(el);
      return {
        top: rect.top,
        height: rect.height,
        backgroundColor: computed.backgroundColor,
      };
    });
    expect(style.top).toBe(0);
    expect(style.height).toBeGreaterThan(0);
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('sidebar width is 240px', async ({ page }) => {
    await gotoWithSidebar(page);

    const width = await page.getByTestId('app-sidebar').evaluate((el) => {
      return el.getBoundingClientRect().width;
    });
    expect(width).toBe(240);
  });
});

// ============================================================
// Sidebar: Content Visibility (Desktop)
// ============================================================
test.describe('Sidebar content visibility (desktop)', () => {
  test('does not render a title in the upper-left sidebar', async ({ page }) => {
    await gotoWithSidebar(page);
    await expect(page.getByTestId('app-sidebar').getByText('PolyRader', { exact: true })).toHaveCount(0);
  });

  test('does not render group labels', async ({ page }) => {
    await gotoWithSidebar(page);
    const groupLabels = page.getByTestId('app-sidebar').locator('div.tracking-wider');
    await expect(groupLabels).toHaveCount(0);
  });

  test('navigation items have visible vertical spacing', async ({ page }) => {
    await gotoWithSidebar(page);
    const primaryLinks = page.getByTestId('app-sidebar').locator('nav[aria-label="Primary"] a');
    await expect(primaryLinks).toHaveCount(4);
    const gap = await primaryLinks.evaluateAll((links) => {
      const first = links[0].getBoundingClientRect();
      const second = links[1].getBoundingClientRect();
      return second.top - first.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(4);
  });

  test('all navigation links have non-empty text', async ({ page }) => {
    await gotoWithSidebar(page);
    const navLinks = page.getByTestId('app-sidebar').locator('nav a');
    const texts = await navLinks.allTextContents();
    expect(texts).toEqual(['总览', '模拟盘', '巨鲸追踪', '日历', '设置']);
    for (const text of texts) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('navigation modules render decorative icons with visible labels', async ({ page }) => {
    await gotoWithSidebar(page);
    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar.locator('nav a')).toHaveCount(5);
    await expect(sidebar.locator('nav svg[aria-hidden="true"]')).toHaveCount(5);
  });

  test('pins settings at the bottom and removes duplicate settings controls', async ({ page }) => {
    await gotoWithSidebar(page);
    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar.getByTestId('sidebar-footer').getByRole('link', { name: /设置|Settings/ })).toBeVisible();
    await expect(sidebar.locator('a[href*="database"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="ai/config"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="bankroll"]')).toHaveCount(1);
    await expect(sidebar.locator('a[href*="strategy"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="analysis/report"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="validation-lab"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="signals"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="ai/stats"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="review"]')).toHaveCount(0);
    await expect(sidebar.locator('a[href*="simulation"]')).toHaveCount(0);
    await expect(sidebar.locator('button[title="Dark+"]')).toHaveCount(0);
    await expect(sidebar.locator('button[title="Light+"]')).toHaveCount(0);
    await expect(sidebar.locator('button[title="Matrix"]')).toHaveCount(0);
  });
});

// ============================================================
// Sidebar: Mobile Behavior
// ============================================================
test.describe('Sidebar mobile behavior', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('sidebar is not visible by default on mobile', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Desktop sidebar is display:none on mobile (parent has 'hidden' class)
    await expect(page.getByTestId('app-sidebar')).not.toBeVisible({ timeout: 5000 });
  });

  test('hamburger menu button is visible', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await expect(page.locator('button[aria-label="Toggle menu"]')).toBeVisible({ timeout: 10000 });
  });

  test('clicking hamburger opens sidebar', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const menuButton = page.locator('button[aria-label="Toggle menu"]');
    await menuButton.click();

    // After clicking, mobile sidebar renders. There are now 2 asides:
    // [0] = desktop sidebar (hidden, parent is display:none)
    // [1] = mobile sidebar (visible)
    await expect(page.getByTestId('app-sidebar')).toHaveCount(2);
    const mobileSidebar = page.getByTestId('app-sidebar').nth(1);
    await expect(mobileSidebar).toBeVisible();
    await expect(mobileSidebar.getByText('PolyRader', { exact: true })).toHaveCount(0);
    await expect(
      mobileSidebar.getByTestId('sidebar-footer').getByRole('link', { name: /设置|Settings/ })
    ).toBeVisible();
    await expect(
      mobileSidebar.getByRole('button', { name: /关闭菜单|Close menu/ })
    ).toBeVisible();
  });

  test('only one sidebar in DOM before menu opens', async ({ page }) => {
    await page.goto('/#/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    // Desktop sidebar exists in DOM (inside display:none container)
    await expect(page.getByTestId('app-sidebar')).toHaveCount(1);
  });
});
