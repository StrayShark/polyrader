import type { Page } from '@playwright/test';

export async function blockWs(page: Page): Promise<void> {
  await page.routeWebSocket(/\/ws(?:\?|$)/, () => {
    // Keeping a mocked socket open avoids reconnect timers and proxy noise.
  });
}
