import { describe, expect, it } from 'vitest';
import { PARTIES } from '../data/parties';
import { dailyChallenge, nzDateKey } from './daily';

describe('daily challenge', () => {
  it('uses the New Zealand date', () => {
    // 11:30 UTC on 1 Dec is already 2 Dec in New Zealand (NZDT, UTC+13).
    expect(nzDateKey(new Date('2026-12-01T11:30:00Z'))).toBe(20261202);
  });

  it('is the same all day and rotates the party between days', () => {
    const seats = () => Object.fromEntries(PARTIES.map((p) => [p.id, 10]));
    const a = dailyChallenge(PARTIES, seats, new Date('2026-12-02T00:00:00+13:00'));
    const b = dailyChallenge(PARTIES, seats, new Date('2026-12-02T23:00:00+13:00'));
    const c = dailyChallenge(PARTIES, seats, new Date('2026-12-03T12:00:00+13:00'));
    expect(a).toEqual(b);
    expect(c.playerId).not.toBe(a.playerId);
  });

  it('skips a party with no seats', () => {
    const seats = () => Object.fromEntries(PARTIES.map((p) => [p.id, 0]).concat([['labour', 30]]));
    expect(dailyChallenge(PARTIES, seats).playerId).toBe('labour');
  });
});
