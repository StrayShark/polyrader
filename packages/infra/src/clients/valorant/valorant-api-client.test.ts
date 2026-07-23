import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPoliteFetchState } from '../../crawlers/polite-fetch';
import { ValorantApiClient } from './valorant-api-client';

describe('ValorantApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPoliteFetchState();
  });

  it('loads version, playable characters and maps without a key', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const data = url.includes('/version')
        ? { manifestId: 'manifest-1', version: '13.01.00' }
        : url.includes('/agents')
          ? [{ uuid: 'agent-1', displayName: 'Jett' }]
          : [{ uuid: 'map-1', displayName: 'Bind' }];
      return new Response(JSON.stringify({ status: 200, data }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ValorantApiClient({
      baseUrl: 'https://valorant-api.test',
      minIntervalMs: 0,
    });

    await expect(client.getContent()).resolves.toEqual({
      version: '13.01.00',
      manifestId: 'manifest-1',
      characters: [{ uuid: 'agent-1', displayName: 'Jett' }],
      maps: [{ uuid: 'map-1', displayName: 'Bind' }],
      sourceUrl: 'https://valorant-api.test',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
