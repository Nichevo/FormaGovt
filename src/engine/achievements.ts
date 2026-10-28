import { PARTIES } from '../data/parties';
import { BASELINE, budgetFor } from './budget';
import { programmeOf, summarise, type GameState } from './game';

export interface Achievement {
  id: string;
  title: string;
  detail: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-government', title: 'Sworn in', detail: 'Form your first government.' },
  { id: 'high-score', title: 'Strong hand', detail: 'Score 80 or more.' },
  { id: 'quick', title: 'Quick deal', detail: 'Form a government by day 4.' },
  { id: 'happy-voters', title: 'Happy base', detail: 'Finish with your voters’ mood at 80 or more.' },
  { id: 'budget-hawk', title: 'Books in order', detail: 'Leave the 2028/29 budget better than Treasury’s forecast.' },
  { id: 'kingmaker', title: 'Small but mighty', detail: 'Form a government playing a party with fewer than 15 seats.' },
  { id: 'grand-coalition', title: 'Odd couple', detail: 'Form a National–Labour grand coalition.' },
  { id: 'minority', title: 'Supply lines', detail: 'Lead a minority government backed by confidence and supply.' },
  { id: 'poacher', title: 'Change of heart', detail: 'Win a party back from the rival bloc.' },
  { id: 'history', title: 'What if', detail: 'Form a government in the 2017 what-if.' },
  { id: 'daily', title: 'Daily habit', detail: 'Finish a daily challenge.' },
  { id: 'every-party', title: 'Every side of the House', detail: 'Form a government as each of the seven parties.' },
];

export interface AchievementContext {
  game: GameState;
  scenarioId: string;
  daily: boolean;
  /** Parties the player has formed a government with before, including this game. */
  partiesWon: string[];
}

/** The achievements this finished game earns. */
export function earnedBy({ game, scenarioId, daily, partiesWon }: AchievementContext): string[] {
  const won = game.outcome === 'won';
  const s = summarise(game, PARTIES);
  const earned: string[] = [];
  if (daily) earned.push('daily');
  if (new Set(partiesWon).size >= PARTIES.length) earned.push('every-party');
  if (!won) return earned;
  earned.push('first-government');
  if (s.score >= 80) earned.push('high-score');
  if (game.day <= 4) earned.push('quick');
  if (s.mood.mood >= 80) earned.push('happy-voters');
  if (budgetFor(programmeOf(game, PARTIES, false)).balance >= BASELINE.balanceNZDm) earned.push('budget-hawk');
  if ((game.seats[game.playerId] ?? 0) < 15) earned.push('kingmaker');
  if (game.govType === 'grand-coalition') earned.push('grand-coalition');
  if (game.govType === 'minority') earned.push('minority');
  if (game.log.some((l) => l.kind === 'poached')) earned.push('poacher');
  if (scenarioId === 'election-2017') earned.push('history');
  return earned;
}
