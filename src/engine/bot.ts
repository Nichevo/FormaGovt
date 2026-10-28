import type { Party } from '../data/schema';
import { createGame, holdPress, makeOffer, pendingPress, summarise, waitDay, type GameState } from './game';
import { compatibility, eligiblePortfolios, reactionTo, type Offer } from './negotiation';

export type BotStrategy = 'closest' | 'seats';

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
  setup: { seats: Record<string, number>; majority: number; totalSeats: number; seed: number },
  strategy: BotStrategy = 'closest',
): BotRun {
  let g = createGame({ player, parties, ...setup });
  const byId = new Map(parties.map((p) => [p.id, p]));
  // "closest" courts the best fits first; "seats" weights fit by the seats a party brings.
  const value = (id: string) =>
    compatibility(player, byId.get(id)!) * (strategy === 'seats' ? Math.sqrt(setup.seats[id] ?? 0) : 1);
  const order = Object.keys(g.partners).sort((a, b) => value(b) - value(a));
  const drafts: Record<string, Offer> = {};
  for (const id of order) {
    const partner = byId.get(id)!;
    drafts[id] = {
      partnerId: id,
      partnerPolicyIds: partner.policies.filter((p) => p.isBottomLine || reactionTo(player, p) >= 0).map((p) => p.id),
      playerPolicyIds: player.policies.filter((p) => reactionTo(partner, p) >= 0).map((p) => p.id),
      portfolios: eligiblePortfolios(partner).slice(0, 1),
      arrangement: 'coalition',
    };
  }
  const tries: Record<string, number> = {};
  while (g.outcome === 'playing') {
    // Open parties first, then try to win back the rival's partners a couple of times each.
    const id =
      order.find((x) => g.partners[x]!.status === 'open') ??
      order.find((x) => g.partners[x]!.status === 'rival' && (tries[x] ?? 0) < 2);
    if (!id) {
      g = waitDay(g, parties);
      continue;
    }
    tries[id] = (tries[id] ?? 0) + 1;
    const draft = drafts[id]!;
    g = makeOffer(g, parties, draft);
    const r = g.log.filter((l) => l.offer).at(-1)?.response;
    if (r?.counter?.addPolicy) draft.partnerPolicyIds.push(r.counter.addPolicy.id);
    else if (r?.counter?.addPortfolio) draft.portfolios.push(r.counter.addPortfolio);
    else if (r?.kind === 'walk') draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => !r.redLines.some((x) => x.id === p));
    else if (r?.kind === 'hold' && r.sticking) draft.playerPolicyIds = draft.playerPolicyIds.filter((p) => p !== r.sticking!.id);
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
  setup: { seats: Record<string, number>; majority: number; totalSeats: number },
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
