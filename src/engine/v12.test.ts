import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { budgetFor } from './budget';
import { playBot } from './bot';
import {
  allowedOffer,
  canSetAside,
  challengeLossChance,
  contextFor,
  createGame,
  firmnessFor,
  hintFor,
  makeOffer,
  moodOf,
  type GameState,
} from './game';
import {
  bottomLineFirmness,
  CAUCUS_FLOOR,
  COMMITMENT_VALUE,
  deliveryValue,
  eligiblePortfolios,
  evaluateOffer,
  firmnessMargin,
  offerPolicies,
  reactionTo,
  scoreOffer,
  type Offer,
} from './negotiation';
import { rulesFor } from './rules';
import { pairingMatrix, workable } from './sim';

const party = (id: string) => PARTY_BY_ID[id]!;
const seats = { national: 35, labour: 34, greens: 18, act: 12, nzfirst: 12, opportunity: 7, tpm: 4 };
const setup = { seats, majority: 62, totalSeats: 122 };
const game = (playerId: string, rules?: '1.1' | '1.2', extra: Partial<GameState> = {}): GameState => ({
  ...createGame({ player: party(playerId), parties: PARTIES, ...setup, seed: 1, rules }),
  ...extra,
});
const offer = (partnerId: string, o: Partial<Offer> = {}): Offer => ({
  partnerId,
  partnerPolicyIds: party(partnerId).policies.filter((p) => p.isBottomLine).map((p) => p.id),
  playerPolicyIds: [],
  portfolios: eligiblePortfolios(party(partnerId)).slice(0, 1),
  arrangement: 'coalition',
  ...o,
});

describe('rules versions', () => {
  it('turns every v1.2 rule off for games without a version', () => {
    const r = rulesFor(undefined);
    expect(r.version).toBe('1.1');
    expect([r.caucusFloor, r.softening, r.softCommitments, r.agreeToDisagree, r.csHalfCost]).toEqual([false, false, false, false, false]);
    expect(Object.values(rulesFor('1.2')).filter((v) => v === true)).toHaveLength(5);
  });

  it('keeps v1.1 games free of v1.2 state', () => {
    const g = createGame({ player: party('national'), parties: PARTIES, ...setup, seed: 1, leadershipChallenges: true });
    expect(g.rules).toBeUndefined();
    expect(g.leadershipChallenges).toBeUndefined();
  });

  it('strips v1.2 terms from offers in a v1.1 game', () => {
    const o = offer('act', { commitments: { 'act-rma-reform': 'committee' }, setAsideIds: ['act-no-wealth-taxes'] });
    const clean = allowedOffer(game('national', '1.1', { day: 20 }), o);
    expect(clean.commitments).toBeUndefined();
    expect(clean.setAsideIds).toBeUndefined();
  });
});

describe('lesser commitments', () => {
  it('are worth a share of the policy and cost nothing in the budget', () => {
    const o = offer('act', {
      partnerPolicyIds: ['act-no-wealth-taxes', 'act-two-tax-rates'],
      commitments: { 'act-two-tax-rates': 'committee' },
    });
    const pols = offerPolicies(o, party('national'), party('act'));
    const soft = pols.find((p) => p.id === 'act-two-tax-rates')!;
    expect(soft.commitment).toBe('committee');
    expect(deliveryValue(soft)).toBe(COMMITMENT_VALUE.committee);
    expect(budgetFor([soft]).totalChange).toBe(0);
  });

  it('never meet a bottom line', () => {
    const g = game('national', '1.2');
    const bl = party('act').policies.find((p) => p.isBottomLine)!;
    const o = offer('act', { commitments: { [bl.id]: 'committee' } });
    const r = evaluateOffer(o, contextFor(g, PARTIES, o));
    expect(r.missingBottomLines.map((p) => p.id)).toContain(bl.id);
  });

  it('are capped at three per deal', () => {
    const g = game('labour', '1.2');
    const ids = party('greens').policies.map((p) => p.id);
    const o = offer('greens', { partnerPolicyIds: ids, commitments: Object.fromEntries(ids.map((id) => [id, 'members-bill' as const])) });
    expect(Object.keys(allowedOffer(g, o).commitments!)).toHaveLength(3);
  });

  it('cost the side backing them less', () => {
    const g = game('labour', '1.2');
    const opposed = party('labour').policies.find((p) => reactionTo(party('greens'), p) === -1 || reactionTo(party('greens'), p) === 0)!;
    const full = offer('greens', { playerPolicyIds: [opposed.id] });
    const soft = { ...full, commitments: { [opposed.id]: 'committee' as const } };
    expect(scoreOffer(soft, contextFor(g, PARTIES, soft))).toBeGreaterThan(scoreOffer(full, contextFor(g, PARTIES, full)));
  });
});

describe('agree to disagree', () => {
  it('is only allowed from the middle of talks', () => {
    expect(canSetAside(game('national', '1.2', { day: 5 }))).toBe(false);
    expect(canSetAside(game('national', '1.2', { day: 11 }))).toBe(true);
    expect(canSetAside(game('national', '1.1', { day: 20 }))).toBe(false);
  });

  it('counts a partner bottom line it sets aside as met, and keeps it out of the programme', () => {
    const g = game('labour', '1.2', { day: 15 });
    const bl = party('act').policies.find((p) => p.isBottomLine)!;
    const o = allowedOffer(g, offer('act', { partnerPolicyIds: [], setAsideIds: [bl.id] }));
    const r = evaluateOffer(o, contextFor(g, PARTIES, o));
    expect(r.missingBottomLines).toHaveLength(0);
    expect(offerPolicies(o, party('labour'), party('act')).map((p) => p.id)).not.toContain(bl.id);
  });
});

describe('small parties soften their bottom lines', () => {
  it('keeps big parties firm and lets small ones soften by the deadline', () => {
    expect(bottomLineFirmness(party('labour'), 34, 1)).toBe(1);
    expect(bottomLineFirmness(party('act'), 12, 0)).toBe(1);
    expect(bottomLineFirmness(party('opportunity'), 7, 1)).toBeLessThan(0.9);
    // NZ First likes to hold out, so it softens more slowly than ACT.
    expect(bottomLineFirmness(party('nzfirst'), 12, 1)).toBeGreaterThan(bottomLineFirmness(party('act'), 12, 1));
    expect(firmnessMargin(1)).toBe(Infinity);
    expect(firmnessMargin(0.9)).toBeCloseTo(0.15);
    expect(firmnessFor(game('national', '1.1', { day: 21 }), PARTIES, 'opportunity')).toBe(1);
    expect(firmnessFor(game('national', '1.2', { day: 21 }), PARTIES, 'opportunity')).toBeLessThan(1);
  });
});

describe("partners guard their own voters", () => {
  it('reports the partner mood and refuses a deal its voters would hate', () => {
    const g = game('labour', '1.2');
    // Everything Labour has, nothing for ACT beyond its bottom line.
    const o = offer('act', { playerPolicyIds: party('labour').policies.map((p) => p.id), arrangement: 'confidence-supply', portfolios: [] });
    const r = evaluateOffer(o, contextFor(g, PARTIES, o));
    expect(r.partnerMood).toBeDefined();
    if (r.partnerMood! < CAUCUS_FLOOR) expect(r.kind).not.toBe('accept');
  });

  it('has no partner mood under v1.1', () => {
    const g = game('labour', '1.1');
    const o = offer('greens');
    expect(evaluateOffer(o, contextFor(g, PARTIES, o)).partnerMood).toBeUndefined();
  });
});

describe('confidence and supply case by case', () => {
  it('votes against a policy over its red line rather than walking out, under v1.2 only', () => {
    const red = party('labour').policies.find((p) => reactionTo(party('act'), p) === -2)!;
    const o = offer('act', { playerPolicyIds: [red.id], arrangement: 'confidence-supply', portfolios: [] });
    const old = evaluateOffer(o, contextFor(game('labour', '1.1'), PARTIES, o));
    const now = evaluateOffer(o, contextFor(game('labour', '1.2'), PARTIES, o));
    expect(old.kind).toBe('walk');
    expect(now.redLines).toHaveLength(0);
  });
});

describe('leadership challenges', () => {
  it('scales the chance of losing with how far voters are below the line', () => {
    expect(challengeLossChance(40)).toBe(0);
    expect(challengeLossChance(30)).toBeCloseTo(0.15);
    expect(challengeLossChance(0)).toBe(0.85);
  });

  it('stops a leader who gives everything away from usually winning', () => {
    let won = 0;
    let rolled = 0;
    for (const id of ['national', 'labour', 'greens', 'opportunity']) {
      for (const seed of [1, 2, 3]) {
        const run = playBot(party(id), PARTIES, { ...setup, seed, rules: '1.2', leadershipChallenges: true }, 'giveaway');
        if (run.won) won++;
        if (run.game.lostTo === 'caucus') rolled++;
      }
    }
    expect(rolled).toBeGreaterThan(won);
  });

  it('leaves normal play alone', () => {
    for (const id of ['national', 'labour']) {
      const off = playBot(party(id), PARTIES, { ...setup, seed: 4, rules: '1.2' });
      const on = playBot(party(id), PARTIES, { ...setup, seed: 4, rules: '1.2', leadershipChallenges: true });
      expect(on.game.outcome).toBe(off.game.outcome);
    }
  });
});

describe("negotiator's hint", () => {
  it('says yes to an offer the partner would sign, and gives a tip otherwise', () => {
    const g = game('national', '1.2');
    const generous = offer('act', {
      partnerPolicyIds: party('act').policies.map((p) => p.id),
      portfolios: eligiblePortfolios(party('act')).slice(0, 3),
    });
    const real = makeOffer(g, PARTIES, generous);
    const accepted = real.log.find((l) => l.partnerId === 'act' && l.offer)?.response?.kind === 'accept';
    expect(hintFor(g, PARTIES, generous)?.verdict).toBe(accepted ? 'yes' : expect.anything());
    const empty = offer('act', { partnerPolicyIds: [], portfolios: [] });
    expect(hintFor(g, PARTIES, empty)?.verdict).not.toBe('yes');
    expect(hintFor(g, PARTIES, empty)?.tip).toBeTruthy();
  });
});

describe('every pairing', () => {
  it('opens more workable two-party deals under v1.2 without losing any', () => {
    const before = pairingMatrix(PARTIES, { ...setup, rules: '1.1' });
    const after = pairingMatrix(PARTIES, { ...setup, rules: '1.2' });
    let gained = 0;
    for (const a of Object.keys(before)) {
      for (const b of Object.keys(before[a]!)) {
        if (workable(before[a]![b]!)) expect(workable(after[a]![b]!), `${a} with ${b}`).toBe(true);
        else if (workable(after[a]![b]!)) gained++;
      }
    }
    expect(gained).toBeGreaterThanOrEqual(6);
  }, 120_000);

  it('keeps the voter mood the same for a game with no deals', () => {
    expect(moodOf(game('national', '1.2'), PARTIES).mood).toBe(moodOf(game('national', '1.1'), PARTIES).mood);
  });
});
