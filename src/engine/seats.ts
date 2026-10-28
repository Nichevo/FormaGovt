/**
 * MMP seat allocation as used in New Zealand:
 * - a party qualifies with 5% of the party vote or at least one electorate seat;
 * - list seats are shared out with the Sainte-Laguë method across qualifying parties;
 * - a party keeps every electorate it wins, so wins above its entitlement become overhang seats.
 */

export const BASE_SEATS = 120;
export const THRESHOLD_PERCENT = 5;

export interface SeatInput {
  /** Party vote by party id, as percentages or raw counts. Include an "other" key for parties outside the game. */
  partyVote: Record<string, number>;
  /** Electorate seats won by each party id. */
  electorates: Record<string, number>;
  /** Electorate seats won by independents or parties that are not in partyVote. */
  otherElectorates?: number;
}

export interface PartySeats {
  partyId: string;
  votePercent: number;
  qualified: boolean;
  electorates: number;
  /** Seats the party vote entitles it to. */
  entitlement: number;
  /** Electorate wins above the entitlement. */
  overhang: number;
  total: number;
}

export interface SeatResult {
  parties: PartySeats[];
  /** Seats in the House, including overhang and independents. */
  totalSeats: number;
  majority: number;
  overhang: number;
  otherElectorates: number;
}

/** Sainte-Laguë: hand out seats one at a time to the highest quotient votes / (2s + 1). */
export function sainteLague(votes: Record<string, number>, seats: number): Record<string, number> {
  const ids = Object.keys(votes);
  const won: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < seats; i++) {
    let best: string | undefined;
    let bestQuotient = -1;
    for (const id of ids) {
      const quotient = (votes[id] ?? 0) / (2 * (won[id] ?? 0) + 1);
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        best = id;
      }
    }
    if (best === undefined) break;
    won[best] = (won[best] ?? 0) + 1;
  }
  return won;
}

export function allocateSeats(input: SeatInput): SeatResult {
  const totalVote = Object.values(input.partyVote).reduce((sum, v) => sum + v, 0);
  if (totalVote <= 0) throw new Error('Party vote must be positive');
  const otherElectorates = input.otherElectorates ?? 0;

  const partyIds = Object.keys(input.partyVote).filter((id) => id !== 'other');
  const percent = (id: string) => ((input.partyVote[id] ?? 0) / totalVote) * 100;
  const electoratesOf = (id: string) => input.electorates[id] ?? 0;
  const qualifies = (id: string) => percent(id) >= THRESHOLD_PERCENT || electoratesOf(id) > 0;

  const qualifyingVotes = Object.fromEntries(
    partyIds.filter(qualifies).map((id) => [id, input.partyVote[id] ?? 0]),
  );
  // Seats won by independents come out of the 120 before list seats are shared.
  const entitlements = sainteLague(qualifyingVotes, BASE_SEATS - otherElectorates);

  const parties = partyIds.map((id): PartySeats => {
    const entitlement = entitlements[id] ?? 0;
    const electorates = electoratesOf(id);
    const total = Math.max(entitlement, electorates);
    return {
      partyId: id,
      votePercent: percent(id),
      qualified: qualifies(id),
      electorates,
      entitlement,
      overhang: total - entitlement,
      total,
    };
  });

  const overhang = parties.reduce((sum, p) => sum + p.overhang, 0);
  const totalSeats = BASE_SEATS + overhang;
  return {
    parties,
    totalSeats,
    majority: Math.floor(totalSeats / 2) + 1,
    overhang,
    otherElectorates,
  };
}
