import type { SeatInput } from './seats';
import { createRng, normal } from './random';

export type VarianceLevel = 'off' | 'poll-error' | 'election-night' | 'special-votes' | 'custom';

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
  // Special votes use their own shifts below, not poll noise.
  'special-votes': 0,
};

/**
 * How each party's share moved from the election-night count to the official result
 * (percentage points), approximately, in 2017, 2020 and 2023. Special votes have moved
 * results slightly to the left each time. Opportunity uses The Opportunities Party's figures.
 */
export const SPECIAL_VOTE_HISTORY: Record<string, [number, number, number]> = {
  national: [-1.6, -1.2, -0.8],
  labour: [1.1, 0.9, 0],
  greens: [0.4, 0.3, 0.8],
  act: [0, -0.4, -0.4],
  nzfirst: [-0.3, -0.1, -0.4],
  tpm: [0.1, 0.2, 0.5],
  opportunity: [0.2, 0.5, 0],
};

/**
 * Special votes: moves each party by its average past shift plus a random spread
 * about as wide as the past shifts varied, then re-rolls the close seats.
 */
function applySpecialVotes(input: SeatInput & { marginalElectorates?: MarginalElectorate[] }, seed: number): SeatInput {
  const rng = createRng(seed);
  const total = Object.values(input.partyVote).reduce((s, v) => s + v, 0);
  const partyVote: Record<string, number> = {};
  for (const [id, vote] of Object.entries(input.partyVote)) {
    const past = SPECIAL_VOTE_HISTORY[id];
    let shift = 0;
    if (past) {
      const mean = past.reduce((s, v) => s + v, 0) / past.length;
      const spread = Math.max(0.15, Math.sqrt(past.reduce((s, v) => s + (v - mean) ** 2, 0) / past.length));
      shift = mean + spread * normal(rng);
    }
    partyVote[id] = Math.max(0, (vote / total) * 100 + shift);
  }
  const newTotal = Object.values(partyVote).reduce((s, v) => s + v, 0);
  for (const id of Object.keys(partyVote)) partyVote[id] = ((partyVote[id] ?? 0) / newTotal) * 100;
  return { partyVote, ...rerollSeats(input, rng) };
}

function rerollSeats(input: SeatInput & { marginalElectorates?: MarginalElectorate[] }, rng: () => number) {
  const electorates = { ...input.electorates };
  let otherElectorates = input.otherElectorates ?? 0;
  for (const m of input.marginalElectorates ?? []) {
    if (rng() < m.holdProbability) continue;
    if (m.holder === 'independent') otherElectorates -= 1;
    else electorates[m.holder] = (electorates[m.holder] ?? 0) - 1;
    if (m.challenger === 'independent') otherElectorates += 1;
    else electorates[m.challenger] = (electorates[m.challenger] ?? 0) + 1;
  }
  return { electorates, otherElectorates };
}

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
  if (options.level === 'special-votes') return applySpecialVotes(input, options.seed);
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

  if (multiplier >= MULTIPLIER['election-night']) return { partyVote, ...rerollSeats(input, rng) };
  return { partyVote, electorates: { ...input.electorates }, otherElectorates: input.otherElectorates ?? 0 };
}
