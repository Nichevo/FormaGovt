import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { eligiblePortfolios, type Offer } from './negotiation';
import {
  createGame,
  DAYS,
  holdPress,
  makeOffer,
  moodOf,
  pendingPress,
  PRESS_OPTIONS,
  previewDeal,
  seatsSecured,
  summarise,
  waitDay,
} from './game';

const seats = { national: 35, labour: 34, greens: 18, act: 12, nzfirst: 12, opportunity: 7, tpm: 4 };
const newGame = (playerId: string, seed = 1) =>
  createGame({ player: PARTY_BY_ID[playerId]!, parties: PARTIES, seats, majority: 62, totalSeats: 123, seed });

const fullOffer = (partnerId: string, playerPolicyIds: string[] = []): Offer => ({
  partnerId,
  partnerPolicyIds: PARTY_BY_ID[partnerId]!.policies.map((p) => p.id),
  playerPolicyIds,
  portfolios: eligiblePortfolios(PARTY_BY_ID[partnerId]!).slice(0, 2),
  arrangement: 'coalition',
});

describe('game flow', () => {
  it('starts on day 1 with every other seated party open to talks', () => {
    const g = newGame('labour');
    expect(g.day).toBe(1);
    expect(Object.keys(g.partners).sort()).toEqual(['act', 'greens', 'national', 'nzfirst', 'opportunity', 'tpm']);
  });

  it('uses one day per offer and makes a party sign off before its seats count', () => {
    let g = newGame('labour');
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt']));
    expect(g.day).toBe(2);
    expect(g.partners.greens!.status).toBe('ratifying');
    expect(seatsSecured(g)).toBe(34);
    g = waitDay(g, PARTIES);
    expect(g.partners.greens!.status).toBe('signed');
    expect(seatsSecured(g)).toBe(52);
  });

  it('lets NZ First sign the same day because its leader decides', () => {
    let g = newGame('national');
    g = makeOffer(g, PARTIES, fullOffer('nzfirst'));
    expect(g.partners.nzfirst!.status).toBe('signed');
  });

  it('wins once signed partners reach the majority', () => {
    let g = newGame('labour');
    g = makeOffer(g, PARTIES, fullOffer('greens', ['lab-cgt', 'lab-gp-visits']));
    g = makeOffer(g, PARTIES, fullOffer('opportunity', ['lab-gp-visits']));
    g = makeOffer(g, PARTIES, fullOffer('tpm'));
    for (let i = 0; i < 3 && g.outcome === 'playing'; i++) g = waitDay(g, PARTIES);
    const signed = Object.entries(g.partners).filter(([, p]) => p.status === 'signed').map(([id]) => id);
    if (signed.includes('tpm')) {
      expect(g.outcome).toBe('won');
      const summary = summarise(g, PARTIES);
      expect(summary.won.map((p) => p.id)).toEqual(expect.arrayContaining(['lab-cgt', 'lab-gp-visits']));
      expect(summary.policyScore).toBeGreaterThan(0);
    } else {
      // Te Pāti Māori's members can vote a deal down; the seeded roll decides.
      expect(g.partners.tpm!.status).toBe('rejected');
    }
  });

  it('loses when the deadline passes without a majority', () => {
    let g = newGame('act');
    for (let i = 0; i < DAYS; i++) g = waitDay(g, PARTIES);
    expect(g.outcome).toBe('lost');
    expect(summarise(g, PARTIES).policyScore).toBe(0);
  });

  it('stops talking after too many failed offers', () => {
    let g = newGame('labour');
    const insulting: Offer = { ...fullOffer('act', ['lab-cgt']) };
    for (let i = 0; i < PARTY_BY_ID.act!.personality.patience; i++) g = makeOffer(g, PARTIES, insulting);
    expect(g.partners.act!.status).toBe('walked');
  });
});

describe('scoring and press conferences', () => {
  it('scores a formed government on policies, mood and stability', () => {
    let g = newGame('national');
    g = makeOffer(g, PARTIES, fullOffer('nzfirst', ['nat-kiwisaver-compulsory']));
    expect(pendingPress(g)).toEqual(['nzfirst']);
    const before = g.partners.act!.trust;
    g = holdPress(g, 'nzfirst', 'partner');
    expect(pendingPress(g)).toEqual([]);
    expect(g.partners.act!.trust).toBe(before + PRESS_OPTIONS.partner.openTrust);
    expect(moodOf(g, PARTIES).factors.some((f) => f.label === 'Press conferences')).toBe(true);
  });

  it('counts policies backed only through confidence and supply for less', () => {
    const play = (arrangement: 'coalition' | 'confidence-supply') => {
      let g = newGame('labour');
      g = makeOffer(g, PARTIES, { ...fullOffer('greens', ['lab-gp-visits']), arrangement, portfolios: [] });
      g = waitDay(g, PARTIES);
      return { ...g, outcome: 'won' as const };
    };
    const coalition = summarise(play('coalition'), PARTIES);
    const cs = summarise(play('confidence-supply'), PARTIES);
    expect(cs.policyScore).toBeLessThan(coalition.policyScore);
    expect(cs.stability).toBeLessThan(coalition.stability);
  });

  it('previews the budget and mood of an offer before it is sent', () => {
    const g = newGame('labour');
    const few = previewDeal(g, PARTIES, fullOffer('greens', ['lab-cgt']));
    const many = previewDeal(g, PARTIES, fullOffer('greens', PARTY_BY_ID.labour!.policies.map((p) => p.id)));
    expect(few.budget.change).not.toBe(0);
    expect(many.mood.mood).toBeGreaterThan(few.mood.mood);
    // Nothing changes until the offer is actually sent.
    expect(g.partners.greens!.status).toBe('open');
  });
});
