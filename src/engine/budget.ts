import baseline from '../data/baseline-2026.json';
import type { Issue, Party, Policy } from '../data/schema';

export const YEARS = baseline.years as readonly string[];
/** The year the score, the AI and the meter are measured against. */
export const KEY_YEAR_INDEX = 2;

/**
 * Treasury's Pre-election Economic and Fiscal Update, 29 September 2026: the
 * operating balance returns to a $4.0bn surplus in 2028/29. The game measures
 * every deal against that year, and shows the four years around it.
 */
export const BASELINE = {
  label: 'Treasury PREFU 2026 forecast for 2028/29',
  year: YEARS[KEY_YEAR_INDEX]!,
  balanceNZDm: baseline.balanceNZDm[KEY_YEAR_INDEX]!,
  sourceUrl: baseline.sourceUrl,
} as const;

export const BASELINE_YEARS = {
  label: baseline.label,
  measure: baseline.measure,
  sourceUrl: baseline.sourceUrl,
  balanceNZDm: baseline.balanceNZDm,
  netDebtPctGdp: baseline.netDebtPctGdp,
  gdpNote: baseline.gdpNote,
  gdp2029NZDm: baseline.gdp2029NZDm,
} as const;

/**
 * A policy's effect in each of the four years. Where only one yearly figure is
 * known, it starts at half in 2026/27 (a government formed late in 2026 has half
 * a year) or at its stated start year, and runs at the full figure after that.
 */
export function yearlyImpact(policy: Policy): number[] {
  const full = policy.fiscalImpactNZDm ?? 0;
  if (policy.fiscalByYear) {
    const scale = policy.isCompromise ? (policy.compromise?.fiscalShare ?? 1) : 1;
    return policy.fiscalByYear.map((v) => Math.round(v * scale));
  }
  const start = policy.fiscalStart ? YEARS.indexOf(policy.fiscalStart) : 0;
  return YEARS.map((_, i) => (i < start ? 0 : i === 0 ? Math.round(full / 2) : full));
}

/** True when the yearly figures were spread from one number by the rule above. */
export function isDerived(policy: Policy): boolean {
  return !policy.fiscalByYear;
}

export interface BudgetLine {
  policy: Policy;
  /** The 2028/29 figure. */
  impact: number;
  years: number[];
  total: number;
  ownerId?: string;
}

export interface BudgetYear {
  year: string;
  baseline: number;
  change: number;
  balance: number;
  /** Change from tax and levies. */
  revenue: number;
  /** Change from programmes and cuts (positive is a saving). */
  spending: number;
}

export interface BudgetGroup {
  key: string;
  /** Four-year total. */
  total: number;
  /** 2028/29 figure. */
  impact: number;
  lines: BudgetLine[];
}

export interface Budget {
  baseline: number;
  /** Sum of every costed policy in the programme, 2028/29. */
  change: number;
  balance: number;
  lines: BudgetLine[];
  years: BudgetYear[];
  /** Change over all four years. */
  totalChange: number;
  byIssue: BudgetGroup[];
  byParty: BudgetGroup[];
  /** Share of the four-year change, by size, that rests on rough game estimates, 0 to 1. */
  estimateShare: number;
  /** Net core Crown debt in 2029/30, % of GDP: Treasury's forecast and with the deal. */
  debt: { baseline: number; withDeal: number };
  /** Spending cuts in the programme (NZ$m, 2028/29), which some parties object to. */
  servicesCuts: number;
}

function group(lines: BudgetLine[], keyOf: (l: BudgetLine) => string): BudgetGroup[] {
  const groups = new Map<string, BudgetLine[]>();
  for (const l of lines) groups.set(keyOf(l), [...(groups.get(keyOf(l)) ?? []), l]);
  return [...groups.entries()]
    .map(([key, ls]) => ({
      key,
      lines: ls,
      total: ls.reduce((s, l) => s + l.total, 0),
      impact: ls.reduce((s, l) => s + l.impact, 0),
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/** The budget once a programme of policies is added to Treasury's forecast. Pass the parties to group by owner. */
export function budgetFor(policies: Policy[], parties: Party[] = []): Budget {
  const seen = new Set<string>();
  const lines: BudgetLine[] = [];
  for (const policy of policies) {
    if (seen.has(policy.id) || policy.fiscalImpactNZDm === null) continue;
    seen.add(policy.id);
    const years = yearlyImpact(policy);
    if (years.every((v) => v === 0)) continue;
    const ownerId = parties.find((p) => p.policies.some((pol) => pol.id === policy.id))?.id;
    lines.push({ policy, impact: years[KEY_YEAR_INDEX]!, years, total: years.reduce((s, v) => s + v, 0), ownerId });
  }
  lines.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || Math.abs(b.total) - Math.abs(a.total));

  const years: BudgetYear[] = YEARS.map((year, i) => {
    const revenue = lines.filter((l) => l.policy.fiscalType === 'revenue').reduce((s, l) => s + l.years[i]!, 0);
    const spending = lines.filter((l) => l.policy.fiscalType !== 'revenue').reduce((s, l) => s + l.years[i]!, 0);
    const base = BASELINE_YEARS.balanceNZDm[i]!;
    return { year, baseline: base, change: revenue + spending, balance: base + revenue + spending, revenue, spending };
  });
  const change = years[KEY_YEAR_INDEX]!.change;
  const totalChange = years.reduce((s, y) => s + y.change, 0);
  const size = lines.reduce((s, l) => s + Math.abs(l.total), 0);
  const estimated = lines.filter((l) => l.policy.fiscalBasis !== 'party').reduce((s, l) => s + Math.abs(l.total), 0);
  // Extra borrowing over the four years, as a share of GDP; a game estimate.
  const debtBase = BASELINE_YEARS.netDebtPctGdp[YEARS.length - 1]!;
  const withDeal = debtBase - (totalChange / BASELINE_YEARS.gdp2029NZDm) * 100;
  const servicesCuts = lines
    .filter((l) => l.policy.fiscalType === 'spending' && l.impact > 0)
    .reduce((s, l) => s + l.impact, 0);

  return {
    baseline: BASELINE.balanceNZDm,
    change,
    balance: BASELINE.balanceNZDm + change,
    lines,
    years,
    totalChange,
    byIssue: group(lines, (l) => l.policy.issue as Issue),
    byParty: group(lines, (l) => l.ownerId ?? 'other'),
    estimateShare: size === 0 ? 0 : estimated / size,
    debt: { baseline: debtBase, withDeal: Math.round(withDeal * 10) / 10 },
    servicesCuts,
  };
}

/** The year the change from Treasury's forecast is largest. */
export function hardestYear(budget: Budget): BudgetYear {
  return [...budget.years].sort((a, b) => a.change - b.change)[0]!;
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
