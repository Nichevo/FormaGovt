import { useState } from 'react';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { ISSUES, ISSUE_LABELS, type Party, type Policy } from '../data/schema';
import { compatibility, REACTION_LABELS, reactionTo } from '../engine/negotiation';

/** Policy groups down the side, parties across the top, coloured by how your party sees each policy. */
export function ComparisonView({ player, onCard }: { player: Party; onCard: (policy: Policy) => void }) {
  const others = PARTIES.filter((p) => p.id !== player.id);
  const [targetId, setTargetId] = useState(others[0]!.id);
  const target = PARTY_BY_ID[targetId]!;
  const columns = [player, ...others];

  return (
    <>
      <section className="panel">
        <h2>Policy grid</h2>
        <p className="muted small">
          Each party's main policy in each group, coloured by how {player.name} sees it. 🔒 marks a bottom line. Policy
          summaries are simplified; tap a title for its card and source.
        </p>
        <div className="grid-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th>Group</th>
                {columns.map((p) => (
                  <th key={p.id} style={{ borderTopColor: p.colour }}>
                    {p.shortName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ISSUES.map((issue) => (
                <tr key={issue}>
                  <th scope="row">{ISSUE_LABELS[issue]}</th>
                  {columns.map((p) => {
                    const top = p.policies.filter((pol) => pol.issue === issue).sort((a, b) => b.weight - a.weight)[0];
                    if (!top) return <td key={p.id} className="empty">–</td>;
                    const r = reactionTo(player, top);
                    return (
                      <td key={p.id} className={`r${r}`} title={`${top.summary} (${REACTION_LABELS[r]})`}>
                        <button type="button" className="link" onClick={() => onCard(top)}>
                          {top.isBottomLine ? '🔒 ' : ''}
                          {top.title}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Differences</h2>
        <label className="inline">
          {player.name} and{' '}
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="score">
          Compatibility: <strong>{compatibility(player, target)}%</strong>
        </p>
        <Differences player={player} target={target} onCard={onCard} />
      </section>
    </>
  );
}

function Differences({ player, target, onCard }: { player: Party; target: Party; onCard: (policy: Policy) => void }) {
  const pairs: { policy: Policy; owner: Party; judge: Party }[] = [
    ...player.policies.map((policy) => ({ policy, owner: player, judge: target })),
    ...target.policies.map((policy) => ({ policy, owner: target, judge: player })),
  ];
  const shared = pairs.filter((x) => reactionTo(x.judge, x.policy) >= 0);
  const trade = pairs.filter((x) => reactionTo(x.judge, x.policy) === -1);
  const red = pairs.filter((x) => reactionTo(x.judge, x.policy) === -2);
  const block = (title: string, cls: string, items: typeof pairs) => (
    <div className={`diff ${cls}`}>
      <h3>
        {title} ({items.length})
      </h3>
      <ul>
        {items.map(({ policy, owner, judge }) => (
          <li key={policy.id}>
            <span className="swatch" style={{ background: owner.colour }} />
            <button type="button" className="link" onClick={() => onCard(policy)}>
              {policy.title}
            </button>{' '}
            <span className="muted small">
              ({owner.shortName}; {judge.shortName}: {REACTION_LABELS[reactionTo(judge, policy)].toLowerCase()})
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="muted">None</li>}
      </ul>
    </div>
  );
  return (
    <div className="diffs">
      {block('Shared ground', 'shared', shared)}
      {block('Room to trade', 'trade', trade)}
      {block('Red lines', 'red', red)}
    </div>
  );
}
