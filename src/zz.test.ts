import { it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from './data/parties';
import { SCENARIOS } from './data/scenarios';
import { allocateSeats } from './engine/seats';
import { playBot } from './engine/bot';
import { makeOffer, waitDay } from './engine/game';
it('x', () => {
  const r = allocateSeats(SCENARIOS.find((s) => s.id === 'result-2026-official')!);
  const base = { seats: Object.fromEntries(r.parties.map((p) => [p.partyId, p.total])), majority: r.majority, totalSeats: r.totalSeats, rules: '1.2' as const, leadershipChallenges: true, seed: 1 };
  for (const id of ['national','labour']) {
    const run = playBot(PARTY_BY_ID[id]!, PARTIES, base, 'seats');
    const g:any = run.game;
    console.log(id, g.lostTo, g.govType, Object.entries(g.partners).map(([k,v]:any)=>`${k}:${v.status}`).join(' '));
  }
});
