import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GridClient', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GRID_API_KEY;
  const originalLolTitle = process.env.GRID_TITLE_ID_LOL;
  const originalDotaTitle = process.env.GRID_TITLE_ID_DOTA2;

  beforeEach(() => {
    process.env.GRID_API_KEY = 'test-grid-key';
    delete process.env.GRID_TITLE_ID_LOL;
    delete process.env.GRID_TITLE_ID_DOTA2;
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GRID_API_KEY = originalKey;
    process.env.GRID_TITLE_ID_LOL = originalLolTitle;
    process.env.GRID_TITLE_ID_DOTA2 = originalDotaTitle;
    vi.restoreAllMocks();
  });

  it('testConnection returns true when GraphQL responds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { titles: [{ id: '1', name: 'CS2' }] } }),
    }) as typeof fetch;

    const { GridClient } = await import('../grid-client');
    const client = new GridClient();
    await expect(client.testConnection()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('central-data/graphql'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-grid-key' }),
      }),
    );
  });

  it('throws when GRID_API_KEY is missing', async () => {
    delete process.env.GRID_API_KEY;
    vi.resetModules();
    const { GridClient } = await import('../grid-client');
    const client = new GridClient();
    await expect(client.searchTeams('Spirit')).rejects.toThrow(/GRID_API_KEY/);
  });

  it('discovers a missing game title ID from the GRID titles API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          titles: [
            { id: '1', name: 'Counter-Strike 2' },
            { id: '42', name: 'League of Legends' },
          ],
        },
      }),
    }) as typeof fetch;

    const { GridClient } = await import('../grid-client');
    const client = new GridClient();
    await expect(client.getTitleIdForGame('lol')).resolves.toBe('42');
    await expect(client.getTitleIdForGame('lol')).resolves.toBe('42');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a configured key from unavailable Dota title rights', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { titles: [{ id: '1', name: 'Counter-Strike 2' }] },
      }),
    }) as typeof fetch;

    const { GridClient } = await import('../grid-client');
    const client = new GridClient();

    expect(client.isConfiguredForGame('dota2')).toBe(true);
    await expect(client.getTitleIdForGame('dota2')).rejects.toThrow(
      /not available to this account.*GRID_TITLE_ID_DOTA2/,
    );
  });
});
