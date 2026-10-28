import type { SeatInput } from './seats';
import { createRng, normal } from './random';

export type VarianceLevel = 'off' | 'poll-error' | 'election-night' | 'custom';

export interface VarianceOptions {
  level: VarianceLevel;
  seed: number;
  /** Noise multiplier for the custom level; poll error is 1.5 and election night is 3. */
  customMultiplier?: number;
}

/** A seat a party holds that could fall to a challenger on election night. */
export interface MarginalElectorate {
  seat: string;
  holder: string;
  challenger: string;
  /** Chance the holder keeps the seat, 0 to 1. */
  holdProbability: number;
}

const MULTIPLIER: Record<Exclude<VarianceLevel, 'custom'>, number> = {
  off: 0,
  'poll-error': 1.5,
  'election-night': 3,
};

/** Effective sample size used to size the noise like a typical 1,000-person poll. */
const SAMPLE_SIZE = 1000;

export function varianceMultiplier(options: VarianceOptions): number {
  return options.level === 'custom' ? (options.customMultiplier ?? 1.5) : MULTIPLIER[options.level];
}

/**
 * Moves each party's vote by random noise sized like real polling error
 * (about ±2 points for a party on 30%, much less for small parties), then
 * re-rolls marginal electorates on the bigger settings.
 */
export function applyVariance(
  input: SeatInput & { marginalElectorates?: MarginalElectorate[] },
  options: VarianceOptions,
): SeatInput {
  const multiplier = varianceMultiplier(options);
  if (multiplier === 0) return input;
  const rng = createRng(options.seed);

  const total = Object.values(input.partyVote).reduce((s, v) => s + v, 0);
  const partyVote: Record<string, number> = {};
  for (const [id, vote] of Object.entries(input.partyVote)) {
    const share = vote / total;
    const sd = multiplier * Math.sqrt((share * (1 - share)) / SAMPLE_SIZE);
    partyVote[id] = Math.max(0, share + sd * normal(rng)) * 100;
  }
  // Scale back to 100% so the noise moves shares rather than inventing votes.
  const newTotal = Object.values(partyVote).reduce((s, v) => s + v, 0);
  for (const id of Object.keys(partyVote)) partyVote[id] = ((partyVote[id] ?? 0) / newTotal) * 100;

  const electorates = { ...input.electorates };
  let otherElectorates = input.otherElectorates ?? 0;
  if (multiplier >= MULTIPLIER['election-night']) {
    for (const m of input.marginalElectorates ?? []) {
      if (rng() < m.holdProbability) continue;
      if (m.holder === 'independent') otherElectorates -= 1;
      else electorates[m.holder] = (electorates[m.holder] ?? 0) - 1;
      if (m.challenger === 'independent') otherElectorates += 1;
      else electorates[m.challenger] = (electorates[m.challenger] ?? 0) + 1;
    }
  }
  return { partyVote, electorates, otherElectorates };
}
