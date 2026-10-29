import type { Party } from '../data/schema';
import { playBot, type BotStrategy } from './bot';
import { allowedOffer, contextFor, createGame, moodOf, partnerVoterMood, agreedPolicies, type GameState } from './game';
import {
  canCompromise,
  eligiblePortfolios,
  evaluateOffer,
  expectedCabinet,
  reactionTo,
  type Arrangement,
  type Offer,
} from './negotiation';
import type { RulesVersion } from './rules';
import { REVOLT_BELOW } from './voters';

/**
 * Balance sims: the bot players over many games, and a search for a workable
 * two-party deal between every pair of parties. Used by the tests and `npm run sim`.
 */

export interface SimSetup {
  seats: Record<string, number>;
  majority: number;
  totalSeats: number;
  days?: number;
  rules?: RulesVersion;
  leadershipChallenges?: boolean;
}

export interface BalanceResult {
  games: number;
  won: number;
  rival: number;
  deadline: number;
  caucus: number;
  /** Median final score of the games won. */
  medianScore: number;
  perParty: Record<string, { games: number; won: number }>;
}

export function balanceRun(parties: Party[], setup: SimSetup, strategies: BotStrategy[], seeds: number[]): BalanceResult {
  const result: BalanceResult = { games: 0, won: 0, rival: 0, deadline: 0, caucus: 0, medianScore: 0, perParty: {} };
  const scores: number[] = [];
  for (const player of parties) {
    if (!setup.seats[player.id]) continue;
    const mine = (result.perParty[player.id] = { games: 0, won: 0 });
    for (const strategy of strategies) {
      for (const seed of seeds) {
        const run = playBot(player, parties, { ...setup, seed }, strategy);
        result.games++;
        mine.games++;
        if (run.won) {
          result.won++;
          mine.won++;
          scores.push(run.score);
        } else result[run.game.lostTo ?? 'deadline']++;
      }
    }
  }
  scores.sort((a, b) => a - b);
  result.medianScore = scores[Math.floor(scores.length / 2)] ?? 0;
  return result;
}

export interface PairDeal {
  playerMood: number;
  partnerMood: number;
  day: number;
  arrangement: Arrangement;
  strategy: string;
  offer: Offer;
}

/** The partner's voters must stay above this for a pairing to count as workable. */
export const PAIR_PARTNER_FLOOR = REVOLT_BELOW;

/** True when neither side's voters revolt. */
export function workable(deal: PairDeal | null): boolean {
  return !!deal && deal.playerMood >= REVOLT_BELOW && deal.partnerMood >= PAIR_PARTNER_FLOOR;
}

/** Follows the partner's counter-offers until it agrees, or gives up. */
function negotiate(state: GameState, parties: Party[], player: Party, partner: Party, start: Offer): Offer | null {
  let o: Offer = structuredClone(start);
  for (let i = 0; i < 30; i++) {
    o = allowedOffer(state, o);
    const res = evaluateOffer(o, contextFor(state, parties, o));
    if (res.kind === 'accept') return o;
    const c = res.counter;
    const soft = { ...(o.commitments ?? {}) };
    if (c?.addPolicy) {
      const id = c.addPolicy.id;
      delete soft[id];
      o = {
        ...o,
        partnerPolicyIds: [...new Set([...o.partnerPolicyIds, id])],
        compromisePolicyIds: c.compromise
          ? [...new Set([...(o.compromisePolicyIds ?? []), id])]
          : (o.compromisePolicyIds ?? []).filter((x) => x !== id),
        commitments: soft,
      };
    } else if (c?.addPortfolio) o = { ...o, portfolios: [...o.portfolios, c.addPortfolio] };
    else if (c?.softenPolicy) o = { ...o, compromisePolicyIds: [...(o.compromisePolicyIds ?? []), c.softenPolicy.id] };
    else if (c?.cutPolicy || c?.dropPolicy) {
      const id = (c.cutPolicy ?? c.dropPolicy)!.id;
      o = { ...o, playerPolicyIds: o.playerPolicyIds.filter((x) => x !== id), partnerPolicyIds: o.partnerPolicyIds.filter((x) => x !== id) };
    } else if (res.kind === 'walk') {
      if (!res.redLines.length) return null;
      const out = new Set(res.redLines.map((p) => p.id));
      o = { ...o, playerPolicyIds: o.playerPolicyIds.filter((x) => !out.has(x)), partnerPolicyIds: o.partnerPolicyIds.filter((x) => !out.has(x)) };
    } else if (res.sticking) o = { ...o, playerPolicyIds: o.playerPolicyIds.filter((x) => x !== res.sticking!.id) };
    else if (res.budget) {
      const costly = player.policies
        .filter((p) => o.playerPolicyIds.includes(p.id))
        .sort((a, b) => (a.fiscalImpactNZDm ?? 0) - (b.fiscalImpactNZDm ?? 0))[0];
      if (!costly) return null;
      o = { ...o, playerPolicyIds: o.playerPolicyIds.filter((x) => x !== costly.id) };
    } else {
      // Concede: the partner's next policy, else one fewer ask of your own.
      const next = partner.policies
        .filter((p) => !o.partnerPolicyIds.includes(p.id) && reactionTo(player, p) > -2)
        .sort((a, b) => b.weight - a.weight)[0];
      if (next) o = { ...o, partnerPolicyIds: [...o.partnerPolicyIds, next.id] };
      else if (o.playerPolicyIds.length) o = { ...o, playerPolicyIds: o.playerPolicyIds.slice(0, -1) };
      else return null;
    }
  }
  return null;
}

/** Opening offers the search tries: from generous to the bare minimum, with v1.2's levers where allowed. */
function openings(state: GameState, player: Party, partner: Party, arrangement: Arrangement, v12: boolean): Record<string, Offer> {
  const exp = expectedCabinet(partner, state.seats[partner.id] ?? 0, (state.seats[player.id] ?? 0) + (state.seats[partner.id] ?? 0)).expected;
  const portfolios = arrangement === 'coalition' ? eligiblePortfolios(partner).slice(0, exp) : [];
  const bottom = partner.policies.filter((p) => p.isBottomLine);
  const mine = player.policies.filter((p) => reactionTo(partner, p) >= 0).map((p) => p.id);
  const base = { partnerId: partner.id, playerPolicyIds: mine, portfolios, arrangement };
  const offers: Record<string, Offer> = {
    generous: { ...base, partnerPolicyIds: partner.policies.filter((p) => p.isBottomLine || reactionTo(player, p) >= 0).map((p) => p.id) },
    minimal: { ...base, partnerPolicyIds: bottom.map((p) => p.id) },
    compromise: { ...base, partnerPolicyIds: bottom.map((p) => p.id), compromisePolicyIds: bottom.filter(canCompromise).map((p) => p.id) },
    giveaway: { ...base, partnerPolicyIds: partner.policies.map((p) => p.id), playerPolicyIds: [] },
  };
  if (!v12) return offers;
  const cs = arrangement === 'confidence-supply';
  // Your policies the partner would otherwise refuse, offered as lesser commitments (red lines only under C&S).
  const mineSoft = player.policies
    .filter((p) => reactionTo(partner, p) < 0 && (cs || reactionTo(partner, p) > -2))
    .sort((a, b) => b.weight - a.weight);
  // The partner policies you dislike most, as lesser commitments.
  const theirsSoft = partner.policies
    .filter((p) => !p.isBottomLine && reactionTo(player, p) < 0)
    .sort((a, b) => b.weight - a.weight);
  const liked = partner.policies.filter((p) => !p.isBottomLine && reactionTo(player, p) >= 0).map((p) => p.id);
  const bottomIds = bottom.map((p) => p.id);
  const variants: Record<string, Offer> = {};
  for (const [name, mineN, theirsN] of [
    ['soft-theirs', 0, 3],
    ['soft-mine', 3, 0],
    ['soft-mixed', 2, 1],
  ] as const) {
    const m = mineSoft.slice(0, mineN);
    const t = theirsSoft.slice(0, theirsN);
    variants[name] = {
      ...base,
      playerPolicyIds: [...new Set([...mine, ...m.map((p) => p.id)])],
      partnerPolicyIds: [...bottomIds, ...liked, ...t.map((p) => p.id)],
      commitments: Object.fromEntries([...m, ...t].map((p) => [p.id, 'committee' as const])),
    };
    variants[`${name}-compromise`] = { ...variants[name]!, compromisePolicyIds: bottom.filter(canCompromise).map((p) => p.id) };
  }
  Object.assign(offers, variants);
  // An abstention: the partner's two policies you mind least, and your whole programme.
  if (arrangement === 'coalition') {
    const easiest = [...partner.policies].sort((a, b) => reactionTo(player, b) - reactionTo(player, a) || b.weight - a.weight).slice(0, 2);
    offers.abstain = { ...base, arrangement: 'abstain', portfolios: [], playerPolicyIds: player.policies.map((p) => p.id), partnerPolicyIds: easiest.map((p) => p.id) };
    offers['abstain-flagships'] = { ...offers.abstain, partnerPolicyIds: [...partner.policies].sort((a, b) => b.weight - a.weight).slice(0, 2).map((p) => p.id) };
  }
  // Agree to disagree: on a partner bottom line you cannot accept, or on one of your bottom lines it cannot accept.
  const asideOptions = [
    ...bottom.filter((p) => reactionTo(player, p) < 0),
    ...player.policies.filter((p) => p.isBottomLine && reactionTo(partner, p) < 0),
  ];
  for (const [name, o] of Object.entries({ ...offers })) {
    for (const pol of asideOptions) {
      const theirs = partner.policies.includes(pol);
      offers[`${name}+aside-${pol.id}`] = {
        ...o,
        partnerPolicyIds: theirs ? [...new Set([...o.partnerPolicyIds, pol.id])] : o.partnerPolicyIds,
        playerPolicyIds: theirs ? o.playerPolicyIds : [...new Set([...o.playerPolicyIds, pol.id])],
        setAsideIds: [pol.id],
      };
    }
  }
  return offers;
}

/**
 * The best two-party deal a simple search can find between a player and a partner,
 * judged by the less happy side's voters. Tries day 1, mid-talks and the last day,
 * coalition and confidence and supply, and several opening offers.
 */
export function searchPair(player: Party, partner: Party, parties: Party[], setup: SimSetup): PairDeal | null {
  const days = setup.days ?? 21;
  const v12 = setup.rules === '1.2';
  let best: PairDeal | null = null;
  for (const day of [1, Math.ceil(days / 2) + 1, days]) {
    const fresh = createGame({ player, parties, ...setup, seed: 1 });
    if (!fresh.partners[partner.id] || fresh.outcome !== 'playing') return null;
    const state: GameState = { ...fresh, day };
    for (const arrangement of ['coalition', 'confidence-supply'] as Arrangement[]) {
      for (const [strategy, start] of Object.entries(openings(state, player, partner, arrangement, v12))) {
        const offer = negotiate(state, parties, player, partner, start);
        if (!offer) continue;
        const trial: GameState = {
          ...state,
          partners: { ...state.partners, [partner.id]: { ...state.partners[partner.id]!, status: 'ratifying', deal: offer } },
        };
        const playerMood = moodOf(trial, parties).mood;
        const partnerMood = partnerVoterMood({
          party: partner,
          leader: player,
          offer,
          otherAgreed: agreedPolicies(state, parties, partner.id),
          others: [],
          seats: state.seats,
          coalition: (state.seats[player.id] ?? 0) + (state.seats[partner.id] ?? 0),
          csHalfCost: v12,
        });
        const deal: PairDeal = { playerMood, partnerMood, day, arrangement, strategy, offer };
        const score = (d: PairDeal) => Math.min(d.playerMood, d.partnerMood);
        if (!best || score(deal) > score(best)) best = deal;
      }
    }
  }
  return best;
}

export function pairingMatrix(parties: Party[], setup: SimSetup): Record<string, Record<string, PairDeal | null>> {
  const out: Record<string, Record<string, PairDeal | null>> = {};
  for (const a of parties) {
    if (!setup.seats[a.id]) continue;
    out[a.id] = {};
    for (const b of parties) {
      if (a.id === b.id || !setup.seats[b.id]) continue;
      out[a.id]![b.id] = searchPair(a, b, parties, setup);
    }
  }
  return out;
}
