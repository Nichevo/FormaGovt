import type { Party } from '../data/schema';
import { leaderOf } from './dialogue';
import { bestPersonFor, PORTFOLIOS } from './negotiation';
import { takenPortfolios, type GameState } from './game';

export interface CabinetSeat {
  role: string;
  person: string;
  partyId: string;
}

/**
 * The cabinet the deals produce: the player's leader is Prime Minister, partners
 * hold the roles they were promised, and the player fills the rest from its own
 * MPs where it has someone with the skills.
 */
export function cabinetOf(state: GameState, parties: Party[]): CabinetSeat[] {
  const player = parties.find((p) => p.id === state.playerId)!;
  const promised = takenPortfolios(state);
  for (const [portfolio, holder] of [...promised]) {
    if (state.partners[holder]?.status !== 'signed') promised.delete(portfolio);
  }
  const seats: CabinetSeat[] = [{ role: 'Prime Minister', person: leaderOf(player), partyId: player.id }];
  for (const portfolio of PORTFOLIOS) {
    const holderId = promised.get(portfolio.id) ?? player.id;
    const holder = parties.find((p) => p.id === holderId)!;
    const person = bestPersonFor(holder, portfolio.id);
    seats.push({
      role: portfolio.label,
      person: person?.name ?? `${holder.name} MP`,
      partyId: holder.id,
    });
  }
  return seats;
}
