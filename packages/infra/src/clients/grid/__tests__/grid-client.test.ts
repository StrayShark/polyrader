import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('GridClient', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GRID_API_KEY;

  beforeEach(() => {
    process.env.GRID_API_KEY = 'test-grid-key';
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GRID_API_KEY = originalKey;
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
});
