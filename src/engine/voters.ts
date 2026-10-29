import type { Party, Policy } from '../data/schema';
import { BASELINE, budgetFor } from './budget';
import { COMMITMENT_VALUE, concernFor, deliveryValue, reactionTo, ruledOutBias } from './negotiation';

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
  /** v1.2: policies a confidence and supply partner got, which weigh half as much on these voters. */
  csPolicyIds?: Set<string>;
  /** v1.2: partners on confidence and supply, whose deals voters judge more lightly. */
  csPartnerIds?: Set<string>;
  /** v1.2: policies set aside under an agree-to-disagree clause. */
  setAsideIds?: Set<string>;
  /** v1.2: mood points from surviving a leadership challenge. */
  rally?: number;
}

/** v1.2: share of the dropped-policy hit voters still feel when a policy gets a lesser commitment. */
const SOFT_HIT = { committee: 0.75, 'members-bill': 0.85 } as const;
/** v1.2: share of the dropped-policy hit voters still feel when a policy is set aside by agreement. */
const SET_ASIDE_HIT = 0.5;

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
export function voterMood({
  player,
  programme,
  partners,
  spin,
  seatShare,
  reopened = [],
  cabinet,
  csPolicyIds,
  csPartnerIds,
  setAsideIds,
  rally,
}: MoodInput): VoterMood {
  const factors: MoodFactor[] = [{ label: 'Starting point', points: 35 }];
  const inDeal = new Map(programme.map((p) => [p.id, p]));

  const value = (p: Policy) => p.weight * (0.5 + p.voterSalience);
  const total = player.policies.reduce((s, p) => s + value(p), 0);
  const won = player.policies
    .filter((p) => inDeal.has(p.id))
    .reduce((s, p) => s + value(p) * deliveryValue(inDeal.get(p.id)!), 0);
  factors.push({ label: 'Your policies in the deal', points: Math.round((45 * won) / total) });

  // Once there is a deal, voters notice the big promises given up, and several hurt more than one.
  if (partners.length > 0) {
    const hits = player.policies
      .map((p) => {
        const kept = inDeal.get(p.id);
        // A bottom line met by one of its stand-ins is not a dropped promise.
        const covered =
          !kept && p.isBottomLine && (p.orPolicyIds ?? []).some((id) => inDeal.has(id) && deliveryValue(inDeal.get(id)!) === 1);
        const asideHere = !kept && !!setAsideIds?.has(p.id);
        const share = !kept
          ? asideHere
            ? SET_ASIDE_HIT
            : 1
          : kept.commitment
            ? SOFT_HIT[kept.commitment]
            : kept.isCompromise
              ? 0.5
              : 0;
        const hit = covered ? 0 : droppedPolicyHit(p) * share;
        const label = asideHere
          ? 'Set aside by agreement'
          : kept?.commitment === 'committee'
            ? 'Sent to select committee'
            : kept?.commitment === 'members-bill'
              ? "Members' bill only"
              : kept?.isCompromise
                ? 'Watered down'
                : p.isBottomLine
                  ? 'Dropped bottom line'
                  : 'Dropped flagship';
        return { p, hit, label };
      })
      .filter((h) => h.hit > 0)
      .sort((a, b) => b.hit - a.hit);
    const compound = 1 + 0.15 * Math.max(0, hits.length - 1);
    for (const h of hits) {
      factors.push({ label: `${h.label}: ${h.p.title}`, points: -Math.round(h.hit * compound) });
    }
  }

  let liked = 0;
  let disliked = 0;
  for (const policy of programme) {
    if (player.policies.some((p) => p.id === policy.id)) continue;
    const r = reactionTo(player, policy);
    if (r === 1) liked += 1;
    // Conceding on an issue the party ranks highly costs more; less for a lesser commitment or a C&S partner's policy.
    const salience =
      (0.5 + player.issueSalience[policy.issue]) *
      (policy.commitment ? COMMITMENT_VALUE[policy.commitment] : 1) *
      (csPolicyIds?.has(policy.id) ? 0.5 : 1);
    if (r === -1) disliked += 6 * concernFor(player, policy) * salience;
    if (r === -2) disliked += 14 * concernFor(player, policy) * salience;
  }
  if (liked > 0) factors.push({ label: 'Partner policies your voters like', points: Math.min(8, liked) });
  if (disliked > 0) factors.push({ label: 'Concessions your voters oppose', points: -Math.round(disliked) });

  // Voters expect the agreement to look like their party in proportion to its seats.
  const looser = (p: Policy) => (csPolicyIds?.has(p.id) ? 0.5 : 1);
  const programmeWeight = programme.reduce((s, p) => s + p.weight * looser(p), 0);
  const ownWeight = programme.filter((p) => player.policies.some((own) => own.id === p.id)).reduce((s, p) => s + p.weight, 0);
  if (partners.length > 0 && programmeWeight > 0) {
    const gap = seatShare - ownWeight / programmeWeight;
    if (gap > 0.05) factors.push({ label: 'Partners got more than their seats justify', points: -Math.min(20, Math.round(gap * 50)) });
  }

  for (const partner of partners) {
    const bias = ruledOutBias(player, partner.id);
    const scale = csPartnerIds?.has(partner.id) ? 0.5 : 1;
    if (bias > 0) factors.push({ label: `Working with ${partner.name} after ruling it out`, points: -Math.round(bias * 20 * scale) });
  }

  const slide = BASELINE.balanceNZDm - budgetFor(programme).balance - player.personality.fiscalTolerance;
  if (slide > 0) factors.push({ label: 'Budget worse than your party promised', points: -Math.min(20, Math.round((slide / 1000) * 4)) });

  for (const name of reopened) factors.push({ label: `Reopened the deal with ${name}`, points: -3 });

  if (cabinet && cabinet.given > cabinet.fair + 1) {
    factors.push({ label: 'Gave partners more of cabinet than their seats justify', points: -3 * (cabinet.given - cabinet.fair - 1) });
  }

  if (spin !== 0) factors.push({ label: 'Press conferences', points: spin });

  // Setting aside another party's policy still asks your voters to accept the disagreement.
  const theirsAside = [...(setAsideIds ?? [])].filter((id) => !player.policies.some((p) => p.id === id)).length;
  if (theirsAside > 0) factors.push({ label: 'Agreed to disagree with a partner', points: -2 * theirsAside });

  if (rally) factors.push({ label: 'Survived a leadership challenge', points: rally });

  const mood = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { mood, revolt: mood < REVOLT_BELOW, factors };
}
