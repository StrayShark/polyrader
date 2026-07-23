import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPoliteFetchState, fetchTextPolitely } from './polite-fetch';

describe('fetchTextPolitely', () => {
  beforeEach(() => clearPoliteFetchState());
  afterEach(() => vi.restoreAllMocks());

  it('uses one identifiable user agent and caches successful responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('ok', {
      status: 200,
      headers: { etag: 'v1' },
    }));

    const options = {
      fetcher: fetcher as typeof fetch,
      minIntervalMs: 0,
      cacheTtlMs: 1000,
      now: () => 100,
      userAgent: 'PolyRaderTest/1.0 contact@example.com',
    };
    await expect(fetchTextPolitely('https://source.test/matches', options)).resolves.toBe('ok');
    await expect(fetchTextPolitely('https://source.test/matches', options)).resolves.toBe('ok');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://source.test/matches',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'PolyRaderTest/1.0 contact@example.com',
        }),
      }),
    );
  });

  it('honors Retry-After for 429 responses', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('slow down', {
        status: 429,
        headers: { 'retry-after': '2' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchTextPolitely('https://source.test/matches', {
      fetcher: fetcher as typeof fetch,
      minIntervalMs: 0,
      maxRetries: 1,
      sleep,
    })).resolves.toBe('ok');

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 405])('does not retry HTTP %s errors', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('request rejected', { status }));

    await expect(fetchTextPolitely('https://source.test/matches', {
      fetcher: fetcher as typeof fetch,
      minIntervalMs: 0,
      maxRetries: 3,
    })).rejects.toThrow(new RegExp(`HTTP ${status}`));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
