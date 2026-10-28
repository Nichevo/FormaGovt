import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { BASELINE, BASELINE_YEARS, budgetFor, KEY_YEAR_INDEX, yearlyImpact } from './budget';
import {
  createGame,
  DEFAULT_DAYS,
  makeOffer,
  moodOf,
  pressureOn,
  previewDeal,
  reopenDeal,
  rivalSeats,
  SHORT_DAYS,
  waitDay,
  offerDays,
  offerSize,
  SMALL_OFFER,
  BIG_OFFER,
  QUICK_OFFERS_PER_DAY,
  type GameState,
} from './game';
import {
  acceptanceThreshold,
  budgetProblemFor,
  compromiseOf,
  eligiblePortfolios,
  evaluateOffer,
  expectedCabinet,
  reactionTo,
  type NegotiationContext,
  type Offer,
} from './negotiation';
import { blocProgress, pathsToMajority, progressText, whyTheySigned } from './explain';

const party = (id: string) => PARTY_BY_ID[id]!;
const policy = (partyId: string, id: string) => party(partyId).policies.find((p) => p.id === id)!;
const seats = { national: 35, labour: 34, greens: 18, act: 12, nzfirst: 12, opportunity: 7, tpm: 4 };
const newGame = (playerId: string, days?: number) =>
  createGame({ player: party(playerId), parties: PARTIES, seats, majority: 62, totalSeats: 123, seed: 1, days });
const fullOffer = (partnerId: string, playerPolicyIds: string[] = []): Offer => ({
  partnerId,
  partnerPolicyIds: party(partnerId).policies.map((p) => p.id),
  playerPolicyIds,
  portfolios: eligiblePortfolios(party(partnerId)).slice(0, 3),
  arrangement: 'coalition',
});

describe('detailed budget', () => {
  it('keeps the 2028/29 figure every policy had, and spreads it over four years', () => {
    for (const p of PARTIES.flatMap((x) => x.policies)) {
      expect(yearlyImpact(p)[KEY_YEAR_INDEX]).toBe(p.fiscalImpactNZDm ?? 0);
    }
    // Starts in July 2027, so nothing in 2026/27.
    expect(yearlyImpact(policy('labour', 'lab-cgt'))[0]).toBe(0);
    // No start year: half a year in 2026/27.
    expect(yearlyImpact(policy('labour', 'lab-gp-visits'))[0]).toBe(-175);
  });

  it('splits revenue from spending and groups by party and category', () => {
    const b = budgetFor([policy('labour', 'lab-cgt'), policy('labour', 'lab-gp-visits'), policy('act', 'act-two-tax-rates')], PARTIES);
    const year = b.years[KEY_YEAR_INDEX]!;
    expect(year.revenue).toBe(560 - 2500);
    expect(year.spending).toBe(-350);
    expect(year.baseline).toBe(BASELINE.balanceNZDm);
    expect(b.byParty.map((g) => g.key).sort()).toEqual(['act', 'labour']);
    expect(b.byIssue.find((g) => g.key === 'tax')!.lines).toHaveLength(2);
    expect(b.totalChange).toBe(b.years.reduce((s, y) => s + y.change, 0));
    // More borrowing pushes net debt up.
    expect(b.debt.withDeal).toBeGreaterThan(BASELINE_YEARS.netDebtPctGdp.at(-1)!);
    expect(b.estimateShare).toBeGreaterThan(0);
  });
});

describe('game length', () => {
  it('runs three weeks by default, with a ten-day short game', () => {
    expect(newGame('labour').days).toBe(DEFAULT_DAYS);
    expect(newGame('labour', SHORT_DAYS).days).toBe(10);
    expect(pressureOn(21, 21)).toBe(1);
    expect(pressureOn(10, 21)).toBeLessThan(0.5);
  });
});

describe('rival sign-off', () => {
  it('makes a party joining the rival go through its own sign-off first', () => {
    let g = newGame('national');
    while (g.partners.greens!.status === 'open' && g.day < 10) g = waitDay(g, PARTIES);
    expect(g.partners.greens!.status).toBe('rival-signing');
    // Not counted until the members have voted.
    const before = rivalSeats(g);
    expect(blocProgress(g).rival!.signing).toBe(18);
    for (let i = 0; i < 3 && g.partners.greens!.status === 'rival-signing'; i++) g = waitDay(g, PARTIES);
    if (g.partners.greens!.status === 'rival') {
      expect(rivalSeats(g)).toBe(before + 18);
      const entry = g.log.find((l) => l.kind === 'rival-deal' && l.partnerId === 'greens')!;
      const why = whyTheySigned(g, PARTIES, entry)!;
      expect(why.reasons.length).toBeGreaterThan(0);
      expect(why.policies.length).toBeGreaterThan(0);
    } else {
      expect(g.log.some((l) => l.kind === 'rival-rejected')).toBe(true);
    }
  });
});

describe('fair share of cabinet', () => {
  it('expects a seat-proportional share from a major partner and less from a minor one', () => {
    expect(expectedCabinet(party('labour'), 34, 69).major).toBe(true);
    expect(expectedCabinet(party('labour'), 34, 69).expected).toBeGreaterThanOrEqual(5);
    const minor = expectedCabinet(party('tpm'), 4, 60);
    expect(minor.major).toBe(false);
    expect(minor.expected).toBe(1);
  });

  it('has a major partner insist on a senior role', () => {
    const ctx: NegotiationContext = { player: party('national'), partner: party('labour'), trust: 60, pressure: 1, seats: { partner: 34, coalition: 69 } };
    const offer = { ...fullOffer('labour'), portfolios: eligiblePortfolios(party('labour')).filter((p) => p !== 'deputy-pm' && p !== 'finance').slice(0, 1) };
    const r = evaluateOffer(offer, ctx);
    expect(r.kind).toBe('counter');
    expect(['deputy-pm', 'finance']).toContain(r.counter?.addPortfolio);
  });
});

describe('budget-minded parties', () => {
  it('lets a fiscal hawk refuse a deal on the budget alone', () => {
    const costly = budgetFor([policy('tpm', 'tpm-tax-free-30k'), policy('opportunity', 'opp-citizens-income')]);
    const problem = budgetProblemFor(party('act'), costly)!;
    expect(problem.kind).toBe('deficit');
    expect(problem.refuse).toBe(true);
    expect(budgetProblemFor(party('greens'), budgetFor([policy('act', 'act-spending-restraint')]))?.kind).toBe('cuts');
  });
});

describe('bottom lines with give', () => {
  it('treats a compromise as softer and cheaper', () => {
    const cgt = policy('labour', 'lab-cgt');
    const soft = compromiseOf(cgt);
    expect(soft.isCompromise).toBe(true);
    expect(Math.abs(soft.stance)).toBeLessThan(Math.abs(cgt.stance));
    expect(soft.fiscalImpactNZDm).toBe(Math.round(560 * 0.5));
    // Softened, it no longer crosses NZ First's position as hard.
    expect(reactionTo(party('nzfirst'), soft)).toBeGreaterThanOrEqual(reactionTo(party('nzfirst'), cgt));
  });

  it('never bends a fixed bottom line', () => {
    const ctx: NegotiationContext = { player: party('national'), partner: party('act'), trust: 80, pressure: 1 };
    const offer: Offer = { ...fullOffer('act'), compromisePolicyIds: ['act-no-wealth-taxes'] };
    const r = evaluateOffer(offer, ctx);
    // Offering it as a compromise counts as leaving it out.
    expect(r.missingBottomLines.map((p) => p.id)).toContain('act-no-wealth-taxes');
  });

  it('takes a soft bottom line as a compromise readily', () => {
    const ctx: NegotiationContext = { player: party('labour'), partner: party('greens'), trust: 70, pressure: 0 };
    const offer: Offer = { ...fullOffer('greens'), compromisePolicyIds: ['grn-clean-energy'] };
    expect(evaluateOffer(offer, ctx).missingBottomLines).toHaveLength(0);
  });
});

describe('leverage and hold-out', () => {
  it('raises the bar for a party courted by both blocs, most for one that likes to hold out', () => {
    const base = (id: string): NegotiationContext => ({ player: party('national'), partner: party(id), trust: 50, pressure: 0 });
    const nzf = acceptanceThreshold({ ...base('nzfirst'), leverage: 1 }, 'coalition') - acceptanceThreshold(base('nzfirst'), 'coalition');
    const lab = acceptanceThreshold({ ...base('labour'), leverage: 1 }, 'coalition') - acceptanceThreshold(base('labour'), 'coalition');
    expect(nzf).toBeGreaterThan(lab);
    expect(lab).toBeGreaterThan(0);
    expect(acceptanceThreshold({ ...base('labour'), leverage: -0.5 }, 'coalition')).toBeLessThan(acceptanceThreshold(base('labour'), 'coalition'));
  });
});

describe('concessions and reopening', () => {
  it('names a dropped bottom line in voter mood', () => {
    let g: GameState = { ...newGame('labour'), rivalId: null };
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-gp-visits']));
    const mood = moodOf(g, PARTIES);
    expect(mood.factors.some((f) => f.label === 'Dropped bottom line: 28% capital gains tax on investment property')).toBe(true);
  });

  it('lets you reopen a deal once, at a cost, and keeps the signed deal until the change is signed', () => {
    let g: GameState = { ...newGame('labour'), rivalId: null };
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt']));
    g = waitDay(g, PARTIES);
    expect(g.partners.greens!.status).toBe('signed');
    const trust = g.partners.greens!.trust;
    g = reopenDeal(g, 'greens');
    expect(g.partners.greens!.renegotiating).toBe(true);
    expect(g.partners.greens!.trust).toBe(trust - 8);
    expect(moodOf(g, PARTIES).factors.some((f) => f.label === 'Reopened the deal with Greens')).toBe(true);
    // Only once.
    expect(reopenDeal({ ...g, partners: { ...g.partners, greens: { ...g.partners.greens!, renegotiating: false } } }, 'greens').partners.greens!.renegotiating).toBe(false);
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt', 'lab-gp-visits']));
    expect(g.partners.greens!.status).toBe('signed');
    if (g.partners.greens!.pendingDeal) expect(g.partners.greens!.deal!.playerPolicyIds).toEqual(['lab-cgt']);
  });
});

describe('unsettled partners', () => {
  it('warns before a deal that crosses a current partner’s red line, then makes it leave if not fixed', () => {
    let g: GameState = { ...newGame('labour'), rivalId: null };
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt']));
    g = waitDay(g, PARTIES);
    expect(g.partners.greens!.status).toBe('signed');
    const offer = fullOffer('nzfirst');
    expect(offer.partnerPolicyIds).toContain('nzf-paris-exit');
    const preview = previewDeal(g, PARTIES, offer);
    expect(preview.unsettles.find((u) => u.partnerId === 'greens')?.severity).toBe('red-line');
    // Force the deal through to see the consequence.
    g = {
      ...g,
      partners: { ...g.partners, nzfirst: { ...g.partners.nzfirst!, status: 'ratifying', deal: offer, ratifyOnDay: 99, agreedWith: [] } },
    };
    g = waitDay(g, PARTIES);
    expect(g.partners.greens!.unsettled?.severity).toBe('red-line');
    const deadline = g.partners.greens!.unsettled!.deadline!;
    while (g.day <= deadline + 1 && g.outcome === 'playing') g = waitDay(g, PARTIES);
    expect(g.partners.greens!.status).toBe('walked');
    expect(g.log.some((l) => l.kind === 'left' && l.partnerId === 'greens')).toBe(true);
  });
});

describe('bloc feedback', () => {
  it('says how far each bloc is from a majority and how it could get there', () => {
    const g = newGame('labour');
    const p = blocProgress(g);
    expect(progressText(p.player, g.majority)).toBe('34 of 62, 28 short');
    const paths = pathsToMajority(g, PARTIES, 'player');
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const total = 34 + path.reduce((s, name) => s + seats[PARTIES.find((x) => x.name === name)!.id as keyof typeof seats], 0);
      expect(total).toBeGreaterThanOrEqual(62);
    }
  });
});

describe('time per offer', () => {
  it('lets two small offers happen in a day and makes a big one take two', () => {
    const g: GameState = { ...newGame('labour'), rivalId: null };
    const small: Offer = { partnerId: 'tpm', partnerPolicyIds: [party('tpm').policies[0]!.id], playerPolicyIds: [], portfolios: [], arrangement: 'coalition' };
    expect(offerSize(small)).toBeLessThanOrEqual(SMALL_OFFER);
    expect(offerDays(g, small)).toBe(0);
    expect(offerDays({ ...g, quickOffers: QUICK_OFFERS_PER_DAY }, small)).toBe(1);
    const big = fullOffer('greens', ['lab-cgt']);
    expect(offerSize(big)).toBeGreaterThanOrEqual(BIG_OFFER);
    expect(offerDays(g, big)).toBe(2);
    const after = makeOffer(g, PARTIES, small);
    expect(after.day).toBe(g.day);
    expect(after.quickOffers).toBe(1);
    expect(makeOffer(g, PARTIES, big).day).toBe(g.day + 2);
  });
});

describe('partners asking for a change', () => {
  const signedWith = (deal: Offer): GameState => {
    const g: GameState = { ...newGame('labour'), rivalId: null };
    return { ...g, partners: { ...g.partners, [deal.partnerId]: { ...g.partners[deal.partnerId]!, status: 'signed', deal, agreedWith: [] } } };
  };
  const runDays = (g: GameState, n: number) => {
    for (let i = 0; i < n && g.outcome === 'playing'; i++) g = waitDay(g, PARTIES);
    return g;
  };

  it('has a partner with a thin deal reach out, once', () => {
    const thin: Offer = { partnerId: 'greens', partnerPolicyIds: [], playerPolicyIds: ['lab-cgt'], portfolios: [], arrangement: 'coalition' };
    const g = runDays(signedWith(thin), 15);
    const asks = g.log.filter((l) => l.kind === 'requested' && l.partnerId === 'greens');
    expect(asks).toHaveLength(1);
    expect(asks[0]!.policyIds?.length).toBe(1);
  });

  it('leaves a strong deal alone', () => {
    const g = runDays(signedWith(fullOffer('greens')), 15);
    expect(g.log.some((l) => l.kind === 'requested')).toBe(false);
  });
});

describe('either-or bottom lines', () => {
  it('only point to the same party’s own policies', () => {
    for (const p of PARTIES) {
      for (const pol of p.policies.filter((x) => x.orPolicyIds?.length)) {
        expect(pol.isBottomLine).toBe(true);
        for (const id of pol.orPolicyIds!) expect(p.policies.some((x) => x.id === id), `${pol.id} → ${id}`).toBe(true);
      }
    }
  });

  it('accept either option and ask for the one that suits the other side', () => {
    const ctx: NegotiationContext = { player: party('labour'), partner: party('greens'), trust: 70, pressure: 0.5 };
    const withoutWealthTax = (ids: string[]): Offer => ({ ...fullOffer('greens'), partnerPolicyIds: ids });
    const rest = party('greens').policies.map((p) => p.id).filter((id) => id !== 'grn-wealth-tax' && id !== 'grn-inheritance-tax');
    expect(evaluateOffer(withoutWealthTax([...rest, 'grn-inheritance-tax']), ctx).missingBottomLines.map((p) => p.id)).not.toContain('grn-wealth-tax');
    const neither = evaluateOffer(withoutWealthTax(rest), ctx);
    expect(neither.kind).toBe('counter');
    const asked = [neither.counter!.addPolicy!.id, ...neither.counter!.either!.map((p) => p.id)].sort();
    expect(asked).toEqual(['grn-inheritance-tax', 'grn-wealth-tax']);
  });

  it('do not count as a dropped bottom line for your voters', () => {
    let g: GameState = { ...newGame('labour'), rivalId: null };
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt', 'lab-prescriptions']));
    expect(moodOf(g, PARTIES).factors.some((f) => f.label.includes('Three free GP visits'))).toBe(false);
  });
});
