// Playwright-based HTTP client for JSON APIs.
//
// In environments where SNI-based DPI filtering blocks direct Node.js fetch()
// to certain domains (e.g. polymarket.com), Chromium can bypass the filter
// because its TLS fingerprint (BoringSSL with ECH) differs from Node's OpenSSL.
//
// This module provides a drop-in replacement for fetch() that routes JSON
// requests through a shared headless Chromium instance.

type BrowserLike = {
  isConnected(): boolean;
  newContext(options: { extraHTTPHeaders: Record<string, string> }): Promise<{
    newPage(): Promise<{
      goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<{
        ok(): boolean;
        status(): number;
        statusText(): string;
      } | null>;
      textContent(selector: string): Promise<string | null>;
    }>;
    close(): Promise<void>;
  }>;
};

let browserInstance: BrowserLike | null = null;
let browserLaunchPromise: Promise<BrowserLike> | null = null;

async function getBrowser(): Promise<BrowserLike> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  const playwrightModule = ['play', 'wright'].join('');
  const playwright = await import(playwrightModule) as typeof import('playwright');
  browserLaunchPromise = playwright.chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;
  return browserInstance;
}

/**
 * Fetch JSON from a URL using a headless browser.
 *
 * Lightweight version for JSON APIs: no anti-detection delays, reuses a
 * single browser instance, and parses the raw JSON response directly.
 */
export interface BrowserFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchJsonWithBrowser<T>(url: string, options: BrowserFetchOptions = {}): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    extraHTTPHeaders: { Accept: 'application/json', ...options.headers },
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs ?? 20000,
    });

    if (!response || !response.ok()) {
      throw new Error(`HTTP ${response?.status() ?? 'unknown'}: ${response?.statusText() ?? 'no response'}`);
    }

    const text = await page.textContent('body');
    return JSON.parse(text ?? 'null') as T;
  } finally {
    await context.close();
  }
}
