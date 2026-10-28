import { describe, expect, it } from 'vitest';
import { isElectionDay } from './electionDay';

describe('isElectionDay', () => {
  it('covers all of 7 November in New Zealand time', () => {
    expect(isElectionDay(Date.parse('2026-11-07T00:00:00+13:00'))).toBe(true);
    expect(isElectionDay(Date.parse('2026-11-07T19:00:00+13:00'))).toBe(true);
    expect(isElectionDay(Date.parse('2026-11-07T23:59:59+13:00'))).toBe(true);
  });

  it('is off either side of the day', () => {
    expect(isElectionDay(Date.parse('2026-11-06T23:59:59+13:00'))).toBe(false);
    expect(isElectionDay(Date.parse('2026-11-08T00:00:00+13:00'))).toBe(false);
  });
});
