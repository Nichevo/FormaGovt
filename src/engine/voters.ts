import type { Party, Policy } from '../data/schema';
import { BASELINE, budgetFor } from './budget';
import { concernFor, reactionTo, ruledOutBias } from './negotiation';

export interface MoodFactor {
  label: string;
  points: number;
}

export interface VoterMood {
  /** 0 to 100. */
  mood: number;
  /** Below this the party's own voters revolt and the final score drops. */
  revolt: boolean;
  factors: MoodFactor[];
}

export const REVOLT_BELOW = 35;

export interface MoodInput {
  player: Party;
  /** Every policy in the government's programme, the player's and its partners'. */
  programme: Policy[];
  partners: Party[];
  /** Points from press conferences so far. */
  spin: number;
  /** The player's share of the government's seats, 0 to 1. */
  seatShare: number;
}

/**
 * How the player's own voters feel about the deal. They like seeing their
 * party's policies in it, dislike concessions they oppose, punish a deal with a
 * party their party ruled out, and notice when the budget slides further than
 * the party said it would accept.
 */
export function voterMood({ player, programme, partners, spin, seatShare }: MoodInput): VoterMood {
  const factors: MoodFactor[] = [{ label: 'Starting point', points: 35 }];
  const ids = new Set(programme.map((p) => p.id));

  const value = (p: Policy) => p.weight * (0.5 + p.voterSalience);
  const total = player.policies.reduce((s, p) => s + value(p), 0);
  const won = player.policies.filter((p) => ids.has(p.id)).reduce((s, p) => s + value(p), 0);
  factors.push({ label: 'Your policies in the deal', points: Math.round((45 * won) / total) });

  let liked = 0;
  let disliked = 0;
  for (const policy of programme) {
    if (player.policies.some((p) => p.id === policy.id)) continue;
    const r = reactionTo(player, policy);
    if (r === 1) liked += 1;
    if (r === -1) disliked += 6 * concernFor(player, policy);
    if (r === -2) disliked += 14 * concernFor(player, policy);
  }
  if (liked > 0) factors.push({ label: 'Partner policies your voters like', points: Math.min(8, liked) });
  if (disliked > 0) factors.push({ label: 'Concessions your voters oppose', points: -Math.round(disliked) });

  // Voters expect the agreement to look like their party in proportion to its seats.
  const programmeWeight = programme.reduce((s, p) => s + p.weight, 0);
  const ownWeight = programme.filter((p) => player.policies.some((own) => own.id === p.id)).reduce((s, p) => s + p.weight, 0);
  if (partners.length > 0 && programmeWeight > 0) {
    const gap = seatShare - ownWeight / programmeWeight;
    if (gap > 0.05) factors.push({ label: 'Partners got more than their seats justify', points: -Math.min(20, Math.round(gap * 50)) });
  }

  for (const partner of partners) {
    const bias = ruledOutBias(player, partner.id);
    if (bias > 0) factors.push({ label: `Working with ${partner.name} after ruling it out`, points: -Math.round(bias * 20) });
  }

  const slide = BASELINE.balanceNZDm - budgetFor(programme).balance - player.personality.fiscalTolerance;
  if (slide > 0) factors.push({ label: 'Budget worse than your party promised', points: -Math.min(20, Math.round((slide / 1000) * 4)) });

  if (spin !== 0) factors.push({ label: 'Press conferences', points: spin });

  const mood = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { mood, revolt: mood < REVOLT_BELOW, factors };
}
