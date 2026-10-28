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
    'Every deal changes the forecast operating balance, measured from Treasury\'s pre-election forecast (a $4.0bn surplus in 2028/29). The Budget tab shows four years, revenue against spending, and who and what drives the change. Figures are the party\'s own costing where one was reported, and rough game estimates otherwise. Some parties judge the budget as well as the policies: fiscal hawks reject deals that dig the deficit too deep, and others reject deep cuts to services.',
  mood:
    'Your own voters judge the deal: how many of your policies made it, what you gave up, who you went into government with, and the budget. Below 35 they revolt, and it shows in your score.',
  rival:
    'The other big party is building its own majority at the same time, starting on day 3 and making one offer a day to whoever fits it best (a big offer takes it two days, as it does you). Its deals go through each party\'s own sign-off, just like yours. If its bloc reaches a majority first, you lose. You can try to win its partners back: breaking a signed deal takes a clearly better offer, less so while it is still signing off or unhappy there.',
  pressure:
    'Pressure rises each day and jumps when either bloc gets close to a majority. Under pressure, parties settle for less, and pre-election promises about who they would not work with soften. Kingmaker parties feel it less.',
  score:
    'Your score is 60% policies won (weighted by how much your party cares about each, with bottom lines counting double and compromises for less), 30% voter mood and 10% stability. Unsettled partners lower stability. You only score if you form a government.',
  cabinet:
    'Partners expect cabinet roles in line with their seats. A major partner, with about a quarter of the government\'s seats or more, wants close to its share and a senior role such as Deputy Prime Minister or Finance. A minor partner settles for less. Giving away far more than a fair share upsets your own voters.',
  compromise:
    'Some bottom lines can bend. Fixed ones never do. Firm ones accept a scaled-back version late in talks or for a strong offer; soft ones accept it readily. A compromise keeps about 60% of the policy\'s value and part of its budget effect. Compromise versions are written for the game, not proposed by any party. Some bottom lines are an either-or: the party needs one of two of its policies, not both, and will ask for the one that suits you best.',
  reopen:
    'You can reopen one deal per party to change it. It costs trust and a little voter mood, and the partner usually wants something in return. The changed deal goes through sign-off again; if it fails, the old deal stands. If a new deal includes something a partner already in government hates, that partner asks to renegotiate for free, and if it crosses a red line you have two days to fix it before it leaves. A partner that finds its signed deal thin may also reach out once to ask for a change; a strong deal rarely prompts this.',
  time:
    'Talks take time in proportion to what is on the table. A small offer or change, of three items or fewer, takes no time, and you can make two of those a day. A typical offer uses a day, and one with twelve or more policies and roles takes two days.',
  leverage:
    'A party courted by both blocs, whose seats could decide the majority, holds out for more. When it stops being needed, or the side it prefers falls behind, it lowers its demands. Some parties, such as NZ First, hold out longer than others. Parties far to the left or right have only one natural side: they gain no bargaining power from the other bloc, are marked "Unlikely partner" when you are on the other side, and take more convincing to cross over.',
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
