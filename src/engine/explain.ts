import type { Party, Policy } from '../data/schema';
import {
  rivalSeats,
  rivalSigningSeats,
  seatsAgreed,
  seatsSecured,
  type GameState,
  type LogEntry,
} from './game';
import { compatibility, isLikelyPartner, PORTFOLIOS, ruledOutBias, type Offer } from './negotiation';

export interface BlocProgress {
  /** Seats signed. */
  secured: number;
  /** Seats still in sign-off. */
  signing: number;
  /** Seats still needed, counting those signing off. */
  short: number;
}

export function blocProgress(state: GameState): { player: BlocProgress; rival: BlocProgress | null } {
  const secured = seatsSecured(state);
  const agreed = seatsAgreed(state);
  const player = { secured, signing: agreed - secured, short: Math.max(0, state.majority - agreed) };
  if (!state.rivalId || rivalSeats(state) === 0) return { player, rival: null };
  const rs = rivalSeats(state);
  const signing = rivalSigningSeats(state);
  return { player, rival: { secured: rs, signing, short: Math.max(0, state.majority - rs - signing) } };
}

/** "58 of 61, 3 short" or "63 of 61, a majority". */
export function progressText(p: BlocProgress, majority: number): string {
  const total = p.secured + p.signing;
  return p.short > 0 ? `${total} of ${majority}, ${p.short} short` : `${total} of ${majority}, a majority`;
}

/** Seat changes since yesterday for each bloc, with what caused them. */
export function dailyChange(state: GameState, parties: Party[]): { player: string; rival: string } | null {
  const now = state.history.at(-1);
  const before = state.history.at(-2);
  if (!now || !before) return null;
  const name = (id: string) => parties.find((p) => p.id === id)?.name ?? id;
  const events = state.log.filter((l) => l.day === before.day);
  const why = (kinds: LogEntry['kind'][]) =>
    events
      .filter((e) => kinds.includes(e.kind))
      .map((e) => `${name(e.partnerId)} ${e.kind === 'accept' ? 'agreed' : e.kind === 'rival-signing' ? 'agreed' : e.kind === 'left' ? 'left' : e.kind === 'poached' ? 'switched' : e.kind === 'rejected' || e.kind === 'rival-rejected' ? 'voted it down' : 'signed'}`)
      .join(', ');
  const fmt = (diff: number, reason: string, label: string) =>
    diff === 0 ? `${label} no change` : `${label} ${diff > 0 ? '+' : ''}${diff}${reason ? ` (${reason})` : ''}`;
  return {
    player: fmt(now.playerSeats - before.playerSeats, why(['accept', 'signed', 'rejected', 'left', 'poached']), 'You'),
    rival: fmt(now.rivalSeats - before.rivalSeats, why(['rival-deal', 'rival-rejected', 'poached']), 'Rival'),
  };
}

/**
 * The smallest groups of parties still open that would take a bloc to a majority,
 * fewest parties first.
 */
export function pathsToMajority(state: GameState, parties: Party[], bloc: 'player' | 'rival', limit = 3): string[][] {
  const have = bloc === 'player' ? seatsAgreed(state) : rivalSeats(state) + rivalSigningSeats(state);
  if (bloc === 'rival' && rivalSeats(state) === 0) return [];
  const need = state.majority - have;
  if (need <= 0) return [];
  const open = Object.entries(state.partners)
    .filter(([id, p]) => id !== state.rivalId && (p.status === 'open' || (bloc === 'player' && (p.status === 'rival' || p.status === 'rival-signing'))))
    .map(([id]) => id);
  const found: string[][] = [];
  const n = open.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const ids = open.filter((_, i) => mask & (1 << i));
    const seats = ids.reduce((s, id) => s + (state.seats[id] ?? 0), 0);
    if (seats < need) continue;
    // Only minimal groups: dropping any one party would fall short.
    if (ids.some((id) => seats - (state.seats[id] ?? 0) >= need)) continue;
    found.push(ids);
  }
  // Paths through parties from the other side of politics come last and are marked.
  const leader = parties.find((p) => p.id === (bloc === 'player' ? state.playerId : state.rivalId));
  const unlikely = (id: string) => {
    const party = parties.find((p) => p.id === id);
    return !!party && !!leader && !isLikelyPartner(party, leader);
  };
  const unlikelyCount = (ids: string[]) => ids.filter(unlikely).length;
  return found
    .sort((a, b) => unlikelyCount(a) - unlikelyCount(b) || a.length - b.length || a.reduce((s, id) => s + (state.seats[id] ?? 0), 0) - b.reduce((s, id) => s + (state.seats[id] ?? 0), 0))
    .slice(0, limit)
    .map((ids) => ids.map((id) => `${parties.find((p) => p.id === id)?.name ?? id}${unlikely(id) ? ' (unlikely)' : ''}`));
}

export interface WhySigned {
  partyId: string;
  withId: string;
  day: number;
  policies: Policy[];
  bottomLines: { policy: Policy; compromise: boolean }[];
  portfolios: string[];
  arrangement: Offer['arrangement'];
  /** "Rival included 3 of their 4 flagships, you included 1". */
  comparison?: string;
  reasons: string[];
  winBack?: string;
}

function flagshipsIn(party: Party, offer: Offer | undefined): number {
  if (!offer) return 0;
  return party.policies.filter((p) => p.weight >= 4 && offer.partnerPolicyIds.includes(p.id)).length;
}

/** Why a party agreed a deal with the rival bloc, from the offer and its own reply. */
export function whyTheySigned(state: GameState, parties: Party[], entry: LogEntry): WhySigned | null {
  if (!entry.offer || !entry.response || !state.rivalId) return null;
  const party = parties.find((p) => p.id === entry.partnerId)!;
  const rival = parties.find((p) => p.id === state.rivalId)!;
  const player = parties.find((p) => p.id === state.playerId)!;
  const offer = entry.offer;
  const compromised = new Set(offer.compromisePolicyIds ?? []);
  const policies = party.policies.filter((p) => offer.partnerPolicyIds.includes(p.id));
  const flagships = party.policies.filter((p) => p.weight >= 4).length;
  const yourLast = [...state.log]
    .reverse()
    .find((l) => l.partnerId === party.id && l.offer && !l.kind.startsWith('rival') && l.day <= entry.day)?.offer;
  const comparison = yourLast
    ? `The rival included ${flagshipsIn(party, offer)} of their ${flagships} flagships; your last offer included ${flagshipsIn(party, yourLast)}.`
    : `The rival included ${flagshipsIn(party, offer)} of their ${flagships} flagships. You had not made them an offer.`;

  const reasons: string[] = [];
  const fitRival = compatibility(party, rival);
  const fitYou = compatibility(party, player);
  if (fitRival > fitYou + 5) reasons.push(`Closer on policy: a ${fitRival}% match with ${rival.name}, ${fitYou}% with you.`);
  const trust = state.partners[party.id]?.trust ?? 50;
  if (trust < 40) reasons.push(`Low trust in you (${Math.round(trust)} out of 100) after earlier talks.`);
  if (ruledOutBias(party, player.id) > 0.3) reasons.push(`Before the election it signalled it would rather not work with ${player.name}.`);
  if (entry.response.cabinet?.offered && entry.response.cabinet.offered >= entry.response.cabinet.expected) {
    reasons.push(`The rival offered a fair share of cabinet: ${entry.response.cabinet.offered} role${entry.response.cabinet.offered === 1 ? '' : 's'}.`);
  }
  const pressureDay = entry.day / state.days;
  if (pressureDay > 0.6) reasons.push('Late in talks, with pressure to settle.');
  if (reasons.length === 0) reasons.push('The rival made a complete offer first.');

  const missing = party.policies
    .filter((p) => p.weight >= 4 && !(yourLast?.partnerPolicyIds ?? []).includes(p.id))
    .map((p) => `"${p.title}"`);
  const winBack = state.partners[party.id]?.rivalStrain
    ? `${party.name} is unhappy with the rival's other deals, so a fair offer could win them over.`
    : missing.length > 0
      ? `To win them back, include ${missing.slice(0, 3).join(', ')} and beat the rival's offer by a clear margin.`
      : 'To win them back, beat the rival’s offer by a clear margin, for example with more cabinet roles.';

  return {
    partyId: party.id,
    withId: rival.id,
    day: entry.day,
    policies,
    bottomLines: policies.filter((p) => p.isBottomLine).map((policy) => ({ policy, compromise: compromised.has(policy.id) })),
    portfolios: offer.portfolios.map((id) => PORTFOLIOS.find((p) => p.id === id)?.label ?? id),
    arrangement: offer.arrangement,
    comparison,
    reasons,
    winBack,
  };
}

/** Why a party left the rival for the player. */
export function whyTheySwitched(state: GameState, parties: Party[], entry: LogEntry): string[] {
  const party = parties.find((p) => p.id === entry.partnerId)!;
  const accepted = [...state.log].reverse().find((l) => l.partnerId === party.id && l.kind === 'accept' && l.day === entry.day);
  const reasons = [`Your offer beat the rival's deal by a clear margin.`];
  if (accepted?.offer) reasons.push(`It included ${flagshipsIn(party, accepted.offer)} of their flagships and ${accepted.offer.portfolios.length} cabinet role${accepted.offer.portfolios.length === 1 ? '' : 's'}.`);
  return reasons;
}

