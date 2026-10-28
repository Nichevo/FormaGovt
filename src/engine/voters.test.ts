import { describe, expect, it } from 'vitest';
import { PARTY_BY_ID } from '../data/parties';
import { voterMood } from './voters';

const labour = PARTY_BY_ID.labour!;
const national = PARTY_BY_ID.national!;
const act = PARTY_BY_ID.act!;

describe('voter mood', () => {
  it("rises with more of the party's own policies in the deal", () => {
    const few = voterMood({ player: labour, programme: labour.policies.slice(0, 2), partners: [], spin: 0, seatShare: 1 });
    const all = voterMood({ player: labour, programme: labour.policies, partners: [], spin: 0, seatShare: 1 });
    expect(all.mood).toBeGreaterThan(few.mood);
  });

  it('falls for concessions the voters oppose', () => {
    const base = voterMood({ player: labour, programme: labour.policies, partners: [act], spin: 0, seatShare: 0.7 });
    const withAct = voterMood({
      player: labour,
      programme: [...labour.policies, ...act.policies],
      partners: [act],
      spin: 0,
      seatShare: 0.7,
    });
    expect(withAct.mood).toBeLessThan(base.mood);
  });

  it('punishes a deal with a party the player ruled out', () => {
    const programme = national.policies;
    const withAct = voterMood({ player: national, programme, partners: [act], spin: 0, seatShare: 0.7 });
    const withLabour = voterMood({ player: national, programme, partners: [labour], spin: 0, seatShare: 0.7 });
    expect(withLabour.factors.some((f) => f.label.includes('ruling it out'))).toBe(true);
    expect(withLabour.mood).toBeLessThan(withAct.mood);
  });

  it('flags a revolt when mood drops below 35', () => {
    const empty = voterMood({ player: labour, programme: [], partners: [], spin: -10, seatShare: 1 });
    expect(empty.revolt).toBe(true);
  });
});
