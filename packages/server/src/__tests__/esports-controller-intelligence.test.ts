import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { EsportsController } from '../controllers/esports-controller';

describe('EsportsController match intelligence refresh', () => {
  it('discovers an HLTV link and runs full intelligence enrichment', async () => {
    let stored: Record<string, unknown> = {
      match_id: 'local-market-alpha-beta',
      team_a_id: 'alpha-local',
      team_b_id: 'beta-local',
      team_a_name: 'Alpha',
      team_b_name: 'Beta',
      event_name: 'Test Cup',
      event_type: 'Online',
      format: 'BO3',
      scheduled_at: '2026-07-26T10:00:00.000Z',
      status: 'scheduled',
      maps: '[]',
      has_team_data: 0,
      lineups: null,
    };
    const llmRepo = {
      getMatch: vi.fn(() => stored),
      getTeam: vi.fn(() => null),
      upsertMatch: vi.fn((input: Record<string, unknown>) => {
        stored = {
          ...stored,
          hltv_match_id: input.hltvMatchId,
          canonical_match_id: `hltv:${String(input.hltvMatchId)}`,
        };
      }),
    };
    const hltv = {
      findMatchIdByTeams: vi.fn().mockResolvedValue('2397000'),
    };
    const sourceAlignment = {
      linkHltvMatch: vi.fn(),
      enrichHltvMatchForAnalysis: vi.fn().mockResolvedValue({
        matchId: 'local-market-alpha-beta',
        hltvMatchId: '2397000',
        refreshed: true,
        teamAPlayers: 5,
        teamBPlayers: 5,
        teamARecentMatches: 10,
        teamBRecentMatches: 10,
        teamAMaps: 7,
        teamBMaps: 7,
        lineupsConfirmed: true,
      }),
    };
    const match = {
      matchId: 'local-market-alpha-beta',
      teamA: { teamId: '100', name: 'Alpha', logo: '', rank: 10, region: 'EU' },
      teamB: { teamId: '200', name: 'Beta', logo: '', rank: 20, region: 'EU' },
      eventName: 'Test Cup',
      eventType: 'Online' as const,
      format: 'BO3' as const,
      scheduledAt: '2026-07-26T10:00:00.000Z',
      status: 'scheduled' as const,
    };
    const controller = new EsportsController();
    Object.assign(controller as unknown as Record<string, unknown>, {
      llmRepo,
      hltv,
      sourceAlignment,
      marketRepo: { findBySlug: vi.fn(), findByConditionId: vi.fn() },
      service: { getMatch: vi.fn().mockResolvedValue(match) },
    });

    const req = {
      params: { matchId: 'local-market-alpha-beta' },
      headers: {},
    } as unknown as Request;
    let payload: unknown;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((value: unknown) => {
        payload = value;
        return value;
      }),
    } as unknown as Response;

    await controller.refreshMatchIntelligence(req, res);

    expect(hltv.findMatchIdByTeams).toHaveBeenCalledWith('Alpha', 'Beta');
    expect(llmRepo.upsertMatch).toHaveBeenCalledWith(expect.objectContaining({
      matchId: 'local-market-alpha-beta',
      hltvMatchId: '2397000',
    }));
    expect(sourceAlignment.linkHltvMatch).toHaveBeenCalledWith(
      'local-market-alpha-beta',
      '2397000',
    );
    expect(sourceAlignment.enrichHltvMatchForAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ hltv_match_id: '2397000' }),
    );
    expect(payload).toEqual({
      data: expect.objectContaining({ refreshed: true, match }),
    });
  });
});
