import { useState } from 'react';
import { pendingPress, rivalSeats, type GameState } from '../engine/game';
import { readJson, writeJson } from './storage';

const KEY = 'formagovt.coachTips';

/** The tip that fits the moment, for first-time players. */
export function tipFor(game: GameState): string {
  const last = [...game.log].reverse().find((l) => l.offer);
  const lastEvent = game.log.at(-1);
  if (game.log.length === 0) {
    return 'Start with a party close to you: the % match in the list. Tick their bottom lines (🔒), add a few of your own policies they can accept, and send. Each offer uses a day.';
  }
  if (pendingPress(game).length > 0) {
    return 'A deal is signed. Choose how to present it: it moves your voters’ mood and how other parties see you.';
  }
  if (lastEvent?.kind === 'rival-deal') {
    return 'The rival bloc just signed a party. Open its entry in the talks log to see why. You can still win them back, but it takes a clearly better offer. Often it is quicker to lock in the parties still open.';
  }
  if (lastEvent?.kind === 'rival-signing') {
    return 'A party agreed terms with the rival bloc and is going through sign-off. Until it is signed, a better offer from you needs a smaller margin.';
  }
  if (Object.values(game.partners).some((p) => p.unsettled?.severity === 'red-line')) {
    return 'A partner is unsettled by something in another deal. Reopen the deal that holds the policy and drop it or use its compromise before the deadline, or the partner leaves.';
  }
  if (Object.values(game.partners).some((p) => p.unsettled?.severity === 'request')) {
    return 'A partner has asked to change its deal. Reopen it for free and add something it wants, or leave it: an unhappy partner lowers your stability score.';
  }
  if (last?.kind === 'counter' && last === lastEvent) {
    return 'They countered. What they asked for is already ticked in your next offer: check the meters, then send again.';
  }
  if (last?.kind === 'hold' && last === lastEvent) {
    return 'They are holding out. Drop the policy they named, or include more of theirs. Each failed offer costs a little trust and patience.';
  }
  if (last?.kind === 'walk' && last === lastEvent) {
    return 'You crossed a red line. Remove the policy they named before you try again, or talk to someone else.';
  }
  if (Object.values(game.partners).some((p) => p.status === 'ratifying')) {
    return 'A deal is in sign-off. You can keep talking to other parties, or wait a day for it to come through.';
  }
  if (rivalSeats(game) > 0 && game.day >= 4) {
    return 'Watch the rival bloc bar. If it reaches the majority line first, you lose.';
  }
  return 'The budget and voter meters preview your offer before you send it. Tap any policy to see its card and sources.';
}

export function Coach({ game }: { game: GameState }) {
  const [on, setOn] = useState(() => readJson(KEY, true));
  const set = (value: boolean) => {
    setOn(value);
    writeJson(KEY, value);
  };
  if (!on) {
    return (
      <div className="coach-off">
        <button type="button" className="link small" onClick={() => set(true)}>
          Show tips
        </button>
      </div>
    );
  }
  return (
    <aside className="coach" aria-live="polite">
      <strong>Tip</strong>
      <span>{tipFor(game)}</span>
      <button type="button" className="link small" onClick={() => set(false)}>
        Hide tips
      </button>
    </aside>
  );
}
