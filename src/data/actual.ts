import actual from './actual-2026.json';

/**
 * What actually happened after the 2026 election, for the post-election check.
 * Filled in by hand once a government is announced; until then nothing shows.
 * Do not update between midnight 6 November and 7pm 7 November 2026 (NZ time).
 */
export interface ActualOutcome {
  available: boolean;
  /** Party ids in the government, largest first. */
  government: string[];
  /** Plain description, e.g. "coalition" or "coalition with confidence and supply". */
  arrangement: string;
  asOf: string;
  sourceUrl: string;
}

export const ACTUAL_2026: ActualOutcome = actual;
