import type { Party } from '../data/schema';
import {
  createGame,
  holdPress,
  makeOffer,
  pendingPress,
  reopenDeal,
  summarise,
  waitDay,
  type GameState,
} from './game';
import type { RulesVersion } from './rules';
import { canCompromise, compatibility, eligiblePortfolios, MAX_SOFT_COMMITMENTS, reactionTo, type Offer } from './negotiation';

/**
 * closest and seats are the normal players used to rate difficulty. The others test
 * balance: giveaway offers all of the partner's policies and asks for none of its own;
 * padding adds up to three of the partner's other policies as select committee referrals.
 */
export type BotStrategy = 'closest' | 'seats' | 'giveaway' | 'padding';

export interface BotRun {
  won: boolean;
  score: number;
  game: GameState;
}

/**
 * A simple player: courts the best-fitting parties first, offers their bottom lines
 * and everything it can live with, asks for its own policies they can accept,
 * and follows counter-offers. Used to rate how hard each party is to play.
 */
export function playBot(
  player: Party,
  parties: Party[],
  setup: {
    seats: Record<string, number>;
    majority: number;
    totalSeats: number;
    seed: number;
    days?: number;
    rules?: RulesVersion;
    leadershipChallenges?: boolean;
  },
  strategy: BotStrategy = 'closest',
): BotRun {
  let g = createGame({ player, parties, ...setup });
  const byId = new Map(parties.map((p) => [p.id, p]));
  // "closest" courts the best fits first; "seats" weights fit by the seats a party brings.
  const value = (id: string) =>
    compatibility(player, byId.get(id)!) * (strategy === 'seats' ? Math.sqrt(setup.seats[id] ?? 0) : 1);
  const giveaway = strategy === 'giveaway';
  const order = Object.keys(g.partners).sort((a, b) => value(b) - value(a));
  const drafts: Record<string, Offer> = {};
  for (const id of order) {
    const partner = byId.get(id)!;
    drafts[id] = {
      partnerId: id,
      partnerPolicyIds: partner.policies.filter((p) => giveaway || p.isBottomLine || reactionTo(player, p) >= 0).map((p) => p.id),
      playerPolicyIds: giveaway ? [] : player.policies.filter((p) => reactionTo(partner, p) >= 0).map((p) => p.id),
      portfolios: eligiblePortfolios(partner).slice(0, 1),
      arrangement: 'coalition',
    };
    if (strategy === 'padding') {
      const extra = partner.policies
        .filter((p) => !p.isBottomLine && reactionTo(player, p) === -1)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_SOFT_COMMITMENTS);
      drafts[id]!.partnerPolicyIds.push(...extra.map((p) => p.id));
      drafts[id]!.commitments = Object.fromEntries(extra.map((p) => [p.id, 'committee' as const]));
    }
  }
  const tries: Record<string, number> = {};
  // Parties already in the government, whose red lines the next offer should respect.
  const partnersIn = () =>
    Object.entries(g.partners)
      .filter(([, p]) => p.status === 'signed' || p.status === 'ratifying')
      .map(([pid]) => byId.get(pid)!);
  const respectPartners = (draft: Offer) => {
    const inGov = partnersIn().filter((p) => p.id !== draft.partnerId);
    const crosses = (polId: string) => {
      const pol = [...byId.values()].flatMap((p) => p.policies).find((x) => x.id === polId)!;
      return inGov.some((p) => reactionTo(p, pol) === -2) ? pol : null;
    };
    const compromise = new Set(draft.compromisePolicyIds ?? []);
    draft.playerPolicyIds = draft.playerPolicyIds.filter((id) => !crosses(id) || (canCompromise(crosses(id)!) && compromise.add(id)));
    draft.partnerPolicyIds = draft.partnerPolicyIds.filter((id) => {
      const pol = crosses(id);
      if (!pol) return true;
      if (pol.isBottomLine && canCompromise(pol)) {
        compromise.add(id);
        return true;
      }
      return pol.isBottomLine;
    });
    draft.compromisePolicyIds = [...compromise];
  };
  while (g.outcome === 'playing') {
    // A partner threatening to leave over a red line: compromise or drop the clashing policy in the other deal.
    const unsettledId = Object.keys(g.partners).find((x) => g.partners[x]!.unsettled?.severity === 'red-line');
    if (unsettledId) {
      const clash = new Set(g.partners[unsettledId]!.unsettled!.policyIds);
      const culpritId = Object.keys(g.partners).find(
        (x) => x !== unsettledId && (g.partners[x]!.status === 'signed' || g.partners[x]!.status === 'ratifying') &&
          [...(g.partners[x]!.pendingDeal ?? g.partners[x]!.deal)!.partnerPolicyIds, ...(g.partners[x]!.pendingDeal ?? g.partners[x]!.deal)!.playerPolicyIds].some((pid) => clash.has(pid)),
      );
      if (culpritId && !g.partners[culpritId]!.renegotiating && (tries[`fix-${culpritId}`] ?? 0) < 2) {
        tries[`fix-${culpritId}`] = (tries[`fix-${culpritId}`] ?? 0) + 1;
        g = reopenDeal(g, culpritId);
        const deal = g.partners[culpritId]!.deal!;
        const fixed: Offer = { ...deal, compromisePolicyIds: [...(deal.compromisePolicyIds ?? [])] };
        for (const pid of clash) {
          const pol = byId.get(culpritId)!.policies.find((x) => x.id === pid) ?? player.policies.find((x) => x.id === pid);
          if (pol && canCompromise(pol)) fixed.compromisePolicyIds!.push(pid);
          else {
            fixed.partnerPolicyIds = fixed.partnerPolicyIds.filter((x) => x !== pid);
            fixed.playerPolicyIds = fixed.playerPolicyIds.filter((x) => x !== pid);
          }
        }
        g = makeOffer(g, parties, fixed);
        continue;
      }
    }
    // Open parties first, then try to win back the rival's partners a couple of times each.
    const id =
      order.find((x) => g.partners[x]!.status === 'open') ??
      order.find((x) => (g.partners[x]!.status === 'rival' || g.partners[x]!.status === 'rival-signing') && (tries[x] ?? 0) < 2);
    if (!id) {
      g = waitDay(g, parties);
      continue;
    }
    tries[id] = (tries[id] ?? 0) + 1;
    const draft = drafts[id]!;
    respectPartners(draft);
    g = makeOffer(g, parties, draft);
    const r = g.log.filter((l) => l.offer && l.partnerId === id).at(-1)?.response;
    if (r?.counter?.addPolicy) {
      draft.partnerPolicyIds = [...new Set([...draft.partnerPolicyIds, r.counter.addPolicy.id])];
      if (draft.commitments) delete draft.commitments[r.counter.addPolicy.id];
      if (r.counter.compromise) draft.compromisePolicyIds = [...(draft.compromisePolicyIds ?? []), r.counter.addPolicy.id];
      else draft.compromisePolicyIds = (draft.compromisePolicyIds ?? []).filter((x) => x !== r.counter!.addPolicy!.id);
    } else if (r?.counter?.addPortfolio) draft.portfolios.push(r.counter.addPortfolio);
    else if (r?.counter?.dropPolicy) draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => p !== r.counter!.dropPolicy!.id);
    else if (r?.counter?.softenPolicy) draft.compromisePolicyIds = [...(draft.compromisePolicyIds ?? []), r.counter.softenPolicy.id];
    else if (r?.counter?.cutPolicy) {
      const cut = r.counter.cutPolicy.id;
      draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => p !== cut);
      draft.partnerPolicyIds = draft.partnerPolicyIds.filter((p) => p !== cut);
    } else if (r?.kind === 'walk') draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => !r.redLines.some((x) => x.id === p));
    else if (r?.kind === 'hold' && r.sticking) draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => p !== r.sticking!.id);
    else if (r?.kind === 'hold' && r.budget) {
      // Shed the costliest of its own asks.
      const costly = player.policies
        .filter((p) => draft.playerPolicyIds.includes(p.id))
        .sort((a, b) => (r.budget!.kind === 'cuts' ? (b.fiscalImpactNZDm ?? 0) - (a.fiscalImpactNZDm ?? 0) : (a.fiscalImpactNZDm ?? 0) - (b.fiscalImpactNZDm ?? 0)))[0];
      if (costly) draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => p !== costly.id);
    }
    // A party holding out: give the day a chance to change its mind.
    if (r?.considering) g = waitDay(g, parties);
    for (const pid of pendingPress(g)) g = holdPress(g, pid, 'stability');
  }
  const summary = summarise(g, parties);
  return { won: g.outcome === 'won', score: summary.score, game: g };
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Rates each party for this election result by how often the bot forms a
 * government with it, across both strategies and a few seeds.
 */
export function rateDifficulty(
  parties: Party[],
  setup: { seats: Record<string, number>; majority: number; totalSeats: number; days?: number; rules?: RulesVersion },
  seeds: number[] = [11, 22, 33],
): Record<string, Difficulty> {
  const ratings: Record<string, Difficulty> = {};
  for (const player of parties) {
    if ((setup.seats[player.id] ?? 0) === 0) continue;
    const runs = (['closest', 'seats'] as const).flatMap((strategy) =>
      seeds.map((seed) => playBot(player, parties, { ...setup, seed }, strategy).won),
    );
    const wins = runs.filter(Boolean).length / runs.length;
    ratings[player.id] = wins >= 0.5 ? 'easy' : wins > 0 ? 'medium' : 'hard';
  }
  return ratings;
}
