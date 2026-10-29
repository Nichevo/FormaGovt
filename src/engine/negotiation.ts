import type { Party, Policy, Person } from '../data/schema';
import { budgetFor, type Budget } from './budget';
import type { Rules } from './rules';

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
  /** v1.2: policies agreed only as a select committee referral or a members' bill. */
  commitments?: Record<string, Commitment>;
  /** v1.2 agree to disagree: one policy, from either side, set aside from the deal. */
  setAsideIds?: string[];
}

/** A lesser promise than putting a policy in the agreement. */
export type Commitment = 'committee' | 'members-bill';

/** How much of a policy's value a lesser commitment keeps, for the party that wanted it and for the side backing it. */
export const COMMITMENT_VALUE: Record<Commitment, number> = { committee: 0.25, 'members-bill': 0.15 };

export const COMMITMENT_LABELS: Record<Commitment, string> = {
  committee: 'Send to select committee',
  'members-bill': "Support a members' bill",
};

/** Lesser commitments allowed in one deal, both sides together. */
export const MAX_SOFT_COMMITMENTS = 3;

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

/** A policy only sent to select committee or backed as a members' bill: nothing is enacted or funded. */
export function softOf(policy: Policy, commitment: Commitment): Policy {
  return { ...policy, commitment, isCompromise: undefined, fiscalImpactNZDm: 0, fiscalByYear: undefined };
}

/** The share of a policy's value delivered by the version in the programme. */
export function deliveryValue(policy: Policy): number {
  if (policy.commitment) return COMMITMENT_VALUE[policy.commitment];
  return policy.isCompromise ? COMPROMISE_VALUE : 1;
}

/** The policies an offer puts in the programme, with compromises and lesser commitments applied. */
export function offerPolicies(offer: Offer, player: Party, partner: Party): Policy[] {
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const soft = offer.commitments ?? {};
  return [...partner.policies, ...player.policies]
    .filter((p) => (offer.partnerPolicyIds.includes(p.id) || offer.playerPolicyIds.includes(p.id)) && !(offer.setAsideIds ?? []).includes(p.id))
    .map((p) => (soft[p.id] ? softOf(p, soft[p.id]!) : compromised.has(p.id) && canCompromise(p) ? compromiseOf(p) : p));
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
  /** The rules the game is played under; v1.1 when absent. */
  rules?: Rules;
  /** v1.2: the partner's own voters' mood if this offer went ahead. */
  partnerMoodOf?: (offer: Offer) => number;
}

/** v1.2: a partner will not sign a deal that leaves its own voters' mood below this. */
export const CAUCUS_FLOOR = 45;

/**
 * v1.2: how firmly a party holds its bottom lines, 1 on day 1. A party with 13 or more
 * seats never softens; 8 to 12 seats softens to 0.9 and 7 or fewer to 0.8 by the
 * deadline. A party that likes to hold out softens half as fast.
 */
export function bottomLineFirmness(partner: Party, seats: number | undefined, pressure: number): number {
  const s = seats ?? 99;
  const drop = s >= 13 ? 0 : s >= 8 ? 0.1 : 0.2;
  return 1 - drop * Math.min(1, pressure) * (1 - 0.5 * partner.personality.holdout);
}

/** How far past its usual bar an offer must be for a party this firm to sign without a bottom line. */
export function firmnessMargin(firmness: number): number {
  return firmness >= 0.999 ? Infinity : 0.08 + (firmness - 0.8) * 0.7;
}

function firmnessOf(ctx: NegotiationContext): number {
  return ctx.rules?.softening ? bottomLineFirmness(ctx.partner, ctx.seats?.partner, ctx.pressure) : 1;
}

export type ResponseKind = 'accept' | 'counter' | 'hold' | 'walk';

export interface BudgetProblem {
  kind: 'deficit' | 'cuts';
  /** NZ$m a year past the party's line. */
  over: number;
  /** So far past the line that no policy makes up for it. */
  refuse: boolean;
  /** The agreement items whose change would bring the budget back within the line. */
  fix?: BudgetFixPlan;
}

export interface BudgetFix {
  policy: Policy;
  /** Take it out, or swap in its compromise version. */
  action: 'drop' | 'compromise';
  /** NZ$m a year this change takes off the problem. */
  saving: number;
}

export interface BudgetFixPlan {
  items: BudgetFix[];
  /** True when these changes together clear the problem. */
  enough: boolean;
}

function withChange(offer: Offer, fix: BudgetFix): Offer {
  if (fix.action === 'compromise') return { ...offer, compromisePolicyIds: [...new Set([...(offer.compromisePolicyIds ?? []), fix.policy.id])] };
  const out = (ids: string[]) => ids.filter((id) => id !== fix.policy.id);
  return { ...offer, partnerPolicyIds: out(offer.partnerPolicyIds), playerPolicyIds: out(offer.playerPolicyIds) };
}

/**
 * Up to three changes to the offer that would bring its budget back within the
 * partner's line: the gentlest change that clears it, else the one that helps most,
 * repeated. The partner never asks to cut its own policies.
 */
export function budgetFixFor(offer: Offer, ctx: NegotiationContext, problem: BudgetProblem): BudgetFixPlan {
  const { partner, player } = ctx;
  const own = new Set(partner.policies.map((p) => p.id));
  const overFor = (o: Offer) => budgetProblemFor(partner, budgetFor([...(ctx.otherAgreed ?? []), ...offerPolicies(o, player, partner)]))?.over ?? 0;
  const items: BudgetFix[] = [];
  let current = offer;
  let over = problem.over;
  while (over > 0 && items.length < 3) {
    const compromised = new Set(current.compromisePolicyIds ?? []);
    const options: BudgetFix[] = [...player.policies]
      .filter((p) => current.playerPolicyIds.includes(p.id) && !own.has(p.id) && p.fiscalImpactNZDm)
      .flatMap((p) => {
        const changes: BudgetFix[] = [{ policy: p, action: 'drop', saving: 0 }];
        if (canCompromise(p) && !compromised.has(p.id)) changes.unshift({ policy: p, action: 'compromise', saving: 0 });
        return changes;
      })
      .map((f) => ({ ...f, saving: over - overFor(withChange(current, f)) }))
      .filter((f) => f.saving > 0);
    if (options.length === 0) break;
    const clears = options.filter((f) => f.saving >= over);
    // Prefer softening to dropping, and giving up the least important policy.
    const gentlest = (a: BudgetFix, b: BudgetFix) =>
      Number(a.action === 'drop') - Number(b.action === 'drop') || a.policy.weight - b.policy.weight || b.saving - a.saving;
    const pick = clears.length ? [...clears].sort(gentlest)[0]! : [...options].sort((a, b) => b.saving - a.saving)[0]!;
    items.push(pick);
    current = withChange(current, pick);
    over -= pick.saving;
  }
  return { items, enough: items.length > 0 && over <= 0 };
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
  counter?: {
    addPolicy?: Policy;
    compromise?: boolean;
    /** Other policies the party would take instead of addPolicy. */
    either?: Policy[];
    addPortfolio?: PortfolioId;
    /** Take this policy out to fix the budget. */
    cutPolicy?: Policy;
    /** Use this policy's compromise version to fix the budget. */
    softenPolicy?: Policy;
    /** v1.2: take this policy of yours out, because the partner's voters will not accept it. */
    dropPolicy?: Policy;
    /** v1.2: the change is asked for to keep the partner's own voters on side. */
    caucus?: boolean;
  };
  /** v1.2: the partner's own voters' mood if this offer went ahead. */
  partnerMood?: number;
  /** v1.2: refused because the partner's voters would not accept it. */
  caucus?: boolean;
  /** v1.2: bottom lines the partner signs without, as small parties may late in talks. */
  waivedBottomLines?: Policy[];
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
  const soft = offer.commitments ?? {};
  const ownTotal = partner.policies.reduce((s, p) => s + p.weight, 0);
  const ownIncluded = partner.policies
    .filter((p) => offer.partnerPolicyIds.includes(p.id) && !(offer.setAsideIds ?? []).includes(p.id))
    .reduce(
      (s, p) =>
        s + p.weight * (soft[p.id] ? COMMITMENT_VALUE[soft[p.id]!] : compromised.has(p.id) && canCompromise(p) ? COMPROMISE_VALUE : 1),
      0,
    );
  let utility = ownIncluded / ownTotal;

  const caseByCase = isCaseByCase(offer, ctx);
  for (const policy of askedPolicies(offer, ctx)) {
    const r = reactionTo(partner, policy);
    // A lesser commitment costs the side backing it less; so does a C&S partner's case-by-case vote.
    const scale =
      (policy.commitment ? COMMITMENT_VALUE[policy.commitment] : 1) * (caseByCase && offer.playerPolicyIds.includes(policy.id) ? 0.5 : 1);
    if (r === -2 && caseByCase) utility -= 0.2 * concernFor(partner, policy) * scale;
    if (r === 1) utility += 0.03 * scale;
    // Even a policy it can live with costs something to back.
    if (r === 0) utility -= 0.1 * concernFor(partner, policy) * scale;
    if (r === -1) utility -= 0.12 * concernFor(partner, policy) * scale;
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

/** v1.2: a confidence and supply partner judges the government's policies case by case. */
function isCaseByCase(offer: Offer, ctx: NegotiationContext): boolean {
  return !!ctx.rules?.csHalfCost && offer.arrangement === 'confidence-supply';
}

/** Everything the partner is asked to live with: the player's requests plus other partners' agreed policies. */
function askedPolicies(offer: Offer, ctx: NegotiationContext): Policy[] {
  const own = new Set(ctx.partner.policies.map((p) => p.id));
  const fromPlayer = offerPolicies(offer, ctx.player, ctx.partner).filter((p) => !own.has(p.id));
  return [...fromPlayer, ...(ctx.otherAgreed ?? []).filter((p) => !own.has(p.id))];
}

/** Below this policy fit a party is not a natural partner. */
export const LIKELY_PARTNER_FIT = 40;

/**
 * Whether a party could realistically back a government led by this one: close
 * enough on policy and not ruled out. Parties on the far left or right have only
 * one natural side. It is a soft judgement: an unlikely partner can still be won.
 */
export function isLikelyPartner(party: Party, leader: Party): boolean {
  if (party.id === leader.id) return true;
  return compatibility(leader, party) >= LIKELY_PARTNER_FIT && ruledOutBias(party, leader.id) < 0.6;
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
  // Backing a government from the other side of politics takes more convincing.
  if (!isLikelyPartner(ctx.partner, ctx.player)) base += 0.08 * (1 - 0.5 * ctx.pressure);
  return arrangement === 'confidence-supply' ? base - 0.12 : base;
}

/** A bottom line and the policies that can stand in for it: the party needs any one of them. */
export function bottomLineOptions(party: Party, policy: Policy): Policy[] {
  return [policy, ...(policy.orPolicyIds ?? []).map((id) => party.policies.find((p) => p.id === id)).filter((p): p is Policy => !!p)];
}

/** True when one of a bottom line's stand-ins is in the offer in full. */
export function metByAlternative(
  party: Party,
  policy: Policy,
  policyIds: string[],
  compromiseIds: string[] = [],
  commitments: Record<string, Commitment> = {},
): boolean {
  return bottomLineOptions(party, policy)
    .slice(1)
    .some((alt) => policyIds.includes(alt.id) && !compromiseIds.includes(alt.id) && !commitments[alt.id]);
}

/** Whether a partner takes the compromise version of its own bottom line in this offer. */
function acceptsCompromise(policy: Policy, ctx: NegotiationContext, utility: number, threshold: number): boolean {
  if (!canCompromise(policy)) return false;
  if (policy.flex === 'soft') return true;
  // v1.2: a small party softening late in talks takes the compromise sooner.
  if (firmnessOf(ctx) < 0.95) return true;
  return ctx.pressure >= 0.4 || (ctx.leverage ?? 0) < 0 || utility >= threshold + 0.05;
}

/**
 * v1.2: the change that would lift the partner's own voters' mood most: one more of its
 * policies, a full version of one it has only partly, or dropping one of yours its voters oppose.
 */
function caucusFix(offer: Offer, ctx: NegotiationContext): { counter: NonNullable<OfferResponse['counter']>; mood: number } | null {
  const { partner, player } = ctx;
  const moodOf = ctx.partnerMoodOf!;
  const others = [player, ...(ctx.currentPartners ?? [])];
  const options: { counter: NonNullable<OfferResponse['counter']>; offer: Offer }[] = [];
  const soft = offer.commitments ?? {};
  for (const pol of partner.policies) {
    if (others.some((p) => reactionTo(p, pol) === -2) || (offer.setAsideIds ?? []).includes(pol.id)) continue;
    const included = offer.partnerPolicyIds.includes(pol.id);
    const partial = included && (!!soft[pol.id] || (offer.compromisePolicyIds ?? []).includes(pol.id));
    if (included && !partial) continue;
    const { [pol.id]: _, ...restSoft } = soft;
    options.push({
      counter: { addPolicy: pol, caucus: true },
      offer: {
        ...offer,
        partnerPolicyIds: [...new Set([...offer.partnerPolicyIds, pol.id])],
        compromisePolicyIds: (offer.compromisePolicyIds ?? []).filter((id) => id !== pol.id),
        commitments: restSoft,
      },
    });
  }
  for (const pol of player.policies) {
    if (!offer.playerPolicyIds.includes(pol.id) || reactionTo(partner, pol) >= 0) continue;
    options.push({
      counter: { dropPolicy: pol, caucus: true },
      offer: { ...offer, playerPolicyIds: offer.playerPolicyIds.filter((id) => id !== pol.id) },
    });
  }
  const now = moodOf(offer);
  const best = options
    .map((o) => ({ ...o, mood: moodOf(o.offer) }))
    .filter((o) => o.mood > now)
    .sort((a, b) => b.mood - a.mood)[0];
  return best ? { counter: best.counter, mood: best.mood } : null;
}

export function evaluateOffer(offer: Offer, ctx: NegotiationContext): OfferResponse {
  const { partner, player } = ctx;
  const asked = askedPolicies(offer, ctx);
  // v1.2: in confidence and supply it votes against your policy rather than walking out.
  const caseByCase = isCaseByCase(offer, ctx);
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2 && !(caseByCase && offer.playerPolicyIds.includes(p.id)));
  const utility = scoreOffer(offer, ctx);
  const threshold = acceptanceThreshold(ctx, offer.arrangement);
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const soft = offer.commitments ?? {};
  const aside = new Set(ctx.rules?.agreeToDisagree ? (offer.setAsideIds ?? []) : []);
  const unmet = partner.policies.filter(
    (p) =>
      p.isBottomLine &&
      !aside.has(p.id) &&
      !metByAlternative(partner, p, offer.partnerPolicyIds, offer.compromisePolicyIds, soft) &&
      (!offer.partnerPolicyIds.includes(p.id) ||
        !!soft[p.id] ||
        (compromised.has(p.id) && !acceptsCompromise(p, ctx, utility, threshold))),
  );
  // v1.2: a small party late in talks can sign without a bottom line if the rest of the offer is strong.
  const firmness = firmnessOf(ctx);
  const waive = unmet.length > 0 && utility >= threshold + firmnessMargin(firmness);
  const missingBottomLines = waive ? [] : unmet;
  const partnerMood = ctx.rules?.caucusFloor && ctx.partnerMoodOf ? ctx.partnerMoodOf(offer) : undefined;
  const base = {
    utility,
    threshold,
    redLines,
    missingBottomLines,
    partnerMood,
    ...(waive ? { waivedBottomLines: unmet } : {}),
  };

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
    const missing = [...missingBottomLines].sort((a, b) => b.weight - a.weight)[0]!;
    const others = [player, ...(ctx.currentPartners ?? [])];
    const clashesFor = (pol: Policy) => others.some((p) => reactionTo(p, pol) === -2);
    // Where either of two demands will do, it asks for the one the other side can live with best.
    const options = bottomLineOptions(partner, missing);
    const fit = (pol: Policy) => (clashesFor(pol) ? -10 : 0) + others.reduce((s, p) => s + reactionTo(p, pol), 0);
    const wanted = options.length > 1 ? [...options].sort((a, b) => fit(b) - fit(a) || b.weight - a.weight)[0]! : missing;
    const compromise = clashesFor(wanted) && canCompromise(wanted) && !compromised.has(wanted.id);
    const either = options.length > 1 ? options.filter((p) => p.id !== wanted.id) : undefined;
    return { kind: 'counter', ...base, cabinet, counter: { addPolicy: wanted, compromise, either } };
  }

  const found = budgetProblemFor(partner, ctx.budget);
  // It always names the agreement items that would fix the budget, not just the gap.
  const problem: BudgetProblem | null = found && { ...found, fix: budgetFixFor(offer, ctx, found) };
  if (problem && partner.personality.fiscalStance !== 'balanced') {
    const first = problem.fix!.items[0];
    if (problem.refuse && !problem.fix!.enough) return { kind: 'hold', ...base, cabinet, budget: problem };
    if (problem.refuse || utility < threshold + 0.1) {
      if (first) {
        const counter = first.action === 'drop' ? { cutPolicy: first.policy } : { softenPolicy: first.policy };
        return { kind: 'counter', ...base, cabinet, budget: problem, counter };
      }
      if (problem.refuse) return { kind: 'hold', ...base, cabinet, budget: problem };
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

  if (utility >= threshold && partnerMood !== undefined && partnerMood < CAUCUS_FLOOR) {
    // v1.2: its leader will not sign a deal its own voters would not wear.
    const fix = caucusFix(offer, ctx);
    if (fix) return { kind: 'counter', ...base, cabinet, caucus: true, counter: fix.counter };
    return { kind: 'hold', ...base, cabinet, caucus: true };
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
