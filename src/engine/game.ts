import type { Party, Policy } from '../data/schema';
import { evaluateOffer, type Offer, type OfferResponse } from './negotiation';
import { createRng } from './random';

export const DAYS = 10;

export type DealStatus = 'open' | 'ratifying' | 'signed' | 'rejected' | 'walked';

export interface PartnerState {
  trust: number;
  /** Offers that ended in a hold-out or walk-out. */
  failures: number;
  status: DealStatus;
  deal?: Offer;
  /** Day the partner's sign-off process finishes. */
  ratifyOnDay?: number;
}

export interface LogEntry {
  day: number;
  partnerId: string;
  kind: OfferResponse['kind'] | 'signed' | 'rejected' | 'ratifying';
  response?: OfferResponse;
  offer?: Offer;
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
  outcome: 'playing' | 'won' | 'lost';
}

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
    partners[party.id] = { trust, failures: 0, status: 'open' };
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
    outcome: 'playing',
  };
  // A party that already holds a majority on its own wins straight away.
  return checkOutcome(state);
}

/** 0 on day 1, 1 on the last day. */
export function pressureOn(day: number): number {
  return Math.min(1, Math.max(0, (day - 1) / (DAYS - 1)));
}

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

/** Plays one offer, which uses up the day. Returns the new state; the input is not changed. */
export function makeOffer(state: GameState, parties: Party[], offer: Offer): GameState {
  if (state.outcome !== 'playing') return state;
  const player = parties.find((p) => p.id === state.playerId)!;
  const partner = parties.find((p) => p.id === offer.partnerId)!;
  const current = state.partners[offer.partnerId];
  if (!current || current.status !== 'open') return state;

  const response = evaluateOffer(offer, {
    player,
    partner,
    trust: current.trust,
    pressure: pressureOn(state.day),
    otherAgreed: agreedPolicies(state, parties, partner.id),
  });

  const next: PartnerState = { ...current };
  const log: LogEntry[] = [{ day: state.day, partnerId: partner.id, kind: response.kind, response, offer }];
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
  if (response.kind !== 'accept' && next.failures >= partner.personality.patience) next.status = 'walked';

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
  const nextDay = state.day + 1;
  const advanced = { ...state, day: nextDay };
  return processSignOffs(advanced, parties, Math.min(nextDay, DAYS));
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
    }
  });
  return { ...state, partners, log };
}

function checkOutcome(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  if (seatsSecured(state) >= state.majority) return { ...state, outcome: 'won' };
  if (state.day > DAYS) return { ...state, outcome: 'lost', day: DAYS };
  return state;
}

/** A rejected deal can be renegotiated, but trust has taken a hit. */
export function reopenTalks(state: GameState, partnerId: string): GameState {
  const p = state.partners[partnerId];
  if (!p || p.status !== 'rejected') return state;
  return { ...state, partners: { ...state.partners, [partnerId]: { ...p, status: 'open', deal: undefined } } };
}

export interface GameSummary {
  won: Policy[];
  lost: Policy[];
  /** Weighted share of the player's own policies that made it into signed deals, 0 to 100. */
  policyScore: number;
  partners: string[];
}

export function summarise(state: GameState, parties: Party[]): GameSummary {
  const player = parties.find((p) => p.id === state.playerId)!;
  const signed = Object.entries(state.partners).filter(([, p]) => p.status === 'signed');
  const wonIds = new Set(signed.flatMap(([, p]) => p.deal?.playerPolicyIds ?? []));
  // With no partners needed, the player keeps its whole programme.
  const soloMajority = signed.length === 0 && state.outcome === 'won';
  const won = player.policies.filter((p) => soloMajority || wonIds.has(p.id));
  const lost = player.policies.filter((p) => !won.includes(p));
  const total = player.policies.reduce((s, p) => s + p.weight, 0);
  const policyScore =
    state.outcome === 'won' ? Math.round((won.reduce((s, p) => s + p.weight, 0) / total) * 100) : 0;
  return { won, lost, policyScore, partners: signed.map(([id]) => id) };
}
