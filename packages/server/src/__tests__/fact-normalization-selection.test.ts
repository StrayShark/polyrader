import { describe, expect, it } from 'vitest';
import {
  buildLolFixtureFacts,
  buildValorantFixtureFacts,
  type SourceSnapshotLike,
} from '@polyrader/core';
import {
  compareMatchCandidates,
  selectBoardSample,
} from '../services/fact-normalization-service';

const NOW = Date.parse('2026-07-22T16:00:00.000Z');

describe('current match candidate selection', () => {
  it('prefers the nearest future pre-match over newly observed stale records', () => {
    const candidates = [
      candidate('stale-scheduled', '2026-07-22T13:00:00.000Z', 'scheduled', '16:00'),
      candidate('finished', '2026-07-22T15:00:00.000Z', 'finished', '16:00'),
      candidate('future-later', '2026-07-24T18:00:00.000Z', 'scheduled', '15:00'),
      candidate('live', '2026-07-22T15:30:00.000Z', 'live', '16:00'),
      candidate('future-near', '2026-07-23T18:00:00.000Z', 'scheduled', '15:00'),
    ];

    expect(
      candidates.sort((a, b) => compareMatchCandidates(a, b, NOW)).map((item) => item.externalId),
    ).toEqual(['future-near', 'future-later', 'live', 'finished', 'stale-scheduled']);
  });
});

describe('LoL / Valorant board sample selection', () => {
  it('prefers a dual-roster Valorant series over an earlier incomplete placeholder', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const complete = buildValorantFixtureFacts(now);
    const incomplete = buildValorantFixtureFacts(now);
    incomplete.externalMatchId = 'FvFyZROlbw_R01-M001_page_does_not_exist';
    incomplete.id = `valorant:${incomplete.externalMatchId}`;
    incomplete.startsAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    incomplete.participants = [
      { participantId: 'a', side: 'a', name: 'A Team', source: 'liquipedia' },
      { participantId: 'b', side: 'b', name: 'Young Gaming', source: 'liquipedia' },
    ];
    incomplete.players = [];
    incomplete.completeness = 0.71;
    incomplete.missing = ['roster_a', 'roster_b'];
    const quality = incomplete.facts.find((fact) => fact.factId === 'valorant-data-quality');
    if (quality && typeof quality.value === 'object' && quality.value) {
      const value = quality.value as {
        bothTeamsComplete: boolean;
        sides: Array<{ complete: boolean; fields: Array<{ field: string; status: string }> }>;
      };
      value.bothTeamsComplete = false;
      for (const side of value.sides) {
        side.complete = false;
        for (const field of side.fields) {
          if (field.field === 'identity' || field.field === 'roster') field.status = 'missing';
        }
      }
    }

    const sample = selectBoardSample('valorant', [incomplete, complete], now.getTime());
    expect(sample?.externalMatchId).toBe(complete.externalMatchId);
  });

  it('keeps time order for CS2 boards when quality is equal', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const first = buildLolFixtureFacts(now);
    first.game = 'cs2';
    first.externalMatchId = 'near';
    first.conflictFlags = [];
    first.completeness = 1;
    const second = buildLolFixtureFacts(now);
    second.game = 'cs2';
    second.externalMatchId = 'later';
    second.startsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    second.conflictFlags = [];
    second.completeness = 1;
    expect(selectBoardSample('cs2', [first, second], now.getTime())?.externalMatchId).toBe('near');
  });

  it('prefers a conflict-free CS2 sample over an earlier conflicted one', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const conflicted = buildLolFixtureFacts(now);
    conflicted.game = 'cs2';
    conflicted.externalMatchId = 'near-conflict';
    conflicted.conflictFlags = ['identity_collision', 'schedule_mismatch'];
    conflicted.completeness = 0.86;
    const clean = buildLolFixtureFacts(now);
    clean.game = 'cs2';
    clean.externalMatchId = 'later-clean';
    clean.startsAt = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    clean.conflictFlags = [];
    clean.completeness = 0.86;
    expect(selectBoardSample('cs2', [conflicted, clean], now.getTime())?.externalMatchId).toBe(
      'later-clean',
    );
  });

  it('demotes Dota page_does_not_exist placeholders behind real series ids', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const placeholder = buildLolFixtureFacts(now);
    placeholder.game = 'dota2';
    placeholder.externalMatchId = 'abc_page_does_not_exist';
    placeholder.completeness = 0.5;
    placeholder.conflictFlags = [];
    const real = buildLolFixtureFacts(now);
    real.game = 'dota2';
    real.externalMatchId = 'real-series-1';
    real.startsAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    real.completeness = 0.5;
    real.conflictFlags = [];
    expect(selectBoardSample('dota2', [placeholder, real], now.getTime())?.externalMatchId).toBe(
      'real-series-1',
    );
  });

  it('prefers a market-hinted LoL series over an unrelated dual-roster sample', () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const complete = buildLolFixtureFacts(now);
    const marketable = buildLolFixtureFacts(now);
    marketable.externalMatchId = 'rol-myth';
    marketable.id = 'lol:rol-myth';
    marketable.participants = [
      { participantId: 'Myth Esports', side: 'a', name: 'Myth Esports', source: 'liquipedia' },
      { participantId: 'Dynasty', side: 'b', name: 'Dynasty', source: 'liquipedia' },
    ];
    marketable.players = [];
    marketable.completeness = 0.71;
    const quality = marketable.facts.find((fact) => fact.factId === 'lol-data-quality');
    if (quality && typeof quality.value === 'object' && quality.value) {
      const value = quality.value as {
        bothTeamsComplete: boolean;
        sides: Array<{ complete: boolean }>;
      };
      value.bothTeamsComplete = false;
      for (const side of value.sides) side.complete = false;
    }

    const sample = selectBoardSample(
      'lol',
      [complete, marketable],
      now.getTime(),
      ['LoL: Myth Esports vs Dynasty (BO3) - Road Of Legends'],
    );
    expect(sample?.externalMatchId).toBe('rol-myth');
  });
});

function candidate(
  externalId: string,
  startsAt: string,
  status: string,
  observedHour: string,
): SourceSnapshotLike {
  return {
    game: 'cs2',
    source: 'hltv',
    entityType: 'match',
    externalId,
    name: externalId,
    startsAt,
    status,
    payload: {},
    observedAt: `2026-07-22T${observedHour}:00.000Z`,
  };
}
