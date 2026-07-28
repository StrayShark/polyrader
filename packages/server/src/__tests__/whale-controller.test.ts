import { describe, expect, it, vi } from 'vitest';
import { WhaleController } from '../controllers/whale-controller';

describe('WhaleController positions', () => {
  it('returns current positions for a wallet address', async () => {
    const getWhalePositions = vi.fn().mockResolvedValue([
      {
        marketId: 'condition-1',
        question: 'Team WE vs JD Gaming',
        outcome: 'Team WE',
        shares: 100,
        value: 64,
      },
    ]);
    const controller = new WhaleController();
    (controller as unknown as { service: { getWhalePositions: typeof getWhalePositions } }).service = {
      getWhalePositions,
    };
    const response = mockResponse();

    await controller.getWhalePositions(
      {
        params: { address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD' },
        query: { limit: 25 },
        headers: {},
      } as never,
      response.res as never,
    );

    expect(getWhalePositions).toHaveBeenCalledWith(
      '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      25,
    );
    expect(response.json).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          marketId: 'condition-1',
          outcome: 'Team WE',
          value: 64,
        }),
      ],
    });
  });

  it('returns a 502 when position lookup fails', async () => {
    const getWhalePositions = vi.fn().mockRejectedValue(new Error('data api unavailable'));
    const controller = new WhaleController();
    (controller as unknown as { service: { getWhalePositions: typeof getWhalePositions } }).service = {
      getWhalePositions,
    };
    const response = mockResponse();

    await controller.getWhalePositions(
      {
        params: { address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD' },
        query: { limit: 25 },
        headers: {},
      } as never,
      response.res as never,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to fetch whale positions' }),
    );
  });
});

function mockResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    status,
    json,
    res: { status, json },
  };
}
