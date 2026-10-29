import { describe, expect, it } from 'vitest';
import { fromHistory } from './achievementStore';
import type { PlayRecord } from './history';

const rec = (o: Partial<PlayRecord>): PlayRecord => ({
  id: String(Math.random()),
  at: '2026-10-28T01:00:00.000Z',
  playerId: 'labour',
  scenarioId: 'poll-average',
  variance: 'off',
  seed: 1,
  scenarioLabel: 'Poll average',
  outcome: 'won',
  score: 70,
  partners: ['greens'],
  ...o,
});

describe('achievements from play history', () => {
  it('credits what older games earned', () => {
    const got = fromHistory([
      rec({ at: '2026-10-28T02:00:00.000Z', score: 85 }),
      rec({ at: '2026-10-28T01:00:00.000Z', scenarioId: 'election-2017' }),
      rec({ outcome: 'lost', daily: true }),
    ]);
    expect(got['first-government']).toBe('2026-10-28T01:00:00.000Z');
    expect(got['high-score']).toBe('2026-10-28T02:00:00.000Z');
    expect(got.history).toBeDefined();
    expect(got.daily).toBeDefined();
    expect(got['every-party']).toBeUndefined();
  });

  it('gives nothing for losses alone', () => {
    expect(fromHistory([rec({ outcome: 'lost', score: 0 })])).toEqual({});
  });
});
