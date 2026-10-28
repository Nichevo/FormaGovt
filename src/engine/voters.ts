import type { Party, Policy } from '../data/schema';
import { BASELINE, budgetFor } from './budget';
import { COMPROMISE_VALUE, concernFor, reactionTo, ruledOutBias } from './negotiation';

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
  /** Partners whose deals the player chose to reopen. */
  reopened?: string[];
  /** Cabinet roles given to partners against their seat-proportional share. */
  cabinet?: { given: number; fair: number };
}

/** Points lost for leaving out one of your own big policies, before compounding. */
export function droppedPolicyHit(policy: Policy): number {
  if (policy.isBottomLine) return 8;
  if (policy.weight >= 5) return 5;
  if (policy.weight >= 4) return 3;
  return 0;
}

/**
 * How the player's own voters feel about the deal. They like seeing their
 * party's policies in it, dislike concessions they oppose, punish a deal with a
 * party their party ruled out, and notice when the budget slides further than
 * the party said it would accept.
 */
export function voterMood({ player, programme, partners, spin, seatShare, reopened = [], cabinet }: MoodInput): VoterMood {
  const factors: MoodFactor[] = [{ label: 'Starting point', points: 35 }];
  const inDeal = new Map(programme.map((p) => [p.id, p]));

  const value = (p: Policy) => p.weight * (0.5 + p.voterSalience);
  const total = player.policies.reduce((s, p) => s + value(p), 0);
  const won = player.policies
    .filter((p) => inDeal.has(p.id))
    .reduce((s, p) => s + value(p) * (inDeal.get(p.id)!.isCompromise ? COMPROMISE_VALUE : 1), 0);
  factors.push({ label: 'Your policies in the deal', points: Math.round((45 * won) / total) });

  // Once there is a deal, voters notice the big promises given up, and several hurt more than one.
  if (partners.length > 0) {
    const hits = player.policies
      .map((p) => {
        const kept = inDeal.get(p.id);
        const hit = droppedPolicyHit(p) * (!kept ? 1 : kept.isCompromise ? 0.5 : 0);
        return { p, hit, compromised: !!kept?.isCompromise };
      })
      .filter((h) => h.hit > 0)
      .sort((a, b) => b.hit - a.hit);
    const compound = 1 + 0.15 * Math.max(0, hits.length - 1);
    for (const h of hits) {
      factors.push({
        label: `${h.compromised ? 'Watered down' : h.p.isBottomLine ? 'Dropped bottom line' : 'Dropped flagship'}: ${h.p.title}`,
        points: -Math.round(h.hit * compound),
      });
    }
  }

  let liked = 0;
  let disliked = 0;
  for (const policy of programme) {
    if (player.policies.some((p) => p.id === policy.id)) continue;
    const r = reactionTo(player, policy);
    if (r === 1) liked += 1;
    // Conceding on an issue the party ranks highly costs more.
    const salience = 0.5 + player.issueSalience[policy.issue];
    if (r === -1) disliked += 6 * concernFor(player, policy) * salience;
    if (r === -2) disliked += 14 * concernFor(player, policy) * salience;
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

  for (const name of reopened) factors.push({ label: `Reopened the deal with ${name}`, points: -3 });

  if (cabinet && cabinet.given > cabinet.fair + 1) {
    factors.push({ label: 'Gave partners more of cabinet than their seats justify', points: -3 * (cabinet.given - cabinet.fair - 1) });
  }

  if (spin !== 0) factors.push({ label: 'Press conferences', points: spin });

  const mood = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { mood, revolt: mood < REVOLT_BELOW, factors };
}
