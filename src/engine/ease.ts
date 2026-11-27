/**
 * The "Ease" setting: 0 is the hardest and plays the game's normal rules; each step
 * up makes other parties a little easier to deal with. It only helps the player:
 * the rival bloc negotiates as normal, it just starts later.
 */
export const MAX_EASE = 4;

export const EASE_LABELS = ['Hardest (normal rules)', 'Hard', 'Medium', 'Easier', 'Easiest'] as const;

/** How much lower the bar is for a party to accept the player's offer, per step. */
export const EASE_THRESHOLD_STEP = 0.05;
/** Extra starting trust each party has in the player, per step. */
export const EASE_TRUST_STEP = 4;
/** Extra days before the rival bloc starts making offers, per step. */
export const EASE_RIVAL_DELAY_STEP = 1;

export function clampEase(ease: unknown): number {
  const n = Number(ease);
  return Number.isInteger(n) ? Math.max(0, Math.min(MAX_EASE, n)) : 0;
}
