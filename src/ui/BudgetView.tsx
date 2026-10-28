import { useState } from 'react';
import { PARTY_BY_ID } from '../data/parties';
import { ISSUE_LABELS, type Issue, type Policy } from '../data/schema';
import {
  BASELINE,
  BASELINE_YEARS,
  BUDGET_2026,
  againstBudget2026,
  formatBalance,
  formatChange,
  formatMoney,
  hardestYear,
  YEARS,
  type Budget,
  type BudgetGroup,
} from '../engine/budget';

const W = 320;
const H = 160;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function scale(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = (hi - lo) * 0.1 || 1000;
  const min = lo - pad;
  const max = hi + pad;
  return { min, max, y: (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH };
}

const bn = (nzdm: number) => `${nzdm < 0 ? '-' : ''}$${Math.abs(nzdm / 1000).toFixed(Math.abs(nzdm) >= 10000 ? 0 : 1)}bn`;

/** Treasury's balance against the balance with the deal, year by year. */
function BalanceChart({ budget }: { budget: Budget }) {
  const [hover, setHover] = useState<number | null>(null);
  const base = budget.years.map((y) => y.baseline);
  const deal = budget.years.map((y) => y.balance);
  const { y, min, max } = scale([...base, ...deal]);
  const step = plotW / (YEARS.length - 1);
  const x = (i: number) => PAD.left + i * step;
  const ticks = [min, 0, max].filter((t, i, a) => a.indexOf(t) === i);
  const shown = hover ?? YEARS.length - 1;
  const turn = budget.years.findIndex((yr) => yr.balance >= 0);
  return (
    <figure className="chart">
      <figcaption>Operating balance by year</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Operating balance by year, Treasury forecast and with your deal" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'zero' : 'grid'} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {bn(t)}
            </text>
          </g>
        ))}
        {YEARS.map((yr, i) => (
          <text key={yr} className="axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === YEARS.length - 1 ? 'end' : 'middle'}>
            {yr}
          </text>
        ))}
        {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />}
        <polyline className="series" points={base.map((v, i) => `${x(i)},${y(v)}`).join(' ')} stroke="var(--muted)" strokeDasharray="5 4" />
        <polyline className="series" points={deal.map((v, i) => `${x(i)},${y(v)}`).join(' ')} stroke="var(--accent)" />
        {deal.map((v, i) => (
          <circle key={i} className="dot" cx={x(i)} cy={y(v)} r={4} fill="var(--accent)" />
        ))}
        {YEARS.map((yr, i) => (
          <rect key={yr} className="hit" x={x(i) - step / 2} y={PAD.top} width={step} height={plotH} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      <ul className="legend">
        <li>
          <span className="legend-line" style={{ borderColor: 'var(--accent)' }} /> With your deal
        </li>
        <li>
          <span className="legend-line dashed" style={{ borderColor: 'var(--muted)' }} /> Treasury forecast
        </li>
      </ul>
      <p className="readout small" aria-live="polite">
        <strong>{YEARS[shown]}:</strong> {formatBalance(budget.years[shown]!.balance)} with your deal, Treasury{' '}
        {formatBalance(budget.years[shown]!.baseline)} ({formatChange(budget.years[shown]!.change)}).{' '}
        {turn === -1 ? 'The books stay in deficit through 2029/30.' : `Back in surplus from ${YEARS[turn]}.`}
      </p>
    </figure>
  );
}

/** Revenue changes and spending changes each year, as bars about zero. */
function RevenueSpendingChart({ budget }: { budget: Budget }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = budget.years.flatMap((yr) => [yr.revenue, yr.spending]);
  const { y, min, max } = scale(values);
  const group = plotW / YEARS.length;
  const barW = Math.min(18, group / 3);
  const ticks = [min, 0, max].filter((t, i, a) => a.indexOf(t) === i);
  const shown = hover ?? 2;
  const bar = (cx: number, v: number, cls: string) => {
    const top = Math.min(y(v), y(0));
    const h = Math.max(1, Math.abs(y(v) - y(0)));
    return <rect className={cls} x={cx} y={top} width={barW} height={h} rx={2} />;
  };
  return (
    <figure className="chart">
      <figcaption>Revenue and spending changes by year</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue and spending changes by year" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'zero' : 'grid'} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {bn(t)}
            </text>
          </g>
        ))}
        {budget.years.map((yr, i) => {
          const cx = PAD.left + group * i + group / 2;
          return (
            <g key={yr.year}>
              {bar(cx - barW - 1, yr.revenue, 'bar-revenue')}
              {bar(cx + 1, yr.spending, 'bar-spending')}
              <text className="axis" x={cx} y={H - 6} textAnchor="middle">
                {yr.year}
              </text>
              <rect className="hit" x={PAD.left + group * i} y={PAD.top} width={group} height={plotH} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      <ul className="legend">
        <li>
          <span className="legend-swatch swatch-revenue" /> Revenue (taxes and levies)
        </li>
        <li>
          <span className="legend-swatch swatch-spending" /> Spending (programmes and cuts)
        </li>
      </ul>
      <p className="readout small" aria-live="polite">
        <strong>{YEARS[shown]}:</strong> revenue {formatChange(budget.years[shown]!.revenue)}, spending{' '}
        {formatChange(budget.years[shown]!.spending)}, net {formatChange(budget.years[shown]!.change)}. Above zero helps the
        books; below zero costs.
      </p>
    </figure>
  );
}

function groupLabel(kind: 'issue' | 'party', key: string): string {
  if (kind === 'issue') return ISSUE_LABELS[key as Issue] ?? key;
  return PARTY_BY_ID[key]?.name ?? 'Other';
}

function Groups({ title, kind, groups, onCard }: { title: string; kind: 'issue' | 'party'; groups: BudgetGroup[]; onCard?: (p: Policy) => void }) {
  return (
    <div className="group-list">
      <h3>{title}</h3>
      <p className="muted small">Total over four years, largest first. Open one to see its policies.</p>
      {groups.length === 0 && <p className="muted">No costed policies yet.</p>}
      {groups.map((g) => (
        <details key={g.key}>
          <summary>
            <span>
              {kind === 'party' && PARTY_BY_ID[g.key] && <span className="swatch" style={{ background: PARTY_BY_ID[g.key]!.colour }} />}
              {groupLabel(kind, g.key)}
            </span>
            <span className={g.total < 0 ? 'bad' : ''}>{formatChange(g.total)}</span>
          </summary>
          <ul>
            {g.lines.map((l) => (
              <li key={l.policy.id}>
                {onCard ? (
                  <button type="button" className="link" onClick={() => onCard(l.policy)}>
                    {l.policy.title}
                  </button>
                ) : (
                  l.policy.title
                )}{' '}
                <span className={l.total < 0 ? 'bad' : ''}>{formatChange(l.total)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function PolicyLines({ budget, onCard }: { budget: Budget; onCard: (p: Policy) => void }) {
  const [party, setParty] = useState('all');
  const [issue, setIssue] = useState('all');
  const lines = budget.lines.filter((l) => (party === 'all' || l.ownerId === party) && (issue === 'all' || l.policy.issue === issue));
  const parties = [...new Set(budget.lines.map((l) => l.ownerId ?? 'other'))];
  const issues = [...new Set(budget.lines.map((l) => l.policy.issue))];
  return (
    <div>
      <h3>Every costed policy</h3>
      <div className="filters">
        <label>
          <span className="sr-only">Party</span>
          <select value={party} onChange={(e) => setParty(e.target.value)} aria-label="Filter by party">
            <option value="all">All parties</option>
            {parties.map((id) => (
              <option key={id} value={id}>
                {groupLabel('party', id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select value={issue} onChange={(e) => setIssue(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {issues.map((id) => (
              <option key={id} value={id}>
                {ISSUE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid-scroll">
        <table className="budget-table">
          <thead>
            <tr>
              <th scope="col">Policy</th>
              {YEARS.map((yr) => (
                <th key={yr} scope="col">
                  {yr}
                </th>
              ))}
              <th scope="col">4 years</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.policy.id}>
                <td>
                  <button type="button" className="link" onClick={() => onCard(l.policy)}>
                    {l.policy.title}
                  </button>
                  <div className="basis">
                    {groupLabel('party', l.ownerId ?? 'other')} · {l.policy.fiscalType === 'revenue' ? 'revenue' : 'spending'} ·{' '}
                    {l.policy.fiscalBasis === 'party' ? 'Party costing' : 'Game estimate, not a party costing'}
                    {l.policy.isCompromise ? ' · compromise version' : ''}
                  </div>
                  {l.policy.fiscalNote && (
                    <details className="why-number">
                      <summary>{l.policy.fiscalBasis === 'party' ? 'Where this number comes from' : 'Why this number'}</summary>
                      {l.policy.fiscalNote}
                      {l.policy.isCompromise && l.policy.compromise ? ` The compromise keeps ${Math.round(l.policy.compromise.fiscalShare * 100)}% of it.` : ''}
                    </details>
                  )}
                </td>
                {l.years.map((v, i) => (
                  <td key={i} className={v < 0 ? 'bad' : ''}>
                    {v === 0 ? '–' : formatChange(v)}
                  </td>
                ))}
                <td className={l.total < 0 ? 'bad' : ''}>{formatChange(l.total)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={YEARS.length + 2} className="muted">
                  No costed policies match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pct = (change: number, base: number) => {
  const p = (change / base) * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(Math.abs(p) < 1 ? 1 : 0)}%`;
};

/** The deal set against the outgoing government's Budget 2026, category by category. */
function AgainstLastBudget({ budget, onCard }: { budget: Budget; onCard: (p: Policy) => void }) {
  const { expenses, revenue } = againstBudget2026(budget);
  const rows = [...expenses, revenue];
  return (
    <div className="against-budget">
      <h3>Against the last Budget</h3>
      <p className="muted small">
        What the outgoing government planned to spend and raise in 2026/27, and how your deal changes it once policies are fully running
        ({BASELINE.year}).
      </p>
      <div className="grid-scroll">
        <table className="budget-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Budget 2026</th>
              <th scope="col">Your deal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === 'revenue' ? 'total-row' : ''}>
                <td>
                  {r.lines.length ? (
                    <details>
                      <summary>{r.label}</summary>
                      <ul className="plain small">
                        {r.lines.map((l) => (
                          <li key={l.policy.id}>
                            <button type="button" className="link" onClick={() => onCard(l.policy)}>
                              {l.policy.title}
                            </button>{' '}
                            {formatChange(r.id === 'revenue' ? l.impact : -l.impact)}
                            {l.policy.fiscalBasis !== 'party' ? '*' : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    r.label
                  )}
                </td>
                <td>${(r.base / 1000).toFixed(1)}bn</td>
                <td>
                  {r.change === 0 ? (
                    '–'
                  ) : (
                    <>
                      {formatChange(r.change)}
                      <div className="muted small">{pct(r.change, r.base)}</div>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Source:{' '}
        <a href={BUDGET_2026.sourceUrl} target="_blank" rel="noreferrer">
          Budget 2026 at a Glance
        </a>{' '}
        (core Crown, 2026/27). Positive changes mean more spending or more revenue. The game puts each policy in the closest
        Budget category by its issue, so this is a rough guide. * marks a game estimate, not a party costing.
      </p>
    </div>
  );
}

/** The detailed budget: four years, revenue against spending, by category and party, every line. */
export function BudgetView({ budget, onCard, compact = false }: { budget: Budget; onCard: (p: Policy) => void; compact?: boolean }) {
  const worst = hardestYear(budget);
  const debtUp = budget.debt.withDeal > budget.debt.baseline;
  return (
    <section className={compact ? 'budget-view' : 'panel budget-view'}>
      {!compact && <h2>Budget</h2>}
      <div className="budget-stats">
        <div className="meter">
          <div className="meter-label">{BASELINE.year} balance</div>
          <div className={`meter-value ${budget.balance < 0 ? 'bad' : ''}`}>{formatBalance(budget.balance)}</div>
          <div className="muted small">{formatChange(budget.change)} on Treasury</div>
        </div>
        <div className="meter">
          <div className="meter-label">Over four years</div>
          <div className={`meter-value ${budget.totalChange < 0 ? 'bad' : ''}`}>{formatChange(budget.totalChange)}</div>
          <div className="muted small">{worst.change < 0 ? `Hardest in ${worst.year} (${formatChange(worst.change)})` : 'No year worse than Treasury'}</div>
        </div>
        <div className="meter">
          <div className="meter-label">Net debt 2029/30</div>
          <div className="meter-value small-value">
            {budget.debt.withDeal.toFixed(1)}% of GDP {budget.totalChange === 0 ? '' : debtUp ? '▲' : '▼'}
          </div>
          <div className="muted small">Treasury {budget.debt.baseline.toFixed(1)}% (game estimate of the change)</div>
        </div>
        <div className="meter">
          <div className="meter-label">How solid the figures are</div>
          <div className="meter-value small-value">{Math.round(budget.estimateShare * 100)}% game estimates</div>
          <div className="muted small">The rest are the parties' own costings</div>
        </div>
      </div>
      <div className="charts">
        <BalanceChart budget={budget} />
        <RevenueSpendingChart budget={budget} />
      </div>
      <div className="two-col">
        <Groups title="By category" kind="issue" groups={budget.byIssue} onCard={onCard} />
        <Groups title="By party" kind="party" groups={budget.byParty} onCard={onCard} />
      </div>
      <AgainstLastBudget budget={budget} onCard={onCard} />
      {!compact && <PolicyLines budget={budget} onCard={onCard} />}
      <p className="muted small">
        Measured from the{' '}
        <a href={BASELINE_YEARS.sourceUrl} target="_blank" rel="noreferrer">
          {BASELINE_YEARS.label}
        </a>{' '}
        ({BASELINE_YEARS.measure}). Where a policy has only one yearly figure, the game spreads it: half in 2026/27, or from
        its stated start year, then the full figure. Totals over four years are a sum of yearly changes ({formatMoney(Math.abs(budget.totalChange))}{' '}
        {budget.totalChange < 0 ? 'more borrowing' : 'less borrowing'}), and the debt figure is a rough game estimate.
      </p>
    </section>
  );
}
