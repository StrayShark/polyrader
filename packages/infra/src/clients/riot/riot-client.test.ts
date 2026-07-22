import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiotClient } from './riot-client';

describe('RiotClient', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('loads the latest LoL patch from public Data Dragon without a key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('["16.14.1","16.13.1"]', { status: 200 })));
    const client = new RiotClient({ dataDragonUrl: 'https://ddragon.test' });

    await expect(client.getLatestLolPatch()).resolves.toEqual({
      version: '16.14.1',
      sourceUrl: 'https://ddragon.test/cdn/16.14.1/data/en_US/champion.json',
    });
  });

  it('requires a key for VALORANT content', async () => {
    const client = new RiotClient({ apiKey: '' });
    await expect(client.getValorantContent()).rejects.toThrow(/RIOT_API_KEY/);
  });

  it('maps VALORANT content and sends the Riot token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 'v1', characters: [{ id: 'agent' }], maps: [{ id: 'map' }], acts: [{ id: 'act' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new RiotClient({ apiKey: 'riot-test', valorantRoute: 'ap' });

    const content = await client.getValorantContent('zh-CN');

    expect(content.version).toBe('v1');
    expect(content.maps).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ap.api.riotgames.com/val/content/v1/contents?locale=zh-CN',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Riot-Token': 'riot-test' }) }),
    );
  });
});
