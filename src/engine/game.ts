import type { Party, Policy } from '../data/schema';
import { budgetFor, type Budget } from './budget';
import {
  budgetProblemFor,
  canCompromise,
  COMPROMISE_VALUE,
  compatibility,
  concernFor,
  eligiblePortfolios,
  evaluateOffer,
  expectedCabinet,
  offerPolicies,
  reactionTo,
  SENIOR_PORTFOLIOS,
  type NegotiationContext,
  type Offer,
  type OfferResponse,
  type PortfolioId,
  bottomLineOptions,
  budgetFixFor,
  isLikelyPartner,
} from './negotiation';
import { createRng } from './random';
import { voterMood, type VoterMood } from './voters';

/** Three weeks of talks by default; a short game keeps the original ten days. */
export const DEFAULT_DAYS = 21;
export const SHORT_DAYS = 10;
/** @deprecated The game length lives on the state; this is the default. */
export const DAYS = DEFAULT_DAYS;

/**
 * "rival-signing" means the party has agreed a deal with the rival bloc and is going
 * through its own sign-off; "rival" means that deal is signed.
 */
export type DealStatus = 'open' | 'ratifying' | 'signed' | 'rejected' | 'walked' | 'rival-signing' | 'rival';

/** A partner unhappy with something agreed with another party after it signed. */
export interface Unsettled {
  policyIds: string[];
  /** red-line: leaves at the deadline; opposes: dislikes a later deal; request: finds its own deal too thin. */
  severity: 'red-line' | 'opposes' | 'request';
  since: number;
  /** For a red line: the last day to fix it before the partner leaves. */
  deadline?: number;
}

export interface PartnerState {
  trust: number;
  /** Offers that ended in a hold-out or walk-out. */
  failures: number;
  status: DealStatus;
  deal?: Offer;
  /** Day the partner's sign-off process finishes. */
  ratifyOnDay?: number;
  /** Offers the rival bloc has made to this party. */
  rivalAttempts: number;
  /** The party refused to deal with the rival over a red line. */
  rivalBlocked?: boolean;
  /** The deal agreed with the rival bloc, and when its sign-off finishes. */
  rivalDeal?: OfferWithReason;
  rivalRatifyOnDay?: number;
  /** Unhappy with what the rival bloc agreed with another party, so easier to win over. */
  rivalStrain?: boolean;
  /** A changed version of a signed deal going through sign-off; the signed deal stands until then. */
  pendingDeal?: Offer;
  /** The player has reopened the deal to change it. */
  renegotiating?: boolean;
  /** The one voluntary reopen has been used. */
  reopened?: boolean;
  /** Came back once after walking out. */
  reapproached?: boolean;
  walkedOnDay?: number;
  /** The programme's policy ids when this partner last agreed, to spot new clashes. */
  agreedWith?: string[];
  unsettled?: Unsettled;
  /** Has already asked once to change a deal it found thin. */
  requested?: boolean;
  lastPlayerOffer?: number;
  lastRivalOffer?: number;
}

/** The rival's offer and the partner's verdict, kept to explain why it signed. */
export interface OfferWithReason {
  offer: Offer;
  response: OfferResponse;
  day: number;
}

export interface LogEntry {
  day: number;
  partnerId: string;
  kind:
    | OfferResponse['kind']
    | 'signed'
    | 'rejected'
    | 'ratifying'
    | 'rival-signing'
    | 'rival-deal'
    | 'rival-rejected'
    | 'poached'
    | 'rival-collapse'
    | 'reopened'
    | 'renegotiated'
    | 'reapproached'
    | 'unsettled'
    | 'settled'
    | 'requested'
    | 'left';
  response?: OfferResponse;
  offer?: Offer;
  /** For rival events: the rival bloc's lead party. */
  otherId?: string;
  /** For an offer: it changed a deal already agreed. */
  renegotiation?: boolean;
  /** For unsettled and left: the policies that caused it. */
  policyIds?: string[];
}

export interface NewsItem {
  day: number;
  text: string;
}

/** One point per day for the progress graph. */
export interface DayPoint {
  day: number;
  /** Seats signed or signing off with the player. */
  playerSeats: number;
  rivalSeats: number;
  mood: number;
  balance: number;
  pressure: number;
}

export interface GameState {
  seed: number;
  day: number;
  /** Length of talks in days. */
  days: number;
  playerId: string;
  seats: Record<string, number>;
  majority: number;
  totalSeats: number;
  partners: Record<string, PartnerState>;
  log: LogEntry[];
  /** One press conference per signed deal. */
  press: PressConference[];
  /** The party leading the other bloc, which competes for the same partners. */
  rivalId: string | null;
  history: DayPoint[];
  outcome: 'playing' | 'won' | 'lost';
  /** Why the game was lost: the rival got there first, or nobody could govern (a snap election). */
  lostTo?: 'deadline' | 'rival';
  /** What kind of government the player formed. */
  govType?: GovType;
  /** Partners whose deals the player chose to reopen, which voters notice. */
  reopens: string[];
  /** Small offers made today, which do not use up the day. */
  quickOffers?: number;
  /** The rival is still working through a big offer until the end of this day. */
  rivalBusyUntil?: number;
  /** Short morning news lines about the race. */
  news: NewsItem[];
}

/**
 * single-party: a majority alone. majority-coalition: cabinet parties hold a
 * majority. minority: cabinet is short of a majority and relies on confidence
 * and supply partners. grand-coalition: National and Labour together.
 * fragile-minority: no majority at the deadline, but the largest bloc and close
 * enough to govern vote by vote.
 */
export type GovType = 'single-party' | 'majority-coalition' | 'minority' | 'grand-coalition' | 'fragile-minority';

/** At the deadline, a bloc this close to a majority, and ahead of the rival, can try to govern alone. */
export const FRAGILE_MARGIN = 5;

export type PressSpin = 'wins' | 'partner' | 'stability';

export interface PressConference {
  day: number;
  partnerId: string;
  spin: PressSpin;
}

/** How the player presents a signed deal. Each choice trades voter mood against goodwill in talks still open. */
export const PRESS_OPTIONS: Record<PressSpin, { label: string; detail: string; mood: number; openTrust: number }> = {
  wins: {
    label: 'Lead with what your party won',
    detail: 'Your voters like it. Parties still in talks see a partner that claims the credit.',
    mood: 6,
    openTrust: -4,
  },
  partner: {
    label: 'Credit your new partner',
    detail: 'Parties still in talks warm to you. Some of your voters wanted a harder line.',
    mood: -2,
    openTrust: 5,
  },
  stability: {
    label: 'Talk about stable government',
    detail: 'A safe message. A small lift with your voters and no change in talks.',
    mood: 2,
    openTrust: 0,
  },
};

export interface NewGame {
  player: Party;
  parties: Party[];
  seats: Record<string, number>;
  majority: number;
  totalSeats: number;
  seed: number;
  /** Length of talks; three weeks unless set. */
  days?: number;
}

export function createGame({ player, parties, seats, majority, totalSeats, seed, days = DEFAULT_DAYS }: NewGame): GameState {
  const partners: Record<string, PartnerState> = {};
  for (const party of parties) {
    if (party.id === player.id || (seats[party.id] ?? 0) === 0) continue;
    const trust = party.relationships.find((r) => r.partyId === player.id)?.trust ?? 30;
    partners[party.id] = { trust, failures: 0, status: 'open', rivalAttempts: 0 };
  }
  const state: GameState = {
    seed,
    day: 1,
    days,
    playerId: player.id,
    seats,
    majority,
    totalSeats,
    partners,
    log: [],
    press: [],
    rivalId: chooseRival(player, parties, seats),
    history: [],
    outcome: 'playing',
    reopens: [],
    news: [],
  };
  // A party that already holds a majority on its own wins straight away.
  return recordDay(checkOutcome(state), parties);
}

/** 0 on day 1, 1 on the last day. */
export function pressureOn(day: number, days: number = DEFAULT_DAYS): number {
  return Math.min(1, Math.max(0, (day - 1) / (days - 1)));
}

/**
 * The rival bloc is led by whichever of the two largest parties is the poorer
 * fit for the player; if the player is one of them, by the other.
 */
export function chooseRival(player: Party, parties: Party[], seats: Record<string, number>): string | null {
  const topTwo = parties
    .filter((p) => (seats[p.id] ?? 0) > 0)
    .sort((a, b) => (seats[b.id] ?? 0) - (seats[a.id] ?? 0))
    .slice(0, 2)
    .filter((p) => p.id !== player.id)
    .sort((a, b) => compatibility(player, a) - compatibility(player, b));
  return topTwo[0]?.id ?? null;
}

/** Seats the rival bloc has locked in: its lead party plus everyone signed with it. */
export function rivalSeats(state: GameState): number {
  if (!state.rivalId || state.partners[state.rivalId]?.status === 'signed') return 0;
  return Object.entries(state.partners)
    .filter(([, p]) => p.status === 'rival')
    .reduce((sum, [id]) => sum + (state.seats[id] ?? 0), state.seats[state.rivalId] ?? 0);
}

/**
 * Pressure on every negotiator: the clock, plus a race term as either bloc
 * closes in on a majority. Kingmakers feel it less.
 */
export function pressureFor(state: GameState, parties: Party[], partyId?: string): number {
  const leading = Math.max(seatsAgreed(state), rivalSeats(state));
  const race = Math.min(1, Math.max(0, 1 - (state.majority - leading) / 20)) * 0.2;
  const base = Math.min(1, pressureOn(state.day, state.days) + race);
  const party = partyId ? parties.find((p) => p.id === partyId) : undefined;
  return party?.personality.kingmaker ? base * 0.8 : base;
}

/** Breaking a signed deal with the rival takes a clearly better offer. */
export const POACH_PREMIUM = 0.12;

/** Days a partner gives you to fix a policy that crosses its red line before it leaves. */
export const UNSETTLED_DEADLINE_DAYS = 2;

/** The player gets time for a big opening offer (two days) before the rival bloc makes offers. */
const RIVAL_STARTS_DAY = 3;

/** An offer with this many items or fewer is quick: it does not use up the day. */
export const SMALL_OFFER = 3;
/** An offer with this many items or more takes two days to work through. */
export const BIG_OFFER = 12;
/** Quick offers allowed in one day. */
export const QUICK_OFFERS_PER_DAY = 2;
/** A signed partner whose deal falls this far short of what it would now accept may ask to change it. */
const REQUEST_CHANCE = 0.35;

/** Days after walking out before a party will hear from you again. */
export const REAPPROACH_AFTER_DAYS = 3;

export function seatsSecured(state: GameState): number {
  return Object.entries(state.partners)
    .filter(([, p]) => p.status === 'signed')
    .reduce((sum, [id]) => sum + (state.seats[id] ?? 0), state.seats[state.playerId] ?? 0);
}

/** Seats from signed partners plus those still going through sign-off. */
export function seatsAgreed(state: GameState): number {
  return Object.entries(state.partners)
    .filter(([, p]) => p.status === 'ratifying')
    .reduce((sum, [id]) => sum + (state.seats[id] ?? 0), seatsSecured(state));
}

/** Seats with the rival bloc still going through sign-off. */
export function rivalSigningSeats(state: GameState): number {
  if (!state.rivalId || rivalSeats(state) === 0) return 0;
  return Object.entries(state.partners)
    .filter(([, p]) => p.status === 'rival-signing')
    .reduce((sum, [id]) => sum + (state.seats[id] ?? 0), 0);
}

/** The deal currently in force with a partner: a renegotiated one once it is in sign-off counts. */
function liveDeal(p: PartnerState): Offer | undefined {
  return p.pendingDeal ?? p.deal;
}

function inGovernment(p: PartnerState): boolean {
  return p.status === 'signed' || p.status === 'ratifying';
}

/** Policies from deals that are signed or being signed, other than the given partner's. */
export function agreedPolicies(state: GameState, parties: Party[], exceptPartnerId?: string): Policy[] {
  const player = parties.find((p) => p.id === state.playerId)!;
  const byId = new Map<string, Policy>();
  for (const [id, p] of Object.entries(state.partners)) {
    const deal = liveDeal(p);
    if (id === exceptPartnerId || !deal || !inGovernment(p)) continue;
    const partner = parties.find((x) => x.id === id)!;
    for (const pol of offerPolicies(deal, player, partner)) {
      // A compromise in one deal and the full version in another: the full version stands.
      const existing = byId.get(pol.id);
      if (!existing || existing.isCompromise) byId.set(pol.id, pol);
    }
  }
  return [...byId.values()];
}

/** Cabinet roles promised in deals signed or being signed, with the partner holding each. */
export function takenPortfolios(state: GameState, exceptPartnerId?: string): Map<PortfolioId, string> {
  const taken = new Map<PortfolioId, string>();
  for (const [id, p] of Object.entries(state.partners)) {
    const deal = liveDeal(p);
    if (id === exceptPartnerId || !deal || !inGovernment(p)) continue;
    for (const portfolio of deal.portfolios) taken.set(portfolio, id);
  }
  return taken;
}

/** The rival bloc's programme: its lead party's flagships plus every rival deal. */
function rivalProgramme(state: GameState, parties: Party[], exceptPartnerId?: string): Policy[] {
  const rival = parties.find((p) => p.id === state.rivalId);
  if (!rival) return [];
  const byId = new Map<string, Policy>();
  for (const [id, p] of Object.entries(state.partners)) {
    if (id === exceptPartnerId || !p.rivalDeal || (p.status !== 'rival' && p.status !== 'rival-signing')) continue;
    const partner = parties.find((x) => x.id === id)!;
    for (const pol of offerPolicies(p.rivalDeal.offer, rival, partner)) byId.set(pol.id, pol);
  }
  return [...byId.values()];
}

/** Seats a bloc already has: the player's agreed seats, or the rival's signed ones. */
function blocSeats(state: GameState, bloc: 'player' | 'rival'): number {
  return bloc === 'player' ? seatsAgreed(state) : rivalSeats(state);
}

/**
 * Whether a bloc needs this party: it cannot reach a majority from the parties
 * still open without it, but can with it.
 */
export function isPivotal(state: GameState, partyId: string, bloc: 'player' | 'rival'): boolean {
  if (bloc === 'rival' && rivalSeats(state) === 0) return false;
  const have = blocSeats(state, bloc);
  if (have >= state.majority) return false;
  const pool = Object.entries(state.partners)
    .filter(([id, p]) => id !== state.rivalId && (p.status === 'open' || id === partyId))
    .reduce((s, [id]) => s + (state.seats[id] ?? 0), 0);
  const potential = have + pool;
  return potential >= state.majority && potential - (state.seats[partyId] ?? 0) < state.majority;
}

/** Both blocs have made this party an offer in the last few days. */
export function courtedByBoth(state: GameState, partyId: string): boolean {
  const p = state.partners[partyId];
  if (!p || p.lastPlayerOffer === undefined || p.lastRivalOffer === undefined) return false;
  return state.day - p.lastPlayerOffer <= 3 && state.day - p.lastRivalOffer <= 3;
}

/**
 * How much bargaining power a party feels, -0.5 to 1. Courted by both blocs and
 * needed by them, it holds out; needed by neither while the race tightens, it is keen.
 */
export function leverageFor(state: GameState, partyId: string, parties: Party[] = []): number {
  if (!state.rivalId || rivalSeats(state) === 0) return 0;
  // A side it would not realistically back gives it no bargaining power.
  const party = parties.find((p) => p.id === partyId);
  const likely = (leaderId: string) => {
    const leader = parties.find((p) => p.id === leaderId);
    return !party || !leader || isLikelyPartner(party, leader);
  };
  const forPlayer = isPivotal(state, partyId, 'player') && likely(state.playerId);
  const forRival = isPivotal(state, partyId, 'rival') && likely(state.rivalId);
  const courted = courtedByBoth(state, partyId) && likely(state.playerId) && likely(state.rivalId);
  if (forPlayer && forRival) return courted ? 1 : 0.6;
  if (forPlayer || forRival) return courted ? 0.5 : 0.25;
  const closest = Math.min(state.majority - seatsAgreed(state), state.majority - rivalSeats(state));
  return closest <= 10 && state.day > 1 ? -0.5 : 0;
}

export type PartyMood = 'holding-out' | 'keen' | 'neutral';

/** A tag for the party list. */
export function partyMood(state: GameState, partyId: string, parties: Party[] = []): { mood: PartyMood; label: string } {
  const lev = leverageFor(state, partyId, parties);
  if (lev >= 0.5) return { mood: 'holding-out', label: courtedByBoth(state, partyId) ? 'Courted by both, holding out' : 'Needed by both, holding out' };
  if (lev > 0) return { mood: 'holding-out', label: 'Knows it is needed' };
  if (lev < 0) return { mood: 'keen', label: 'Losing options, keen to deal' };
  return { mood: 'neutral', label: '' };
}

/** Coalition seats if this partner joins: the player, everyone agreed and the partner. */
function coalitionSeatsWith(state: GameState, partnerId: string): number {
  const others = Object.entries(state.partners)
    .filter(([id, p]) => id !== partnerId && inGovernment(p) && liveDeal(p)?.arrangement === 'coalition')
    .reduce((s, [id]) => s + (state.seats[id] ?? 0), 0);
  return (state.seats[state.playerId] ?? 0) + others + (state.seats[partnerId] ?? 0);
}

/** Who the player's offer goes to and how it is judged; shared by offers and previews. */
function contextFor(state: GameState, parties: Party[], offer: Offer): NegotiationContext {
  const player = parties.find((p) => p.id === state.playerId)!;
  const partner = parties.find((p) => p.id === offer.partnerId)!;
  const current = state.partners[offer.partnerId]!;
  const otherAgreed = agreedPolicies(state, parties, partner.id);
  const taken = takenPortfolios(state, partner.id);
  return {
    player,
    partner,
    trust: current.trust,
    pressure: pressureFor(state, parties, partner.id),
    otherAgreed,
    budget: budgetFor([...otherAgreed, ...offerPolicies(offer, player, partner)], parties),
    takenPortfolios: [...taken.keys()],
    seats: { partner: state.seats[partner.id] ?? 0, coalition: coalitionSeatsWith(state, partner.id) },
    leverage: current.status === 'open' || current.status === 'rival-signing' ? leverageFor(state, partner.id, parties) : 0,
    renegotiation: !!current.renegotiating && !current.unsettled,
    reapproach: !!current.reapproached && current.status === 'open' && !current.deal,
    currentPartners: Object.entries(state.partners)
      .filter(([id, p]) => id !== partner.id && inGovernment(p))
      .map(([id]) => parties.find((x) => x.id === id)!),
  };
}

/** Can the player send an offer to this partner now? */
export function canOffer(p: PartnerState | undefined): boolean {
  if (!p) return false;
  return (
    p.status === 'open' ||
    p.status === 'rival' ||
    p.status === 'rival-signing' ||
    ((p.status === 'signed' || p.status === 'ratifying') && !!p.renegotiating)
  );
}

/**
 * How much there is to work through: every policy and cabinet role in a new offer,
 * or only what changed when reworking an earlier offer or deal.
 */
export function offerSize(offer: Offer, base?: Offer): number {
  if (base) {
    const diff = (a: string[] = [], b: string[] = []) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
    return (
      diff(base.partnerPolicyIds, offer.partnerPolicyIds) +
      diff(base.playerPolicyIds, offer.playerPolicyIds) +
      diff(base.compromisePolicyIds, offer.compromisePolicyIds) +
      diff(base.portfolios, offer.portfolios) +
      (base.arrangement === offer.arrangement ? 0 : 1)
    );
  }
  return offer.partnerPolicyIds.length + offer.playerPolicyIds.length + offer.portfolios.length;
}

/** Days an offer takes: none for a small one (a couple a day), two for a big one. */
export function offerDays(state: GameState, offer: Offer): number {
  // Reworking the last offer or deal with a party only takes the changes.
  const base = previousOffer(state, offer.partnerId)?.offer;
  const size = offerSize(offer, base);
  if (size <= SMALL_OFFER && (state.quickOffers ?? 0) < QUICK_OFFERS_PER_DAY) return 0;
  return size >= BIG_OFFER ? 2 : 1;
}

/** Plays one offer, which uses up the day. Returns the new state; the input is not changed. */
export function makeOffer(state: GameState, parties: Party[], offer: Offer): GameState {
  if (state.outcome !== 'playing') return state;
  const partner = parties.find((p) => p.id === offer.partnerId)!;
  const current = state.partners[offer.partnerId];
  if (!canOffer(current)) return state;
  const prior = current!;
  const days = offerDays(state, offer);
  const renegotiation = inGovernment(prior);
  const poaching = prior.status === 'rival' || prior.status === 'rival-signing';
  // A cabinet role can only be promised once.
  const taken = takenPortfolios(state, partner.id);
  offer = { ...offer, portfolios: offer.portfolios.filter((p) => !taken.has(p)) };

  const ctx = contextFor(state, parties, offer);
  const response = evaluateOffer(offer, ctx);
  // Breaking a deal takes a clearly better offer: less so mid sign-off, not at all if it is unhappy there.
  const premium = prior.rivalStrain ? 0 : prior.status === 'rival-signing' ? POACH_PREMIUM / 2 : POACH_PREMIUM;
  if (poaching && response.kind === 'accept' && response.utility < response.threshold + premium) {
    // Good enough to sign fresh, not good enough to break a deal: they ask for more.
    response.kind = 'counter';
    response.counter = {
      addPolicy: partner.policies.filter((p) => !offer.partnerPolicyIds.includes(p.id)).sort((a, b) => b.weight - a.weight)[0],
    };
  }

  const next: PartnerState = { ...prior, lastPlayerOffer: state.day };
  const log: LogEntry[] = [{ day: state.day, partnerId: partner.id, kind: response.kind, response, offer, renegotiation }];
  if (response.kind === 'accept' && poaching) {
    log.push({ day: state.day, partnerId: partner.id, kind: 'poached', otherId: state.rivalId ?? undefined });
    next.rivalDeal = undefined;
    next.rivalRatifyOnDay = undefined;
    next.rivalStrain = false;
  }
  if (renegotiation) {
    if (response.kind === 'accept') {
      next.renegotiating = false;
      next.unsettled = next.unsettled?.severity === 'red-line' ? next.unsettled : undefined;
      if (prior.status === 'ratifying') {
        next.deal = offer;
        next.ratifyOnDay = state.day + partner.ratification.days;
      } else {
        next.pendingDeal = offer;
        next.ratifyOnDay = state.day + partner.ratification.days;
      }
      log.push({ day: state.day, partnerId: partner.id, kind: 'renegotiated' });
    } else if (response.kind === 'walk') {
      // The deal they signed still stands, but the attempt has cost goodwill.
      next.renegotiating = false;
      next.trust = Math.max(0, next.trust - 10);
    } else {
      next.trust = Math.max(0, next.trust - 3);
    }
  } else if (response.kind === 'accept') {
    next.deal = offer;
    next.status = 'ratifying';
    next.ratifyOnDay = state.day + partner.ratification.days;
  } else if (response.kind === 'walk') {
    next.failures += 1;
    next.trust = Math.max(0, next.trust - 15);
  } else if (response.kind === 'hold' && !response.considering) {
    // Holding out while it weighs its options is not a failed round.
    next.failures += 1;
    next.trust = Math.max(0, next.trust - 3);
  }
  // A party already with the rival just stays there when talks fail.
  if (!renegotiation && response.kind !== 'accept' && !poaching && next.failures >= partner.personality.patience) {
    next.status = 'walked';
    next.walkedOnDay = state.day;
  }
  if (response.kind === 'accept') next.agreedWith = undefined;

  let after: GameState = {
    ...state,
    partners: { ...state.partners, [partner.id]: next },
    log: [...state.log, ...log],
  };
  if (response.kind === 'accept') after = stampAgreement(after, parties, partner.id);
  after = reviewPartners(after, parties);
  // A party whose leader decides on the spot signs the same day.
  const signedToday = processSignOffs(after, parties, state.day);
  if (days === 0) return checkOutcome(recordDay({ ...signedToday, quickOffers: (state.quickOffers ?? 0) + 1 }, parties));
  let g = endDay(signedToday, parties);
  if (days === 2 && g.outcome === 'playing') g = checkOutcome(endDay(checkOutcome(g), parties));
  return checkOutcome(g);
}

/** Records the programme a partner agreed to, so later additions can be spotted. */
function stampAgreement(state: GameState, parties: Party[], partnerId: string): GameState {
  const p = state.partners[partnerId]!;
  const programme = agreedPolicies(state, parties).map((pol) => pol.id);
  return { ...state, partners: { ...state.partners, [partnerId]: { ...p, agreedWith: programme } } };
}

/** What would upset partners already in the government if this programme went ahead. */
export function clashesFor(
  state: GameState,
  parties: Party[],
  programme: Policy[],
  partnerId: string,
): { severity: 'red-line' | 'opposes'; policies: Policy[] } | null {
  const p = state.partners[partnerId]!;
  const party = parties.find((x) => x.id === partnerId)!;
  const own = new Set(party.policies.map((pol) => pol.id));
  const known = new Set(p.agreedWith ?? []);
  const others = programme.filter((pol) => !own.has(pol.id));
  const red = others.filter((pol) => reactionTo(party, pol) === -2);
  if (red.length > 0) return { severity: 'red-line', policies: red };
  const opposed = others.filter(
    (pol) => !known.has(pol.id) && reactionTo(party, pol) === -1 && concernFor(party, pol) >= 0.35,
  );
  return opposed.length > 0 ? { severity: 'opposes', policies: opposed } : null;
}

/**
 * Checks every partner in the government against the programme as it now stands.
 * A new policy it strongly opposes unsettles it; one crossing a red line gives you a
 * deadline to fix it. Fixed, it settles again.
 */
function reviewPartners(state: GameState, parties: Party[]): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  const programme = agreedPolicies(state, parties);
  for (const [id, p] of Object.entries(partners)) {
    if (!inGovernment(p) || !p.agreedWith) continue;
    if (p.unsettled?.severity === 'request') continue;
    const clash = clashesFor(state, parties, programme, id);
    if (p.unsettled) {
      const stillThere = clash && clash.policies.some((pol) => p.unsettled!.policyIds.includes(pol.id));
      if (!stillThere) {
        partners[id] = { ...p, unsettled: undefined, agreedWith: programme.map((pol) => pol.id) };
        log.push({ day: state.day, partnerId: id, kind: 'settled' });
      }
      continue;
    }
    if (!clash) continue;
    const red = clash.severity === 'red-line';
    partners[id] = {
      ...p,
      trust: Math.max(0, p.trust - (red ? 10 : 5)),
      unsettled: {
        policyIds: clash.policies.map((pol) => pol.id),
        severity: clash.severity,
        since: state.day,
        deadline: red ? state.day + UNSETTLED_DEADLINE_DAYS : undefined,
      },
    };
    log.push({ day: state.day, partnerId: id, kind: 'unsettled', policyIds: clash.policies.map((pol) => pol.id) });
  }
  return { ...state, partners, log };
}

/**
 * A signed partner that finds its deal thin may ask to change it: if what it was given
 * now falls short of what it would accept, there is a daily chance it reaches out,
 * once per partner. A strong deal never prompts this.
 */
function partnerRequests(state: GameState, parties: Party[]): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  Object.entries(state.partners).forEach(([id, p], index) => {
    if (p.status !== 'signed' || !p.deal || p.unsettled || p.renegotiating || p.pendingDeal || p.requested) return;
    const party = parties.find((x) => x.id === id)!;
    const ctx = { ...contextFor(state, parties, p.deal), pressure: 0.3, leverage: 0, renegotiation: false };
    const response = evaluateOffer(p.deal, ctx);
    if (response.utility >= response.threshold) return;
    if (createRng(state.seed + state.day * 53 + index + 7)() >= REQUEST_CHANCE) return;
    const wanted = party.policies
      .filter((pol) => !p.deal!.partnerPolicyIds.includes(pol.id) || (p.deal!.compromisePolicyIds ?? []).includes(pol.id))
      .sort((a, b) => b.weight - a.weight)[0];
    partners[id] = {
      ...p,
      requested: true,
      unsettled: { policyIds: wanted ? [wanted.id] : [], severity: 'request', since: state.day },
    };
    log.push({ day: state.day, partnerId: id, kind: 'requested', policyIds: wanted ? [wanted.id] : [] });
  });
  return { ...state, partners, log };
}

/** A partner whose red-line deadline has passed leaves the government. */
function enforceDeadlines(state: GameState, day: number): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  for (const [id, p] of Object.entries(partners)) {
    if (!inGovernment(p) || p.unsettled?.severity !== 'red-line' || (p.unsettled.deadline ?? Infinity) >= day) continue;
    partners[id] = {
      ...p,
      status: 'walked',
      walkedOnDay: day,
      deal: undefined,
      pendingDeal: undefined,
      renegotiating: false,
      trust: Math.max(0, p.trust - 10),
      unsettled: undefined,
    };
    log.push({ day, partnerId: id, kind: 'left', policyIds: p.unsettled.policyIds });
  }
  return { ...state, partners, log };
}

/**
 * Opens a signed or signing deal to change it. Once per party by choice, at a cost in
 * trust and voter mood; free when the partner is unsettled and asking for it.
 */
export function reopenDeal(state: GameState, partnerId: string): GameState {
  const p = state.partners[partnerId];
  if (!p || !inGovernment(p) || p.renegotiating) return state;
  const forced = !!p.unsettled;
  if (!forced && p.reopened) return state;
  const next: PartnerState = { ...p, renegotiating: true };
  if (!forced) {
    next.reopened = true;
    next.trust = Math.max(0, p.trust - 8);
  }
  return {
    ...state,
    partners: { ...state.partners, [partnerId]: next },
    reopens: forced ? state.reopens : [...state.reopens, partnerId],
    log: [...state.log, { day: state.day, partnerId, kind: 'reopened' }],
  };
}

/** Leaves a reopened deal as it was. */
export function closeRenegotiation(state: GameState, partnerId: string): GameState {
  const p = state.partners[partnerId];
  if (!p?.renegotiating) return state;
  return { ...state, partners: { ...state.partners, [partnerId]: { ...p, renegotiating: false } } };
}

export function canReopen(p: PartnerState | undefined): boolean {
  return !!p && inGovernment(p) && !p.renegotiating && (!p.reopened || !!p.unsettled);
}

/** A party that walked out will listen once more after a few days. */
export function canReapproach(state: GameState, partnerId: string): boolean {
  const p = state.partners[partnerId];
  return !!p && p.status === 'walked' && !p.reapproached && state.day - (p.walkedOnDay ?? 0) >= REAPPROACH_AFTER_DAYS;
}

export function reapproach(state: GameState, parties: Party[], partnerId: string): GameState {
  if (!canReapproach(state, partnerId)) return state;
  const p = state.partners[partnerId]!;
  const party = parties.find((x) => x.id === partnerId)!;
  return {
    ...state,
    partners: {
      ...state.partners,
      // Two more tries, from low trust.
      [partnerId]: { ...p, status: 'open', reapproached: true, failures: Math.max(0, party.personality.patience - 2), deal: undefined },
    },
    log: [...state.log, { day: state.day, partnerId, kind: 'reapproached' }],
  };
}

/** Spends a day without making an offer, letting sign-offs run. */
export function waitDay(state: GameState, parties: Party[]): GameState {
  if (state.outcome !== 'playing') return state;
  return checkOutcome(endDay(state, parties));
}

/** Skips quiet days until something happens: a deal, a sign-off, news or the end. */
export function waitForNews(state: GameState, parties: Party[], maxDays = 7): GameState {
  let g = state;
  for (let i = 0; i < maxDays && g.outcome === 'playing'; i++) {
    const before = { log: g.log.length, news: g.news.length };
    g = waitDay(g, parties);
    if (g.log.length > before.log || g.news.length > before.news) break;
  }
  return g;
}

function endDay(state: GameState, parties: Party[]): GameState {
  const afterRival = rivalMove(state, parties);
  const nextDay = state.day + 1;
  const advanced = { ...afterRival, day: nextDay, quickOffers: 0 };
  const day = Math.min(nextDay, state.days);
  const signed = processSignOffs(advanced, parties, day);
  return recordDay(partnerRequests(enforceDeadlines(reviewPartners(signed, parties), day), parties), parties);
}

function recordDay(state: GameState, parties: Party[]): GameState {
  const day = Math.min(state.day, state.days);
  const point: DayPoint = {
    day,
    playerSeats: seatsAgreed(state),
    rivalSeats: rivalSeats(state),
    mood: moodOf(state, parties).mood,
    balance: budgetFor(programmeOf(state, parties)).balance,
    pressure: Math.round(pressureFor(state, parties) * 100),
  };
  const previous = state.history.filter((h) => h.day < day).at(-1);
  const news = previous ? [...state.news, ...newsFor(state, parties, previous, point)] : state.news;
  return { ...state, news, history: [...state.history.filter((h) => h.day !== day), point] };
}

/** Morning headlines when the race moves: a bloc gets close, passes half-way, or a party changes side. */
function newsFor(state: GameState, parties: Party[], before: DayPoint, now: DayPoint): NewsItem[] {
  const name = (id: string) => parties.find((p) => p.id === id)?.name ?? id;
  const player = name(state.playerId);
  const rival = state.rivalId ? `The ${name(state.rivalId)}-led bloc` : 'The other bloc';
  const items: string[] = [];
  const half = state.majority / 2;
  const blocs: [string, number, number][] = [
    [`${player}'s bloc`, before.playerSeats, now.playerSeats],
    [rival, before.rivalSeats, now.rivalSeats],
  ];
  for (const [label, was, is] of blocs) {
    const gap = state.majority - is;
    if (gap > 0 && gap <= 5 && state.majority - was > 5) items.push(`${label} is within ${gap} seat${gap === 1 ? '' : 's'} of a majority.`);
    else if (is >= half && was < half && gap > 5) items.push(`${label} is past half-way to a majority.`);
  }
  for (const entry of state.log.filter((l) => l.day === before.day)) {
    if (entry.kind === 'poached') items.push(`${name(entry.partnerId)} leaves the other bloc to deal with ${player}.`);
    if (entry.kind === 'left') items.push(`${name(entry.partnerId)} walks out of its deal with ${player}.`);
    if (entry.kind === 'rival-rejected') items.push(`${name(entry.partnerId)}'s members vote down its deal with the other bloc.`);
    if (entry.kind === 'rival-collapse') items.push(`The other bloc falls apart.`);
  }
  return items.map((text) => ({ day: now.day, text }));
}

/**
 * The rival bloc's turn at the end of each day from day 3: it makes one offer to the open
 * party it fits best, conceding a little more each time it is turned down. It avoids
 * policies that cross its own partners' red lines, judges its budget, and offers a
 * fair share of cabinet.
 */
function rivalMove(state: GameState, parties: Party[]): GameState {
  const rival = parties.find((p) => p.id === state.rivalId);
  // The player gets a head start long enough for one big opening offer.
  if (!rival || state.day < RIVAL_STARTS_DAY || rivalSeats(state) === 0) return state;
  // Big offers take the rival two days too.
  if ((state.rivalBusyUntil ?? 0) >= state.day) return state;
  const rivalPartners = Object.entries(state.partners)
    .filter(([, p]) => p.status === 'rival' || p.status === 'rival-signing')
    .map(([id]) => parties.find((x) => x.id === id)!);
  const candidates = Object.entries(state.partners)
    .filter(([id, p]) => id !== rival.id && p.status === 'open' && !p.rivalBlocked)
    .map(([id, p]) => ({ id, p, party: parties.find((x) => x.id === id)! }))
    // Only late in talks does the rival look to a party from the other side.
    .filter(({ party }) => isLikelyPartner(party, rival) || pressureOn(state.day, state.days) >= 0.6)
    .sort((a, b) => compatibility(rival, b.party) * (state.seats[b.id] ?? 0) - compatibility(rival, a.party) * (state.seats[a.id] ?? 0));

  for (const { party, p } of candidates) {
    const offer = rivalOfferFor(state, rival, party, p, rivalPartners);
    if (!offer) continue;
    const otherAgreed = rivalProgramme(state, parties, party.id);
    const coalition =
      (state.seats[rival.id] ?? 0) +
      rivalPartners.reduce((s, x) => s + (state.seats[x.id] ?? 0), 0) +
      (state.seats[party.id] ?? 0);
    const trust = party.relationships.find((r) => r.partyId === rival.id)?.trust ?? 30;
    const response = evaluateOffer(offer, {
      player: rival,
      partner: party,
      trust,
      pressure: pressureFor(state, parties, party.id),
      otherAgreed,
      budget: budgetFor([...otherAgreed, ...offerPolicies(offer, rival, party)], parties),
      seats: { partner: state.seats[party.id] ?? 0, coalition },
      leverage: leverageFor(state, party.id, parties),
      currentPartners: rivalPartners,
    });

    const next: PartnerState = { ...p, rivalAttempts: p.rivalAttempts + 1, lastRivalOffer: state.day };
    const log = [...state.log];
    const partners = { ...state.partners };
    if (response.kind === 'accept') {
      next.status = 'rival-signing';
      next.rivalDeal = { offer, response, day: state.day };
      next.rivalRatifyOnDay = state.day + party.ratification.days;
      log.push({ day: state.day, partnerId: party.id, kind: 'rival-signing', otherId: rival.id, offer, response });
      // Partners already with the rival who dislike the new deal become easier to win over.
      for (const other of rivalPartners) {
        const upset = offerPolicies(offer, rival, party).some(
          (pol) => reactionTo(other, pol) === -1 && concernFor(other, pol) >= 0.35,
        );
        if (upset) partners[other.id] = { ...partners[other.id]!, rivalStrain: true };
      }
    } else if (response.kind === 'walk') {
      next.rivalBlocked = true;
    }
    partners[party.id] = next;
    const rivalBusyUntil = offerSize(offer) >= BIG_OFFER ? state.day + 1 : state.rivalBusyUntil;
    return processRivalSignOffs({ ...state, partners, log, rivalBusyUntil }, parties, state.day);
  }
  return state;
}

/** The rival's offer: everything it can live with, more each time, without breaking its partners' red lines. */
function rivalOfferFor(state: GameState, rival: Party, party: Party, p: PartnerState, rivalPartners: Party[]): Offer | null {
  const crossesPartner = (pol: Policy) => rivalPartners.some((x) => reactionTo(x, pol) === -2);
  const compromisePolicyIds: string[] = [];
  const included: Policy[] = [];
  for (const pol of party.policies) {
    const acceptable = pol.isBottomLine || reactionTo(rival, pol) >= 0;
    if (!acceptable) continue;
    if (crossesPartner(pol)) {
      if (!pol.isBottomLine) continue;
      // A bottom line that would upset its partners: offer a stand-in, the compromise, or skip this party.
      const alt = bottomLineOptions(party, pol).slice(1).find((a) => !crossesPartner(a));
      if (alt) {
        if (!included.includes(alt)) included.push(alt);
        continue;
      }
      if (!canCompromise(pol)) return null;
      compromisePolicyIds.push(pol.id);
    }
    included.push(pol);
  }
  const extra = party.policies
    .filter((pol) => !included.includes(pol) && !crossesPartner(pol))
    .slice(0, 2 * p.rivalAttempts);
  const coalition =
    (state.seats[rival.id] ?? 0) + rivalPartners.reduce((s, x) => s + (state.seats[x.id] ?? 0), 0) + (state.seats[party.id] ?? 0);
  const { expected } = expectedCabinet(party, state.seats[party.id] ?? 0, coalition);
  const takenByRival = new Set(
    Object.values(state.partners).flatMap((x) => (x.status === 'rival' || x.status === 'rival-signing' ? (x.rivalDeal?.offer.portfolios ?? []) : [])),
  );
  const eligible = eligiblePortfolios(party).filter((id) => !takenByRival.has(id));
  const ordered = [...eligible.filter((id) => SENIOR_PORTFOLIOS.includes(id)), ...eligible.filter((id) => !SENIOR_PORTFOLIOS.includes(id))];
  return {
    partnerId: party.id,
    partnerPolicyIds: [...included, ...extra].map((pol) => pol.id),
    playerPolicyIds: rival.policies
      .filter((pol) => pol.weight >= 4 && reactionTo(party, pol) >= 0 && !crossesPartner(pol))
      .map((pol) => pol.id),
    compromisePolicyIds,
    portfolios: ordered.slice(0, Math.max(expected, 1 + Math.min(2, p.rivalAttempts))),
    arrangement: 'coalition',
  };
}

/** The chance a party's members vote a deal down, from how many of its flagships were dropped or watered down. */
function rejectionRisk(party: Party, deal: Offer | undefined, unsettled: boolean): number {
  const flagships = party.policies.filter((pol) => pol.weight >= 4);
  const compromised = new Set(deal?.compromisePolicyIds ?? []);
  const lost = flagships.reduce(
    (s, pol) => s + (!deal?.partnerPolicyIds.includes(pol.id) ? 1 : compromised.has(pol.id) ? 0.4 : 0),
    0,
  );
  const base = party.ratification.rejectionRisk * (flagships.length ? lost / flagships.length : 0);
  return Math.min(0.95, base + (unsettled ? 0.3 : 0));
}

/** Finishes rival deals whose sign-off is due. Members can vote them down too. */
function processRivalSignOffs(state: GameState, parties: Party[], day: number): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  Object.entries(partners).forEach(([id, p], index) => {
    if (p.status !== 'rival-signing' || (p.rivalRatifyOnDay ?? 0) > day) return;
    const party = parties.find((x) => x.id === id)!;
    const roll = createRng(state.seed + day * 37 + index + 101)();
    if (roll < rejectionRisk(party, p.rivalDeal?.offer, false)) {
      partners[id] = { ...p, status: 'open', rivalDeal: undefined, rivalRatifyOnDay: undefined };
      log.push({ day, partnerId: id, kind: 'rival-rejected', otherId: state.rivalId ?? undefined });
    } else {
      partners[id] = { ...p, status: 'rival' };
      log.push({
        day,
        partnerId: id,
        kind: 'rival-deal',
        otherId: state.rivalId ?? undefined,
        offer: p.rivalDeal?.offer,
        response: p.rivalDeal?.response,
      });
    }
  });
  return { ...state, partners, log };
}

/**
 * Finishes any sign-off due by the given day. A party whose members see its
 * flagship policies dropped may vote the deal down, more so if it is unsettled.
 */
function processSignOffs(state: GameState, parties: Party[], day: number): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  Object.entries(partners).forEach(([id, p], index) => {
    const party = parties.find((x) => x.id === id)!;
    const roll = () => createRng(state.seed + day * 31 + index)();
    // A changed version of a signed deal: if it fails, the signed deal stands.
    if (p.status === 'signed' && p.pendingDeal && (p.ratifyOnDay ?? 0) <= day) {
      if (roll() < rejectionRisk(party, p.pendingDeal, !!p.unsettled)) {
        partners[id] = { ...p, pendingDeal: undefined, trust: Math.max(0, p.trust - 10) };
        log.push({ day, partnerId: id, kind: 'rejected' });
      } else {
        partners[id] = { ...p, deal: p.pendingDeal, pendingDeal: undefined };
        log.push({ day, partnerId: id, kind: 'signed' });
      }
      return;
    }
    if (p.status !== 'ratifying' || (p.ratifyOnDay ?? 0) > day) return;
    if (roll() < rejectionRisk(party, p.deal, !!p.unsettled)) {
      partners[id] = { ...p, status: 'rejected', renegotiating: false, unsettled: undefined, trust: Math.max(0, p.trust - 10) };
      log.push({ day, partnerId: id, kind: 'rejected' });
    } else {
      partners[id] = { ...p, status: 'signed', renegotiating: false };
      log.push({ day, partnerId: id, kind: 'signed' });
      // When the rival's own lead party signs with the player, its bloc falls apart.
      if (id === state.rivalId) {
        for (const [otherId, other] of Object.entries(partners)) {
          if (other.status === 'rival' || other.status === 'rival-signing') {
            partners[otherId] = { ...other, status: 'open', rivalDeal: undefined, rivalRatifyOnDay: undefined };
          }
        }
        log.push({ day, partnerId: id, kind: 'rival-collapse' });
      }
    }
  });
  return processRivalSignOffs({ ...state, partners, log }, parties, day);
}

function checkOutcome(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  if (seatsSecured(state) >= state.majority) return { ...state, outcome: 'won', govType: govTypeOf(state) };
  if (rivalSeats(state) >= state.majority) return { ...state, outcome: 'lost', lostTo: 'rival', day: Math.min(state.day, state.days) };
  if (state.day > state.days) {
    const secured = seatsSecured(state);
    if (secured >= state.majority - FRAGILE_MARGIN && secured > rivalSeats(state)) {
      return { ...state, outcome: 'won', govType: 'fragile-minority', day: state.days };
    }
    return { ...state, outcome: 'lost', lostTo: 'deadline', day: state.days };
  }
  return state;
}

function govTypeOf(state: GameState): GovType {
  const signed = Object.entries(state.partners).filter(([, p]) => p.status === 'signed');
  if (signed.length === 0) return 'single-party';
  const ids = new Set([state.playerId, ...signed.map(([id]) => id)]);
  if (ids.has('national') && ids.has('labour')) return 'grand-coalition';
  const cabinetSeats = signed
    .filter(([, p]) => p.deal?.arrangement === 'coalition')
    .reduce((s, [id]) => s + (state.seats[id] ?? 0), state.seats[state.playerId] ?? 0);
  return cabinetSeats >= state.majority ? 'majority-coalition' : 'minority';
}

/** A rejected deal can be renegotiated, but trust has taken a hit. */
export function reopenTalks(state: GameState, partnerId: string): GameState {
  const p = state.partners[partnerId];
  if (!p || p.status !== 'rejected') return state;
  return { ...state, partners: { ...state.partners, [partnerId]: { ...p, status: 'open', deal: undefined } } };
}

/** Partners with a signed deal, or also those still signing off. */
function dealPartners(state: GameState, includeRatifying: boolean): [string, PartnerState][] {
  return Object.entries(state.partners).filter(
    ([, p]) => p.status === 'signed' || (includeRatifying && p.status === 'ratifying'),
  );
}

/**
 * The government's programme: every policy in the deals, compromises included. A party
 * with a majority of its own needs no deal and keeps its whole programme.
 */
export function programmeOf(state: GameState, parties: Party[], includeRatifying = true): Policy[] {
  const player = parties.find((p) => p.id === state.playerId)!;
  const deals = dealPartners(state, includeRatifying);
  if (deals.length === 0 && state.outcome === 'won') return player.policies;
  const byId = new Map<string, Policy>();
  for (const [id, p] of deals) {
    // Until a changed deal is signed, the signed one is what counts for the final result.
    const deal = includeRatifying ? liveDeal(p) : p.deal;
    if (!deal) continue;
    const partner = parties.find((x) => x.id === id)!;
    for (const pol of offerPolicies(deal, player, partner)) {
      const existing = byId.get(pol.id);
      if (!existing || existing.isCompromise) byId.set(pol.id, pol);
    }
  }
  return [...byId.values()];
}

export function pressSpin(state: GameState): number {
  return state.press.reduce((s, p) => s + PRESS_OPTIONS[p.spin].mood, 0);
}

/** Cabinet roles given to partners against a seat-proportional share. */
export function cabinetBalance(state: GameState, includeRatifying = true): { given: number; fair: number } {
  const deals = dealPartners(state, includeRatifying).filter(([, p]) => liveDeal(p)?.arrangement === 'coalition');
  const total = deals.reduce((s, [id]) => s + (state.seats[id] ?? 0), state.seats[state.playerId] ?? 0);
  const given = deals.reduce((s, [, p]) => s + (liveDeal(p)?.portfolios.length ?? 0), 0);
  const fair = deals.reduce((s, [id]) => s + Math.round(((state.seats[id] ?? 0) / total) * (PORTFOLIO_COUNT + 1)), 0);
  return { given, fair };
}

const PORTFOLIO_COUNT = 12;

/** How the player's own voters feel about the deals so far. */
export function moodOf(state: GameState, parties: Party[], includeRatifying = true): VoterMood {
  const player = parties.find((p) => p.id === state.playerId)!;
  const deals = dealPartners(state, includeRatifying);
  const ownSeats = state.seats[player.id] ?? 0;
  const governmentSeats = deals.reduce((s, [id]) => s + (state.seats[id] ?? 0), ownSeats);
  return voterMood({
    player,
    programme: programmeOf(state, parties, includeRatifying),
    partners: deals.map(([id]) => parties.find((p) => p.id === id)!),
    spin: pressSpin(state),
    seatShare: governmentSeats ? ownSeats / governmentSeats : 1,
    reopened: state.reopens.map((id) => parties.find((p) => p.id === id)!.name),
    cabinet: cabinetBalance(state, includeRatifying),
  });
}

/** Signed deals still waiting for their press conference. */
export function pendingPress(state: GameState): string[] {
  return dealPartners(state, false)
    .map(([id]) => id)
    .filter((id) => !state.press.some((p) => p.partnerId === id));
}

/** Fronts the media about a signed deal. Takes no time. */
export function holdPress(state: GameState, partnerId: string, spin: PressSpin): GameState {
  if (!pendingPress(state).includes(partnerId)) return state;
  const shift = PRESS_OPTIONS[spin].openTrust;
  const partners = Object.fromEntries(
    Object.entries(state.partners).map(([id, p]) => [
      id,
      p.status === 'open' && shift !== 0 ? { ...p, trust: Math.max(0, Math.min(100, p.trust + shift)) } : p,
    ]),
  );
  return { ...state, partners, press: [...state.press, { day: Math.min(state.day, state.days), partnerId, spin }] };
}

/** Policies backed only through confidence and supply count for this much: the partner votes case by case. */
export const CONFIDENCE_SUPPLY_FACTOR = 0.75;

export interface GameSummary {
  won: Policy[];
  lost: Policy[];
  /** Weighted share of the player's own policies that made it into signed deals, 0 to 100. Bottom lines count double. */
  policyScore: number;
  mood: VoterMood;
  /** 100 when every partner is in cabinet; confidence and supply seats count for half; unsettled partners cost more. */
  stability: number;
  /** 60% policies, 30% voter mood, 10% stability, 0 to 100. Zero without a government. */
  score: number;
  partners: string[];
}

/** Bottom lines count double in the policy score, so keeping them clearly beats trading them away. */
export function scoreWeight(policy: Policy): number {
  return policy.weight * (policy.isBottomLine ? 2 : 1);
}

export function summarise(state: GameState, parties: Party[]): GameSummary {
  const player = parties.find((p) => p.id === state.playerId)!;
  const signed = dealPartners(state, false);
  const programme = new Map(programmeOf(state, parties, false).map((p) => [p.id, p]));
  // A policy only a confidence and supply partner backs counts for less than one a coalition partner backs.
  const coalitionBacked = new Set(
    signed.filter(([, p]) => p.deal?.arrangement === 'coalition').flatMap(([, p]) => p.deal?.playerPolicyIds ?? []),
  );
  const soloMajority = signed.length === 0 && state.outcome === 'won';
  const won = player.policies.filter((p) => programme.has(p.id)).map((p) => programme.get(p.id)!);
  const lost = player.policies.filter((p) => !programme.has(p.id));
  const total = player.policies.reduce((s, p) => s + scoreWeight(p), 0);
  const earned = won.reduce(
    (s, p) =>
      s +
      scoreWeight(p) *
        (p.isCompromise ? COMPROMISE_VALUE : 1) *
        (soloMajority || coalitionBacked.has(p.id) ? 1 : CONFIDENCE_SUPPLY_FACTOR),
    0,
  );
  const mood = moodOf(state, parties, false);

  const ownSeats = state.seats[player.id] ?? 0;
  const seatWeight = signed.reduce(
    (s, [id, p]) => s + (state.seats[id] ?? 0) * (p.deal?.arrangement === 'coalition' ? 1 : 0.5),
    ownSeats,
  );
  const seatTotal = signed.reduce((s, [id]) => s + (state.seats[id] ?? 0), ownSeats);

  if (state.outcome !== 'won') {
    return { won, lost, policyScore: 0, mood, stability: 0, score: 0, partners: signed.map(([id]) => id) };
  }
  const policyScore = Math.round((earned / total) * 100);
  const unsettled = signed.filter(([, p]) => p.unsettled).length;
  // Governing without a majority, vote by vote, is the least stable arrangement.
  const stability = Math.max(
    0,
    Math.round((seatWeight / seatTotal) * 100 * (state.govType === 'fragile-minority' ? 0.2 : 1)) - 15 * unsettled,
  );
  const score = Math.round(0.6 * policyScore + 0.3 * mood.mood + 0.1 * stability);
  return { won, lost, policyScore, mood, stability, score, partners: signed.map(([id]) => id) };
}

export interface DealPreview {
  budget: Budget;
  mood: VoterMood;
  /** Partners already in the government this would upset. */
  unsettles: { partnerId: string; severity: 'red-line' | 'opposes'; policies: Policy[] }[];
  /** The partner's expected share of cabinet. */
  cabinet?: { offered: number; expected: number; major: boolean };
  /** The partner's view of the budget. */
  budgetProblem: ReturnType<typeof budgetProblemFor>;
}

/** The budget, voter mood and knock-on effects if the partner agreed to this offer now. */
export function previewDeal(state: GameState, parties: Party[], offer: Offer): DealPreview {
  const current = state.partners[offer.partnerId];
  if (!current) {
    return { budget: budgetFor(programmeOf(state, parties), parties), mood: moodOf(state, parties), unsettles: [], budgetProblem: null };
  }
  const renegotiating = inGovernment(current);
  const trial: GameState = {
    ...state,
    partners: {
      ...state.partners,
      [offer.partnerId]: renegotiating
        ? { ...current, pendingDeal: offer }
        : { ...current, status: 'ratifying', deal: offer },
    },
  };
  const programme = agreedPolicies(trial, parties);
  const unsettles = Object.entries(state.partners)
    .filter(([id, p]) => id !== offer.partnerId && inGovernment(p) && p.agreedWith)
    .flatMap(([id]) => {
      const clash = clashesFor(state, parties, programme, id);
      return clash ? [{ partnerId: id, ...clash }] : [];
    });
  const partner = parties.find((p) => p.id === offer.partnerId)!;
  const budget = budgetFor(programmeOf(trial, parties), parties);
  let cabinet: DealPreview['cabinet'];
  if (offer.arrangement === 'coalition') {
    const e = expectedCabinet(partner, state.seats[partner.id] ?? 0, coalitionSeatsWith(state, partner.id));
    cabinet = { offered: offer.portfolios.length, expected: e.expected, major: e.major };
  }
  // The partner's own view of the budget, with the agreement items that would fix it.
  const ctx = contextFor(state, parties, offer);
  const found = budgetProblemFor(partner, ctx.budget);
  const budgetProblem = found && { ...found, fix: budgetFixFor(offer, ctx, found) };
  return { budget, mood: moodOf(trial, parties), unsettles, cabinet, budgetProblem };
}

/** The previous version of a deal or offer with a party, to start the next one from. */
export function previousOffer(state: GameState, partnerId: string): { offer: Offer; source: 'deal' | 'offer' } | null {
  const p = state.partners[partnerId];
  const deal = p ? liveDeal(p) : undefined;
  if (deal && (inGovernment(p!) || p!.status === 'rejected')) return { offer: deal, source: 'deal' };
  const last = [...state.log].reverse().find((l) => l.partnerId === partnerId && l.offer && !l.kind.startsWith('rival'));
  return last?.offer ? { offer: last.offer, source: 'offer' } : null;
}

/** The party's last reply to the player, for "They wanted". */
export function lastResponse(state: GameState, partnerId: string): OfferResponse | undefined {
  return [...state.log].reverse().find((l) => l.partnerId === partnerId && l.response && !l.kind.startsWith('rival'))
    ?.response;
}

/** Every version of each deal the player agreed, oldest first. */
export function dealVersions(state: GameState): Record<string, Offer[]> {
  const versions: Record<string, Offer[]> = {};
  for (const entry of state.log) {
    if (entry.kind === 'accept' && entry.offer) versions[entry.partnerId] = [...(versions[entry.partnerId] ?? []), entry.offer];
  }
  return versions;
}
