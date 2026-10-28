import type { Party, Policy, Person } from '../data/schema';

/**
 * How a party feels about a policy:
 *  2 its own policy, 1 supports, 0 can accept, -1 opposes, -2 red line (breaks one of its bottom lines).
 */
export type Reaction = -2 | -1 | 0 | 1 | 2;

export const REACTION_LABELS: Record<Reaction, string> = {
  2: 'Own policy',
  1: 'Supports',
  0: 'Can accept',
  [-1]: 'Opposes',
  [-2]: 'Red line',
};

/** The party a policy belongs to. */
export function ownerOf(parties: Party[], policyId: string): Party | undefined {
  return parties.find((p) => p.policies.some((pol) => pol.id === policyId));
}

/**
 * A party's reaction to another party's policy, derived from the gap between the
 * policy's stance and the party's own stance on that issue. A policy that clashes
 * hard with one of the party's bottom lines on the same issue is a red line.
 */
export function reactionTo(party: Party, policy: Policy): Reaction {
  if (party.policies.some((p) => p.id === policy.id)) return 2;
  const clashesWithBottomLine = party.policies.some(
    (own) =>
      own.isBottomLine &&
      own.issue === policy.issue &&
      Math.abs(own.stance - policy.stance) >= 3.25 &&
      Math.sign(own.stance) !== Math.sign(policy.stance),
  );
  if (clashesWithBottomLine) return -2;
  const gap = Math.abs(party.issueStance[policy.issue] - policy.stance);
  if (gap <= 0.75) return 1;
  if (gap <= 1.75) return 0;
  return -1;
}

/** How much a party cares about another party's policy, 0 to about 1. */
export function concernFor(party: Party, policy: Policy): number {
  return party.issueSalience[policy.issue] * (0.4 + 0.12 * policy.weight);
}

export const PORTFOLIOS = [
  { id: 'deputy-pm', label: 'Deputy Prime Minister', skills: ['leadership'] },
  { id: 'finance', label: 'Finance', skills: ['finance', 'economics'] },
  { id: 'health', label: 'Health', skills: ['health'] },
  { id: 'foreign-affairs', label: 'Foreign Affairs', skills: ['foreign-affairs'] },
  { id: 'justice', label: 'Justice', skills: ['justice'] },
  { id: 'housing', label: 'Housing', skills: ['housing'] },
  { id: 'climate', label: 'Climate Change', skills: ['environment'] },
  { id: 'maori-development', label: 'Māori Development', skills: ['maori-development'] },
  { id: 'social-development', label: 'Social Development', skills: ['social-services'] },
  { id: 'regional-development', label: 'Regional Development', skills: ['regional-development'] },
  { id: 'regulation', label: 'Regulation', skills: ['regulation'] },
  { id: 'education', label: 'Education', skills: ['education'] },
] as const;
export type PortfolioId = (typeof PORTFOLIOS)[number]['id'];

/** The most experienced person in the party with a skill the portfolio needs, if any. */
export function bestPersonFor(party: Party, portfolioId: PortfolioId): Person | undefined {
  const skills: readonly string[] = PORTFOLIOS.find((p) => p.id === portfolioId)!.skills;
  // The closest skill match wins (Finance prefers a finance skill over economics), then experience.
  const matchRank = (person: Person) => Math.min(...person.skills.map((s) => (skills.includes(s) ? skills.indexOf(s) : 99)));
  return party.people
    .filter((person) => matchRank(person) < 99)
    .sort((a, b) => matchRank(a) - matchRank(b) || b.experience - a.experience)[0];
}

/** Portfolios a party can claim: only those where it has an MP with the right skills. */
export function eligiblePortfolios(party: Party): PortfolioId[] {
  return PORTFOLIOS.filter((p) => bestPersonFor(party, p.id)).map((p) => p.id);
}

export type Arrangement = 'coalition' | 'confidence-supply';

export interface Offer {
  partnerId: string;
  /** The partner's policies the player agrees to include. */
  partnerPolicyIds: string[];
  /** The player's policies the partner is asked to support. */
  playerPolicyIds: string[];
  /** Portfolios offered to the partner (coalition only). */
  portfolios: PortfolioId[];
  arrangement: Arrangement;
}

export interface NegotiationContext {
  player: Party;
  partner: Party;
  /** The partner's trust in the player, 0 to 100. */
  trust: number;
  /** 0 on day 1 rising to 1 at the deadline. */
  pressure: number;
  /** Policies other partners have already agreed to; the partner judges the whole programme. */
  otherAgreed?: Policy[];
  /** Change to the operating balance (NZ$m a year) from the whole programme if this offer is agreed. */
  budgetChange?: number;
}

export type ResponseKind = 'accept' | 'counter' | 'hold' | 'walk';

export interface OfferResponse {
  kind: ResponseKind;
  utility: number;
  threshold: number;
  /** For a walk-out: the policies that crossed a red line, or the bottom lines left out. */
  redLines: Policy[];
  missingBottomLines: Policy[];
  /** For a hold-out: the player's policy costing the most. */
  sticking?: Policy;
  /** For a counter: the change the partner asks for. */
  counter?: { addPolicy?: Policy; addPortfolio?: PortfolioId };
}

/**
 * Scores an offer from the partner's side. Roughly: the weighted share of its own
 * policies included, minus the cost of player policies it dislikes, plus portfolios
 * and trust, minus any pre-election "ruled out" bias (which pressure wears down).
 */
export function scoreOffer(offer: Offer, ctx: NegotiationContext): number {
  const { partner, player } = ctx;
  const ownTotal = partner.policies.reduce((s, p) => s + p.weight, 0);
  const ownIncluded = partner.policies
    .filter((p) => offer.partnerPolicyIds.includes(p.id))
    .reduce((s, p) => s + p.weight, 0);
  let utility = ownIncluded / ownTotal;

  for (const policy of askedPolicies(offer, ctx)) {
    const r = reactionTo(partner, policy);
    if (r === 1) utility += 0.03;
    // Even a policy it can live with costs something to back.
    if (r === 0) utility -= 0.1 * concernFor(partner, policy);
    if (r === -1) utility -= 0.12 * concernFor(partner, policy);
  }

  if (offer.arrangement === 'coalition') utility += 0.07 * offer.portfolios.length;
  utility += 0.15 * ((ctx.trust - 50) / 50);

  utility -= ruledOutBias(partner, player.id) * 0.45 * (1 - 0.6 * ctx.pressure);

  // A party balks when the programme digs the deficit deeper than it can defend.
  const overspend = -(ctx.budgetChange ?? 0) - partner.personality.fiscalTolerance;
  if (overspend > 0) utility -= 0.08 * (overspend / 1000);
  return utility;
}

/** Everything the partner is asked to live with: the player's requests plus other partners' agreed policies. */
function askedPolicies(offer: Offer, ctx: NegotiationContext): Policy[] {
  const own = new Set(ctx.partner.policies.map((p) => p.id));
  const fromPlayer = ctx.player.policies.filter((p) => offer.playerPolicyIds.includes(p.id));
  return [...fromPlayer, ...(ctx.otherAgreed ?? []).filter((p) => !own.has(p.id))];
}

export function ruledOutBias(partner: Party, otherId: string): number {
  return partner.relationships.find((r) => r.partyId === otherId)?.ruledOutBias ?? 0;
}

/**
 * The share of the partner's weighted priorities it needs before it signs. Greedier
 * parties want more; pressure lowers the bar. Confidence and supply asks less, as the
 * partner gives less.
 */
export function acceptanceThreshold(ctx: NegotiationContext, arrangement: Arrangement): number {
  const base = 0.42 + 0.2 * ctx.partner.personality.greed - 0.25 * ctx.pressure;
  return arrangement === 'confidence-supply' ? base - 0.12 : base;
}

export function evaluateOffer(offer: Offer, ctx: NegotiationContext): OfferResponse {
  const { partner } = ctx;
  const asked = askedPolicies(offer, ctx);
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2);
  const missingBottomLines = partner.policies.filter(
    (p) => p.isBottomLine && !offer.partnerPolicyIds.includes(p.id),
  );
  const utility = scoreOffer(offer, ctx);
  const threshold = acceptanceThreshold(ctx, offer.arrangement);

  if (redLines.length > 0) {
    return { kind: 'walk', utility, threshold, redLines, missingBottomLines };
  }
  if (missingBottomLines.length > 0) {
    // A missing bottom line is always the first thing a partner asks for.
    return {
      kind: 'counter',
      utility,
      threshold,
      redLines,
      missingBottomLines,
      counter: { addPolicy: missingBottomLines.sort((a, b) => b.weight - a.weight)[0] },
    };
  }
  if (utility >= threshold) return { kind: 'accept', utility, threshold, redLines, missingBottomLines };

  if (utility >= threshold - 0.18) {
    const nextPolicy = partner.policies
      .filter((p) => !offer.partnerPolicyIds.includes(p.id))
      .sort((a, b) => b.weight - a.weight)[0];
    if (nextPolicy) {
      return { kind: 'counter', utility, threshold, redLines, missingBottomLines, counter: { addPolicy: nextPolicy } };
    }
    if (offer.arrangement === 'coalition') {
      const portfolio = eligiblePortfolios(partner).find((p) => !offer.portfolios.includes(p));
      if (portfolio) {
        return { kind: 'counter', utility, threshold, redLines, missingBottomLines, counter: { addPortfolio: portfolio } };
      }
    }
  }

  const sticking = asked
    .filter((p) => reactionTo(partner, p) === -1)
    .sort((a, b) => concernFor(partner, b) - concernFor(partner, a))[0];
  return { kind: 'hold', utility, threshold, redLines, missingBottomLines, sticking };
}

/** 0 to 100: how close two parties are across all the policies they care about. */
export function compatibility(a: Party, b: Party): number {
  const score = (from: Party, to: Party) => {
    let total = 0;
    let weight = 0;
    for (const policy of to.policies) {
      const concern = concernFor(from, policy);
      const r = reactionTo(from, policy);
      total += concern * (r === -2 ? 0 : r === -1 ? 0.25 : r === 0 ? 0.6 : 1);
      weight += concern;
    }
    return weight === 0 ? 1 : total / weight;
  };
  return Math.round(((score(a, b) + score(b, a)) / 2) * 100);
}
