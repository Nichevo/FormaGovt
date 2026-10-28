/**
 * The game is switched off for the whole of election day, 7 November 2026, New
 * Zealand time (NZDT, UTC+13). The window is fixed in UTC so it holds wherever
 * the player is.
 */
export const ELECTION_DAY_START = Date.UTC(2026, 10, 6, 11, 0, 0); // 00:00 7 Nov NZDT
export const ELECTION_DAY_END = Date.UTC(2026, 10, 7, 11, 0, 0); // 00:00 8 Nov NZDT

export function isElectionDay(now: number = Date.now()): boolean {
  return now >= ELECTION_DAY_START && now < ELECTION_DAY_END;
}
