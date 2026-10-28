/** Short MMP and game explainers, opened from a "?" next to the term. */
export const EXPLAINERS = {
  threshold:
    'Under MMP a party gets list seats only if it wins at least 5% of the party vote or at least one electorate seat. Votes for parties below the threshold are not counted when seats are shared out.',
  'sainte-lague':
    'The 120 seats are shared in proportion to party votes using the Sainte-Laguë method: each party\'s votes are divided by 1, 3, 5, 7 and so on, and the largest results win seats.',
  overhang:
    'If a party wins more electorates than its party vote entitles it to, it keeps the extra seats. Parliament grows above 120 until the next election, and the number needed for a majority rises with it.',
  majority:
    'A government needs the confidence of more than half of Parliament. With 120 seats that is 61. Overhang seats raise the total and the majority.',
  coalition:
    'A coalition partner joins cabinet and shares collective responsibility for government decisions. It counts fully towards stability in the game.',
  'confidence-supply':
    'A confidence and supply partner promises to back the government on confidence votes and the Budget, and decides other votes case by case. It asks less of you, and the policies it backs count for less.',
  ratification:
    'Each party approves a deal its own way. Some leaders decide on the spot; others need caucus, a board or a members\' vote, which takes time and can fail if too much was given up.',
  'bottom-line':
    'A bottom line is a policy a party has said, or strongly signalled, it must have in any deal. A red line is a policy from someone else that a party cannot accept.',
  budget:
    'Every deal changes the forecast operating balance for 2028/29, measured from Treasury\'s pre-election forecast of a $4.0bn surplus. Figures are the party\'s own costing where one was reported, and rough game estimates otherwise.',
  mood:
    'Your own voters judge the deal: how many of your policies made it, what you gave up, who you went into government with, and the budget. Below 35 they revolt, and it shows in your score.',
  rival:
    'The other big party is building its own majority at the same time, making one offer a day to whoever fits it best. If its bloc reaches a majority first, you lose. You can try to win its partners back, but breaking a deal takes a clearly better offer.',
  pressure:
    'Pressure rises each day and jumps when either bloc gets close to a majority. Under pressure, parties settle for less, and pre-election promises about who they would not work with soften. Kingmaker parties feel it less.',
  score:
    'Your score is 60% policies won (weighted by how much your party cares about each), 30% voter mood and 10% stability. You only score if you form a government.',
} as const;
export type ExplainTopic = keyof typeof EXPLAINERS;

export function Explain({ topic, label }: { topic: ExplainTopic; label?: string }) {
  return (
    <details className="explain">
      <summary aria-label={`Explain ${label ?? topic}`}>?</summary>
      <p>{EXPLAINERS[topic]}</p>
    </details>
  );
}
