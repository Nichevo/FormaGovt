import type { Party } from '../data/schema';
import { CURRENT_RESULT_ID } from '../data/scenarios';

/** The daily challenge plays the real 2026 result, nudged a little like a poll error. */
export const DAILY_SCENARIO_ID = CURRENT_RESULT_ID;
export const DAILY_VARIANCE = 'poll-error' as const;

/** Today's date in New Zealand as YYYYMMDD, so everyone gets the same daily game. */
export function nzDateKey(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return Number(`${get('year')}${get('month')}${get('day')}`);
}

/**
 * The daily challenge: the real 2026 result with small poll-error swings, seeded by
 * the date, and a party that rotates each day (skipping any left without seats).
 */
export function dailyChallenge(
  parties: Party[],
  seatsFor: (seed: number) => Record<string, number>,
  now: Date = new Date(),
) {
  const seed = nzDateKey(now);
  const seats = seatsFor(seed);
  const days = Math.floor(Date.UTC(Math.floor(seed / 10000), (Math.floor(seed / 100) % 100) - 1, seed % 100) / 86_400_000);
  for (let i = 0; i < parties.length; i++) {
    const party = parties[(days + i) % parties.length]!;
    if ((seats[party.id] ?? 0) > 0) {
      return { scenarioId: DAILY_SCENARIO_ID, variance: DAILY_VARIANCE, seed, playerId: party.id };
    }
  }
  return { scenarioId: DAILY_SCENARIO_ID, variance: DAILY_VARIANCE, seed, playerId: parties[0]!.id };
}
