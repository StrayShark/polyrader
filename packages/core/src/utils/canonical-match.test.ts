import { describe, expect, it } from 'vitest';
import { buildCanonicalMatchId } from './canonical-match';

describe('buildCanonicalMatchId', () => {
  it('prefers the authoritative HLTV match ID', () => {
    expect(buildCanonicalMatchId({ hltvMatchId: '2395534' })).toBe('hltv:2395534');
  });

  it('is invariant to team order for cross-source matching', () => {
    const a = buildCanonicalMatchId({
      teamAId: '4869', teamBId: '13214', eventName: 'European Pro League', scheduledAt: '2026-07-14T12:05:00Z',
    });
    const b = buildCanonicalMatchId({
      teamAId: '13214', teamBId: '4869', eventName: 'European Pro League', scheduledAt: '2026-07-14T12:12:00Z',
    });
    expect(a).toBe(b);
  });

  it('uses normalized names when source IDs are local placeholders', () => {
    const id = buildCanonicalMatchId({
      teamAId: 'local-team-a-natus-vincere',
      teamBId: 'local-team-b-faze-clan',
      teamAName: 'Natus Vincere',
      teamBName: 'FaZe Clan',
      eventName: 'IEM Cologne',
    });
    expect(id).toContain('name-faze-clan--name-natus-vincere');
  });
});
