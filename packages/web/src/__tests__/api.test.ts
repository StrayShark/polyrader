import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/tauri-bridge', () => ({
  getApiBase: () => Promise.resolve('http://127.0.0.1:13001/api'),
}));

import { api } from '../utils/api';

describe('api request timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts a stalled refresh request at the caller timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    )));

    const request = api.post('/esports/fetch-upcoming', undefined, { timeoutMs: 15 });
    const assertion = expect(request).rejects.toThrow('Request timed out after 15ms');
    await vi.advanceTimersByTimeAsync(15);
    await assertion;
  });
});
