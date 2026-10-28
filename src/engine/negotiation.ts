import type { Party, Policy, Person } from '../data/schema';
import type { Budget } from './budget';

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
  /** Bottom lines, of either side, included in their scaled-back version. */
  compromisePolicyIds?: string[];
  /** Portfolios offered to the partner (coalition only). */
  portfolios: PortfolioId[];
  arrangement: Arrangement;
}

/** A compromise keeps this much of a policy's value to the party that wanted it. */
export const COMPROMISE_VALUE = 0.6;

/** The scaled-back version of a bottom line: softer stance, smaller budget effect. */
export function compromiseOf(policy: Policy): Policy {
  if (!policy.compromise) return policy;
  const share = policy.compromise.fiscalShare;
  return {
    ...policy,
    title: policy.compromise.title,
    summary: policy.compromise.summary,
    stance: policy.stance * 0.5,
    fiscalImpactNZDm: policy.fiscalImpactNZDm === null ? null : Math.round(policy.fiscalImpactNZDm * share),
    isCompromise: true,
  };
}

export function canCompromise(policy: Policy): boolean {
  return !!policy.compromise && policy.flex !== 'fixed';
}

/** The policies an offer puts in the programme, with compromises applied. */
export function offerPolicies(offer: Offer, player: Party, partner: Party): Policy[] {
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  return [...partner.policies, ...player.policies]
    .filter((p) => offer.partnerPolicyIds.includes(p.id) || offer.playerPolicyIds.includes(p.id))
    .map((p) => (compromised.has(p.id) && canCompromise(p) ? compromiseOf(p) : p));
}

/**
 * The cabinet a coalition partner expects. A major partner (a quarter or more of
 * the coalition's seats) wants close to its seat share and a senior role; a minor
 * partner settles for about half its share. Never less than one role.
 */
export function expectedCabinet(partner: Party, partnerSeats: number, coalitionSeats: number) {
  const share = coalitionSeats > 0 ? partnerSeats / coalitionSeats : 0;
  const major = share >= 0.25;
  const proportional = share * (PORTFOLIOS.length + 1);
  const eligible = eligiblePortfolios(partner).length;
  const expected = Math.min(eligible, Math.max(1, Math.round(major ? proportional : proportional * 0.5)));
  return { expected, major, share };
}

export const SENIOR_PORTFOLIOS: PortfolioId[] = ['deputy-pm', 'finance'];

export interface NegotiationContext {
  player: Party;
  partner: Party;
  /** The partner's trust in the player, 0 to 100. */
  trust: number;
  /** 0 on day 1 rising to 1 at the deadline. */
  pressure: number;
  /** Policies other partners have already agreed to; the partner judges the whole programme. */
  otherAgreed?: Policy[];
  /** The budget of the whole programme if this offer is agreed. */
  budget?: Budget;
  /** Cabinet roles already promised to other partners. */
  takenPortfolios?: PortfolioId[];
  /** Seats of the partner and of the whole government if it joins, for the fair share of cabinet. */
  seats?: { partner: number; coalition: number };
  /** -0.5 (losing options, keen to deal) to 1 (courted by both and pivotal). */
  leverage?: number;
  /** Changing a deal already agreed: the partner wants a little more for the trouble. */
  renegotiation?: boolean;
  /** Coming back after walking out: it needs a clearly better offer. */
  reapproach?: boolean;
  /** Parties already in the government, whose red lines a bottom line might cross. */
  currentPartners?: Party[];
}

export type ResponseKind = 'accept' | 'counter' | 'hold' | 'walk';

export interface BudgetProblem {
  kind: 'deficit' | 'cuts';
  /** NZ$m a year past the party's line. */
  over: number;
  /** So far past the line that no policy makes up for it. */
  refuse: boolean;
}

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
  counter?: { addPolicy?: Policy; compromise?: boolean; addPortfolio?: PortfolioId; cutPolicy?: Policy };
  /** The budget is past the party's line. */
  budget?: BudgetProblem;
  /** A party holding out early, while it still has options. */
  considering?: boolean;
  /** Cabinet roles offered against the partner's expectation. */
  cabinet?: { offered: number; expected: number; major: boolean };
}

/** The party's view of a programme's budget, or null when it is within its line. */
export function budgetProblemFor(partner: Party, budget: Budget | undefined): BudgetProblem | null {
  if (!budget) return null;
  const { fiscalStance, fiscalTolerance, servicesCutTolerance } = partner.personality;
  // The average yearly hit over the four years, so a lasting deficit counts for more than one bad year.
  const worsening = -budget.totalChange / budget.years.length;
  if (fiscalStance === 'spender' && servicesCutTolerance !== undefined && budget.servicesCuts > servicesCutTolerance) {
    const over = budget.servicesCuts - servicesCutTolerance;
    return { kind: 'cuts', over, refuse: over > 3000 };
  }
  let over = worsening - fiscalTolerance;
  if (fiscalStance === 'hawk' && budget.balance < 0) over = Math.max(over, -budget.balance);
  if (over <= 0) return null;
  return { kind: 'deficit', over, refuse: fiscalStance === 'hawk' && over > 2500 };
}

/**
 * Scores an offer from the partner's side. Roughly: the weighted share of its own
 * policies included, minus the cost of player policies it dislikes, plus a fair share
 * of cabinet and trust, minus any pre-election "ruled out" bias (which pressure wears
 * down) and any budget it cannot defend.
 */
export function scoreOffer(offer: Offer, ctx: NegotiationContext): number {
  const { partner, player } = ctx;
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const ownTotal = partner.policies.reduce((s, p) => s + p.weight, 0);
  const ownIncluded = partner.policies
    .filter((p) => offer.partnerPolicyIds.includes(p.id))
    .reduce((s, p) => s + p.weight * (compromised.has(p.id) && canCompromise(p) ? COMPROMISE_VALUE : 1), 0);
  let utility = ownIncluded / ownTotal;

  for (const policy of askedPolicies(offer, ctx)) {
    const r = reactionTo(partner, policy);
    if (r === 1) utility += 0.03;
    // Even a policy it can live with costs something to back.
    if (r === 0) utility -= 0.1 * concernFor(partner, policy);
    if (r === -1) utility -= 0.12 * concernFor(partner, policy);
  }

  if (offer.arrangement === 'coalition') {
    const given = offer.portfolios.length;
    if (ctx.seats) {
      const { expected, major } = expectedCabinet(partner, ctx.seats.partner, ctx.seats.coalition);
      utility += 0.07 * Math.min(given, expected) + 0.03 * Math.max(0, given - expected);
      utility -= (major ? 0.1 : 0.05) * Math.max(0, expected - given);
    } else {
      utility += 0.07 * given;
    }
  }
  utility += 0.15 * ((ctx.trust - 50) / 50);

  utility -= ruledOutBias(partner, player.id) * 0.45 * (1 - 0.6 * ctx.pressure);

  const problem = budgetProblemFor(partner, ctx.budget);
  if (problem) {
    const o = problem.over / 1000;
    const stance = partner.personality.fiscalStance;
    if (problem.kind === 'cuts') utility -= 0.08 * o;
    // Hawks feel it faster the further past their line it goes.
    else if (stance === 'hawk') utility -= 0.05 * o + 0.02 * Math.max(0, o - 1) ** 2 + (ctx.budget!.balance < 0 ? 0.05 : 0);
    else utility -= 0.05 * o;
  }
  return utility;
}

/** Everything the partner is asked to live with: the player's requests plus other partners' agreed policies. */
function askedPolicies(offer: Offer, ctx: NegotiationContext): Policy[] {
  const own = new Set(ctx.partner.policies.map((p) => p.id));
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const fromPlayer = ctx.player.policies
    .filter((p) => offer.playerPolicyIds.includes(p.id))
    .map((p) => (compromised.has(p.id) && canCompromise(p) ? compromiseOf(p) : p));
  return [...fromPlayer, ...(ctx.otherAgreed ?? []).filter((p) => !own.has(p.id))];
}

export function ruledOutBias(partner: Party, otherId: string): number {
  return partner.relationships.find((r) => r.partyId === otherId)?.ruledOutBias ?? 0;
}

/**
 * The share of the partner's weighted priorities it needs before it signs. Greedier
 * parties want more; pressure lowers the bar. A party courted by both blocs raises it
 * while it holds that leverage, more so if it likes to hold out; one running out of
 * options lowers it. Confidence and supply asks less, as the partner gives less.
 */
export function acceptanceThreshold(ctx: NegotiationContext, arrangement: Arrangement): number {
  const { greed, holdout } = ctx.partner.personality;
  let base = 0.42 + 0.2 * greed - 0.25 * ctx.pressure;
  const leverage = ctx.leverage ?? 0;
  if (leverage > 0) base += leverage * 0.12 * (0.5 + holdout) * (1 - ctx.pressure * (1 - 0.5 * holdout));
  else base += leverage * 0.12;
  if (ctx.renegotiation) base += 0.05;
  if (ctx.reapproach) base += 0.08;
  return arrangement === 'confidence-supply' ? base - 0.12 : base;
}

/** Whether a partner takes the compromise version of its own bottom line in this offer. */
function acceptsCompromise(policy: Policy, ctx: NegotiationContext, utility: number, threshold: number): boolean {
  if (!canCompromise(policy)) return false;
  if (policy.flex === 'soft') return true;
  return ctx.pressure >= 0.4 || (ctx.leverage ?? 0) < 0 || utility >= threshold + 0.05;
}

export function evaluateOffer(offer: Offer, ctx: NegotiationContext): OfferResponse {
  const { partner, player } = ctx;
  const asked = askedPolicies(offer, ctx);
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2);
  const utility = scoreOffer(offer, ctx);
  const threshold = acceptanceThreshold(ctx, offer.arrangement);
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const missingBottomLines = partner.policies.filter(
    (p) =>
      p.isBottomLine &&
      (!offer.partnerPolicyIds.includes(p.id) ||
        (compromised.has(p.id) && !acceptsCompromise(p, ctx, utility, threshold))),
  );
  const base = { utility, threshold, redLines, missingBottomLines };

  let cabinet: OfferResponse['cabinet'];
  if (offer.arrangement === 'coalition' && ctx.seats) {
    const { expected, major } = expectedCabinet(partner, ctx.seats.partner, ctx.seats.coalition);
    cabinet = { offered: offer.portfolios.length, expected, major };
  }

  if (redLines.length > 0) {
    return { kind: 'walk', ...base, cabinet };
  }
  if (missingBottomLines.length > 0) {
    // A missing bottom line is always the first thing a partner asks for. If the full
    // version would cross someone else's red line, it offers its compromise instead.
    const wanted = [...missingBottomLines].sort((a, b) => b.weight - a.weight)[0]!;
    const clashes = [player, ...(ctx.currentPartners ?? [])].some((p) => reactionTo(p, wanted) === -2);
    const compromise = clashes && canCompromise(wanted) && !compromised.has(wanted.id);
    return { kind: 'counter', ...base, cabinet, counter: { addPolicy: wanted, compromise } };
  }

  const problem = budgetProblemFor(partner, ctx.budget);
  if (problem && partner.personality.fiscalStance !== 'balanced') {
    if (problem.refuse) return { kind: 'hold', ...base, cabinet, budget: problem };
    if (utility < threshold + 0.1) {
      // It asks to trim what others want before anything of its own.
      const own = new Set(partner.policies.map((p) => p.id));
      const policies = offerPolicies(offer, player, partner).filter((p) => !own.has(p.id));
      const cut =
        problem.kind === 'cuts'
          ? policies.filter((p) => p.fiscalType === 'spending' && (p.fiscalImpactNZDm ?? 0) > 0).sort((a, b) => b.fiscalImpactNZDm! - a.fiscalImpactNZDm!)[0]
          : policies.filter((p) => (p.fiscalImpactNZDm ?? 0) < 0).sort((a, b) => a.fiscalImpactNZDm! - b.fiscalImpactNZDm!)[0];
      // Only worth asking for if dropping it would make a real dent.
      const dent = cut ? Math.abs(cut.fiscalImpactNZDm ?? 0) >= problem.over * 0.25 : false;
      if (cut && dent) return { kind: 'counter', ...base, cabinet, budget: problem, counter: { cutPolicy: cut } };
    }
  }

  // A major partner will not sit in a cabinet without a senior role.
  if (cabinet?.major && offer.arrangement === 'coalition') {
    const free = (id: PortfolioId) => !offer.portfolios.includes(id) && !(ctx.takenPortfolios ?? []).includes(id);
    const hasSenior = offer.portfolios.some((p) => SENIOR_PORTFOLIOS.includes(p));
    const senior = SENIOR_PORTFOLIOS.find((id) => free(id) && eligiblePortfolios(partner).includes(id));
    if (!hasSenior && senior) return { kind: 'counter', ...base, cabinet, counter: { addPortfolio: senior } };
    if (offer.portfolios.length === 0) {
      const any = eligiblePortfolios(partner).find(free);
      if (any) return { kind: 'counter', ...base, cabinet, counter: { addPortfolio: any } };
    }
  }

  if (utility >= threshold) {
    // A party that likes to hold out keeps its options open early on, unless the offer is outstanding.
    const early = ctx.pressure < 0.35 && (ctx.leverage ?? 0) > 0;
    if (partner.personality.holdout >= 0.7 && early && utility < threshold + 0.1) {
      return { kind: 'hold', ...base, cabinet, considering: true };
    }
    return { kind: 'accept', ...base, cabinet };
  }

  if (utility >= threshold - 0.18) {
    const nextPolicy = partner.policies
      .filter((p) => !offer.partnerPolicyIds.includes(p.id))
      .sort((a, b) => b.weight - a.weight)[0];
    if (nextPolicy) {
      return { kind: 'counter', ...base, cabinet, counter: { addPolicy: nextPolicy } };
    }
    if (offer.arrangement === 'coalition') {
      const portfolio = eligiblePortfolios(partner).find(
        (p) => !offer.portfolios.includes(p) && !(ctx.takenPortfolios ?? []).includes(p),
      );
      if (portfolio) {
        return { kind: 'counter', ...base, cabinet, counter: { addPortfolio: portfolio } };
      }
    }
  }

  const sticking = asked
    .filter((p) => reactionTo(partner, p) === -1)
    .sort((a, b) => concernFor(partner, b) - concernFor(partner, a))[0];
  return { kind: 'hold', ...base, cabinet, sticking, budget: problem ?? undefined };
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
