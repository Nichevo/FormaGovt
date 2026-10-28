import type { Policy } from '../data/schema';

/**
 * Treasury's Pre-election Economic and Fiscal Update, 29 September 2026: the
 * operating balance returns to a $4.0bn surplus in 2028/29. The game measures
 * every deal against that year.
 */
export const BASELINE = {
  label: 'Treasury PREFU 2026 forecast for 2028/29',
  year: '2028/29',
  balanceNZDm: 4000,
  sourceUrl: 'https://www.westpaciq.com.au/economics/2026/09/new-zealand-pre-election-economic-and-fiscal-update-2026/',
} as const;

export interface BudgetLine {
  policy: Policy;
  impact: number;
}

export interface Budget {
  baseline: number;
  /** Sum of every costed policy in the programme. */
  change: number;
  balance: number;
  lines: BudgetLine[];
}

/** The 2028/29 operating balance once a programme of policies is added to the baseline. */
export function budgetFor(policies: Policy[]): Budget {
  const seen = new Set<string>();
  const lines: BudgetLine[] = [];
  for (const policy of policies) {
    if (seen.has(policy.id) || policy.fiscalImpactNZDm === null) continue;
    seen.add(policy.id);
    if (policy.fiscalImpactNZDm !== 0) lines.push({ policy, impact: policy.fiscalImpactNZDm });
  }
  lines.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const change = lines.reduce((s, l) => s + l.impact, 0);
  return { baseline: BASELINE.balanceNZDm, change, balance: BASELINE.balanceNZDm + change, lines };
}

/** "$1.2bn surplus", "$350m deficit". */
export function formatBalance(nzdm: number): string {
  return `${formatMoney(Math.abs(nzdm))} ${nzdm >= 0 ? 'surplus' : 'deficit'}`;
}

export function formatMoney(nzdm: number): string {
  const abs = Math.abs(nzdm);
  const text = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}bn` : `$${Math.round(abs)}m`;
  return nzdm < 0 ? `-${text}` : text;
}

/** "+$1.2bn" or "-$350m" for a change to the balance. */
export function formatChange(nzdm: number): string {
  return nzdm > 0 ? `+${formatMoney(nzdm)}` : nzdm < 0 ? formatMoney(nzdm) : '$0';
}
