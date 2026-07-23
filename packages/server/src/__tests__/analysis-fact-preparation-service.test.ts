import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAPER_POLICY, type NormalizedMatchFacts } from '@polyrader/core';
import { AnalysisFactPreparationService } from '../services/analysis-fact-preparation-service';

const now = new Date('2026-07-22T08:00:00.000Z');
const completeLineups = JSON.stringify({
  teamA: { players: Array.from({ length: 5 }, (_, index) => ({ playerId: `a-${index}` })) },
  teamB: { players: Array.from({ length: 5 }, (_, index) => ({ playerId: `b-${index}` })) },
});

function createService(updatedAt: string) {
  const enrich = vi.fn(async () => ({
    matchId: 'local-hltv-2395534',
    hltvMatchId: '2395534',
    refreshed: true,
    teamAPlayers: 5,
    teamBPlayers: 5,
    teamARecentMatches: 10,
    teamBRecentMatches: 10,
    teamAMaps: 7,
    teamBMaps: 7,
    lineupsConfirmed: true,
  }));
  const sync = vi.fn(() => 3);
  const normalized = { externalMatchId: '2395534' } as NormalizedMatchFacts;
  const normalize = vi.fn(() => normalized);
  const service = new AnalysisFactPreparationService({
    matches: {
      getMatch: vi.fn((id: string) =>
        id === 'local-hltv-2395534'
          ? {
              match_id: id,
              hltv_match_id: '2395534',
              has_team_data: 1,
              lineups: completeLineups,
              updated_at: updatedAt,
            }
          : null,
      ),
    },
    alignment: { enrichHltvMatchForAnalysis: enrich },
    sources: { syncLegacyCs2Snapshots: sync },
    normalization: { normalizeMatch: normalize },
    policy: {
      getActive: () => ({ ...DEFAULT_PAPER_POLICY, maximumFreshnessSeconds: 3600 }),
    },
    now: () => now,
  });
  return { service, enrich, sync, normalize, normalized };
}

describe('AnalysisFactPreparationService', () => {
  it('refreshes complete CS2 data as soon as the active one-hour policy is exceeded', async () => {
    const fixture = createService('2026-07-22T06:30:00.000Z');

    const result = await fixture.service.prepare('cs2', '2395534');

    expect(result).toMatchObject({ attemptedRefresh: true, refreshed: true });
    expect(result.normalized).toBe(fixture.normalized);
    expect(fixture.enrich).toHaveBeenCalledOnce();
    expect(fixture.sync).toHaveBeenCalledOnce();
    expect(fixture.normalize).toHaveBeenCalledWith('cs2', '2395534');
  });

  it('reuses complete CS2 facts that remain inside the active freshness window', async () => {
    const fixture = createService('2026-07-22T07:30:00.000Z');

    const result = await fixture.service.prepare('cs2', 'local-hltv-2395534');

    expect(result).toMatchObject({ attemptedRefresh: false, refreshed: false });
    expect(fixture.enrich).not.toHaveBeenCalled();
    expect(fixture.sync).toHaveBeenCalledOnce();
  });
});
