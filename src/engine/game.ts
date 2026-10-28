import type { Party, Policy } from '../data/schema';
import { budgetFor, type Budget } from './budget';
import {
  compatibility,
  eligiblePortfolios,
  evaluateOffer,
  reactionTo,
  type Offer,
  type OfferResponse,
  type PortfolioId,
} from './negotiation';
import { createRng } from './random';
import { voterMood, type VoterMood } from './voters';

export const DAYS = 10;

/** "rival" means the party has signed up with the rival bloc. */
export type DealStatus = 'open' | 'ratifying' | 'signed' | 'rejected' | 'walked' | 'rival';

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
}

export interface LogEntry {
  day: number;
  partnerId: string;
  kind: OfferResponse['kind'] | 'signed' | 'rejected' | 'ratifying' | 'rival-deal' | 'poached' | 'rival-collapse';
  response?: OfferResponse;
  offer?: Offer;
  /** For rival events: the rival bloc's lead party. */
  otherId?: string;
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
  /** Why the game was lost. */
  lostTo?: 'deadline' | 'rival';
}

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
}

export function createGame({ player, parties, seats, majority, totalSeats, seed }: NewGame): GameState {
  const partners: Record<string, PartnerState> = {};
  for (const party of parties) {
    if (party.id === player.id || (seats[party.id] ?? 0) === 0) continue;
    const trust = party.relationships.find((r) => r.partyId === player.id)?.trust ?? 30;
    partners[party.id] = { trust, failures: 0, status: 'open', rivalAttempts: 0 };
  }
  const state: GameState = {
    seed,
    day: 1,
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
  };
  // A party that already holds a majority on its own wins straight away.
  return recordDay(checkOutcome(state), parties);
}

/** 0 on day 1, 1 on the last day. */
export function pressureOn(day: number): number {
  return Math.min(1, Math.max(0, (day - 1) / (DAYS - 1)));
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
  const base = Math.min(1, pressureOn(state.day) + race);
  const party = partyId ? parties.find((p) => p.id === partyId) : undefined;
  return party?.personality.kingmaker ? base * 0.8 : base;
}

/** Breaking a signed deal with the rival takes a clearly better offer. */
export const POACH_PREMIUM = 0.12;

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

/** Policies from deals that are signed or being signed, other than the given partner's. */
export function agreedPolicies(state: GameState, parties: Party[], exceptPartnerId?: string): Policy[] {
  const byId = new Map(parties.flatMap((p) => p.policies.map((pol) => [pol.id, pol] as const)));
  const ids = new Set<string>();
  for (const [id, p] of Object.entries(state.partners)) {
    if (id === exceptPartnerId || !p.deal || (p.status !== 'signed' && p.status !== 'ratifying')) continue;
    for (const pid of [...p.deal.partnerPolicyIds, ...p.deal.playerPolicyIds]) ids.add(pid);
  }
  return [...ids].map((id) => byId.get(id)).filter((p): p is Policy => p !== undefined);
}

/** Cabinet roles promised in deals signed or being signed, with the partner holding each. */
export function takenPortfolios(state: GameState, exceptPartnerId?: string): Map<PortfolioId, string> {
  const taken = new Map<PortfolioId, string>();
  for (const [id, p] of Object.entries(state.partners)) {
    if (id === exceptPartnerId || !p.deal || (p.status !== 'signed' && p.status !== 'ratifying')) continue;
    for (const portfolio of p.deal.portfolios) taken.set(portfolio, id);
  }
  return taken;
}

/** Plays one offer, which uses up the day. Returns the new state; the input is not changed. */
export function makeOffer(state: GameState, parties: Party[], offer: Offer): GameState {
  if (state.outcome !== 'playing') return state;
  const player = parties.find((p) => p.id === state.playerId)!;
  const partner = parties.find((p) => p.id === offer.partnerId)!;
  const current = state.partners[offer.partnerId];
  if (!current || (current.status !== 'open' && current.status !== 'rival')) return state;
  const poaching = current.status === 'rival';
  // A cabinet role can only be promised once.
  const taken = takenPortfolios(state, partner.id);
  offer = { ...offer, portfolios: offer.portfolios.filter((p) => !taken.has(p)) };

  const otherAgreed = agreedPolicies(state, parties, partner.id);
  const offered = [...partner.policies, ...player.policies].filter(
    (p) => offer.partnerPolicyIds.includes(p.id) || offer.playerPolicyIds.includes(p.id),
  );
  const response = evaluateOffer(offer, {
    player,
    partner,
    trust: current.trust,
    pressure: pressureFor(state, parties, partner.id),
    otherAgreed,
    budgetChange: budgetFor([...otherAgreed, ...offered]).change,
    takenPortfolios: [...taken.keys()],
  });
  if (poaching && response.kind === 'accept' && response.utility < response.threshold + POACH_PREMIUM) {
    // Good enough to sign fresh, not good enough to break a deal: they ask for more.
    response.kind = 'counter';
    response.counter = {
      addPolicy: partner.policies.filter((p) => !offer.partnerPolicyIds.includes(p.id)).sort((a, b) => b.weight - a.weight)[0],
    };
  }

  const next: PartnerState = { ...current };
  const log: LogEntry[] = [{ day: state.day, partnerId: partner.id, kind: response.kind, response, offer }];
  if (response.kind === 'accept' && poaching) {
    log.push({ day: state.day, partnerId: partner.id, kind: 'poached', otherId: state.rivalId ?? undefined });
  }
  if (response.kind === 'accept') {
    next.deal = offer;
    next.status = 'ratifying';
    next.ratifyOnDay = state.day + partner.ratification.days;
  } else if (response.kind === 'walk') {
    next.failures += 1;
    next.trust = Math.max(0, next.trust - 15);
  } else if (response.kind === 'hold') {
    next.failures += 1;
    next.trust = Math.max(0, next.trust - 3);
  }
  // A party already with the rival just stays there when talks fail.
  if (response.kind !== 'accept' && !poaching && next.failures >= partner.personality.patience) next.status = 'walked';

  const afterOffer: GameState = {
    ...state,
    partners: { ...state.partners, [partner.id]: next },
    log: [...state.log, ...log],
  };
  // A party whose leader decides on the spot signs the same day.
  const signedToday = processSignOffs(afterOffer, parties, state.day);
  return checkOutcome(endDay(signedToday, parties));
}

/** Spends a day without making an offer, letting sign-offs run. */
export function waitDay(state: GameState, parties: Party[]): GameState {
  if (state.outcome !== 'playing') return state;
  return checkOutcome(endDay(state, parties));
}

function endDay(state: GameState, parties: Party[]): GameState {
  const afterRival = rivalMove(state, parties);
  const nextDay = state.day + 1;
  const advanced = { ...afterRival, day: nextDay };
  return recordDay(processSignOffs(advanced, parties, Math.min(nextDay, DAYS)), parties);
}

function recordDay(state: GameState, parties: Party[]): GameState {
  const day = Math.min(state.day, DAYS);
  const point: DayPoint = {
    day,
    playerSeats: seatsAgreed(state),
    rivalSeats: rivalSeats(state),
    mood: moodOf(state, parties).mood,
    balance: budgetFor(programmeOf(state, parties)).balance,
    pressure: Math.round(pressureFor(state, parties) * 100),
  };
  return { ...state, history: [...state.history.filter((h) => h.day !== day), point] };
}

/**
 * The rival bloc's turn at the end of each day from day 2: it makes one offer to the open
 * party it fits best, conceding a little more each time it is turned down.
 */
function rivalMove(state: GameState, parties: Party[]): GameState {
  const rival = parties.find((p) => p.id === state.rivalId);
  // The player gets a day's head start.
  if (!rival || state.day < 2 || rivalSeats(state) === 0) return state;
  const candidates = Object.entries(state.partners)
    .filter(([id, p]) => id !== rival.id && p.status === 'open' && !p.rivalBlocked)
    .map(([id, p]) => ({ id, p, party: parties.find((x) => x.id === id)! }))
    .sort((a, b) => compatibility(rival, b.party) * (state.seats[b.id] ?? 0) - compatibility(rival, a.party) * (state.seats[a.id] ?? 0));
  const target = candidates[0];
  if (!target) return state;

  const { party, p } = target;
  const acceptable = party.policies.filter((pol) => pol.isBottomLine || reactionTo(rival, pol) >= 0);
  const extra = party.policies.filter((pol) => !acceptable.includes(pol)).slice(0, p.rivalAttempts);
  const offer: Offer = {
    partnerId: party.id,
    partnerPolicyIds: [...acceptable, ...extra].map((pol) => pol.id),
    playerPolicyIds: rival.policies.filter((pol) => pol.weight >= 4 && reactionTo(party, pol) >= 0).map((pol) => pol.id),
    portfolios: eligiblePortfolios(party).slice(0, 1 + Math.min(2, p.rivalAttempts)),
    arrangement: 'coalition',
  };
  const trust = party.relationships.find((r) => r.partyId === rival.id)?.trust ?? 30;
  const response = evaluateOffer(offer, { player: rival, partner: party, trust, pressure: pressureFor(state, parties, party.id) });

  const next: PartnerState = { ...p, rivalAttempts: p.rivalAttempts + 1 };
  const log = [...state.log];
  if (response.kind === 'accept') {
    next.status = 'rival';
    log.push({ day: state.day, partnerId: party.id, kind: 'rival-deal', otherId: rival.id });
  } else if (response.kind === 'walk') {
    next.rivalBlocked = true;
  }
  return { ...state, partners: { ...state.partners, [party.id]: next }, log };
}

/**
 * Finishes any sign-off due by the given day. A party whose members see its
 * flagship policies dropped may vote the deal down.
 */
function processSignOffs(state: GameState, parties: Party[], day: number): GameState {
  const partners = { ...state.partners };
  const log = [...state.log];
  Object.entries(partners).forEach(([id, p], index) => {
    if (p.status !== 'ratifying' || (p.ratifyOnDay ?? 0) > day) return;
    const party = parties.find((x) => x.id === id)!;
    const flagships = party.policies.filter((pol) => pol.weight >= 4);
    const dropped = flagships.filter((pol) => !p.deal?.partnerPolicyIds.includes(pol.id));
    const risk = party.ratification.rejectionRisk * (flagships.length ? dropped.length / flagships.length : 0);
    const roll = createRng(state.seed + day * 31 + index)();
    if (roll < risk) {
      partners[id] = { ...p, status: 'rejected', trust: Math.max(0, p.trust - 10) };
      log.push({ day, partnerId: id, kind: 'rejected' });
    } else {
      partners[id] = { ...p, status: 'signed' };
      log.push({ day, partnerId: id, kind: 'signed' });
      // When the rival's own lead party signs with the player, its bloc falls apart.
      if (id === state.rivalId) {
        for (const [otherId, other] of Object.entries(partners)) {
          if (other.status === 'rival') partners[otherId] = { ...other, status: 'open' };
        }
        log.push({ day, partnerId: id, kind: 'rival-collapse' });
      }
    }
  });
  return { ...state, partners, log };
}

function checkOutcome(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  if (seatsSecured(state) >= state.majority) return { ...state, outcome: 'won' };
  if (rivalSeats(state) >= state.majority) return { ...state, outcome: 'lost', lostTo: 'rival', day: Math.min(state.day, DAYS) };
  if (state.day > DAYS) return { ...state, outcome: 'lost', lostTo: 'deadline', day: DAYS };
  return state;
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
 * The government's programme: every policy in the deals. A party with a majority
 * of its own needs no deal and keeps its whole programme.
 */
export function programmeOf(state: GameState, parties: Party[], includeRatifying = true): Policy[] {
  const player = parties.find((p) => p.id === state.playerId)!;
  const deals = dealPartners(state, includeRatifying);
  if (deals.length === 0 && state.outcome === 'won') return player.policies;
  const byId = new Map(parties.flatMap((p) => p.policies.map((pol) => [pol.id, pol] as const)));
  const ids = new Set(deals.flatMap(([, p]) => [...(p.deal?.partnerPolicyIds ?? []), ...(p.deal?.playerPolicyIds ?? [])]));
  return [...ids].map((id) => byId.get(id)).filter((p): p is Policy => p !== undefined);
}

export function pressSpin(state: GameState): number {
  return state.press.reduce((s, p) => s + PRESS_OPTIONS[p.spin].mood, 0);
}

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
  return { ...state, partners, press: [...state.press, { day: Math.min(state.day, DAYS), partnerId, spin }] };
}

/** Policies backed only through confidence and supply count for this much: the partner votes case by case. */
export const CONFIDENCE_SUPPLY_FACTOR = 0.75;

export interface GameSummary {
  won: Policy[];
  lost: Policy[];
  /** Weighted share of the player's own policies that made it into signed deals, 0 to 100. */
  policyScore: number;
  mood: VoterMood;
  /** 100 when every partner is in cabinet; confidence and supply seats count for half. */
  stability: number;
  /** 60% policies, 30% voter mood, 10% stability, 0 to 100. Zero without a government. */
  score: number;
  partners: string[];
}

export function summarise(state: GameState, parties: Party[]): GameSummary {
  const player = parties.find((p) => p.id === state.playerId)!;
  const signed = dealPartners(state, false);
  const programme = new Set(programmeOf(state, parties, false).map((p) => p.id));
  // A policy only a confidence and supply partner backs counts for less than one a coalition partner backs.
  const coalitionBacked = new Set(
    signed.filter(([, p]) => p.deal?.arrangement === 'coalition').flatMap(([, p]) => p.deal?.playerPolicyIds ?? []),
  );
  const soloMajority = signed.length === 0 && state.outcome === 'won';
  const won = player.policies.filter((p) => programme.has(p.id));
  const lost = player.policies.filter((p) => !programme.has(p.id));
  const total = player.policies.reduce((s, p) => s + p.weight, 0);
  const earned = won.reduce(
    (s, p) => s + p.weight * (soloMajority || coalitionBacked.has(p.id) ? 1 : CONFIDENCE_SUPPLY_FACTOR),
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
  const stability = Math.round((seatWeight / seatTotal) * 100);
  const score = Math.round(0.6 * policyScore + 0.3 * mood.mood + 0.1 * stability);
  return { won, lost, policyScore, mood, stability, score, partners: signed.map(([id]) => id) };
}

/** The budget and voter mood if the partner agreed to this offer now. */
export function previewDeal(state: GameState, parties: Party[], offer: Offer): { budget: Budget; mood: VoterMood } {
  const current = state.partners[offer.partnerId];
  if (!current) return { budget: budgetFor(programmeOf(state, parties)), mood: moodOf(state, parties) };
  const trial: GameState = {
    ...state,
    partners: { ...state.partners, [offer.partnerId]: { ...current, status: 'ratifying', deal: offer } },
  };
  return { budget: budgetFor(programmeOf(trial, parties)), mood: moodOf(trial, parties) };
}
