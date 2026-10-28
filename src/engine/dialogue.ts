import { PARTY_BY_ID } from '../data/parties';
import type { Party } from '../data/schema';
import { PORTFOLIOS, type BudgetFixPlan, type OfferResponse } from './negotiation';
import { formatMoney } from './budget';
import type { LogEntry } from './game';

/**
 * Templated lines for each response. These are written for the game, not quotes.
 * They are spoken by a party's negotiating team, never by a named real person,
 * and the UI labels them as fictional.
 */
export function speakerFor(party: Party): string {
  return `${party.name} negotiating team`;
}

export function leaderOf(party: Party): string {
  const leader = party.people.find((p) => p.isKeyFigure && /leader/i.test(p.role) && !/deputy/i.test(p.role));
  return leader?.name ?? `${party.name} negotiator`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function portfolioLabel(id: string): string {
  return PORTFOLIOS.find((p) => p.id === id)?.label ?? id;
}

/** Picks a variant deterministically so the same game reads the same on replay. */
function pick(options: string[], key: number): string {
  return options[Math.abs(key) % options.length]!;
}

function policyTitle(id: string): string {
  for (const party of Object.values(PARTY_BY_ID)) {
    const policy = party.policies.find((p) => p.id === id);
    if (policy) return policy.title;
  }
  return id;
}

function budgetLine(r: OfferResponse): string {
  const b = r.budget!;
  const gap =
    b.kind === 'cuts'
      ? `The policies are workable, but this deal cuts ${formatMoney(b.over)} a year more from public services than we can accept.`
      : `The policies work for us, but this deal digs the deficit ${formatMoney(b.over)} a year deeper than we can defend.`;
  return `${gap} ${fixLine(b.fix)}`.trim();
}

/** "Scaling back X and dropping Y would fix it." */
export function fixLine(fix: BudgetFixPlan | undefined): string {
  if (!fix?.items.length) return 'None of your own policies in this deal would close that gap.';
  const steps = fix.items.map((f) => `${f.action === 'drop' ? 'dropping' : 'scaling back'} "${f.policy.title}"`);
  const what = list(steps);
  const said = what.charAt(0).toUpperCase() + what.slice(1);
  return fix.enough ? `${said} would fix that.` : `${said} would get us part of the way.`;
}

export function lineFor(entry: LogEntry, partner: Party): string {
  const r = entry.response;
  const other = (entry.otherId && PARTY_BY_ID[entry.otherId]?.name) || 'the other side';
  const key = entry.day + partner.name.length;
  const titles = list((entry.policyIds ?? []).map((id) => `"${policyTitle(id)}"`));
  switch (entry.kind) {
    case 'accept':
      if (entry.renegotiation) return 'We can live with these changes.';
      return partner.ratification.days === 0
        ? pick(['We have a deal.', 'That works for us. Consider it agreed.'], key)
        : `We can support this. It now goes to our ${partner.ratification.body.toLowerCase()} for sign-off.`;
    case 'counter':
      if (r?.counter?.cutPolicy) {
        return budgetLine(r);
      }
      if (r?.counter?.softenPolicy) return budgetLine(r);
      if (r?.counter?.addPolicy) {
        if (r.counter.compromise && r.counter.addPolicy.compromise) {
          return `We know "${r.counter.addPolicy.title}" is hard for others. We would accept "${r.counter.addPolicy.compromise.title}" instead.`;
        }
        if (r.counter.either?.length) {
          const others = r.counter.either.map((p) => `"${p.title}"`).join(' or ');
          return `We need "${r.counter.addPolicy.title}" in the agreement, or ${others} instead. One of them is a bottom line for us.`;
        }
        const bottomLine = r.counter.addPolicy.isBottomLine ? ' That is a bottom line for us.' : '';
        return `We are close, but we need "${r.counter.addPolicy.title}" in the agreement.${bottomLine}`;
      }
      if (r?.counter?.addPortfolio) {
        if (r.cabinet?.major) {
          return `A party our size expects a real place at the cabinet table, starting with ${portfolioLabel(r.counter.addPortfolio)}.`;
        }
        return `The policy is close. We would want ${portfolioLabel(r.counter.addPortfolio)} to make it work.`;
      }
      return 'We are close. Come back with a little more.';
    case 'hold':
      if (r?.considering) return pick(['We are still considering our options.', 'We are talking to everyone. We will not be rushed.'], key);
      if (r?.budget?.refuse) return budgetLine(r);
      return r?.sticking
        ? `We are some way apart. "${r.sticking.title}" is the biggest problem for our members.`
        : pick(['This does not give us enough of what we campaigned on.', 'Not yet. Our voters expect more from us.'], key);
    case 'walk':
      if (r && r.redLines.length > 0) {
        return `We cannot be part of a government that includes ${list(r.redLines.map((p) => `"${p.title}"`))}. Take it out or we are done.`;
      }
      return 'This is going nowhere. We are stepping back from talks.';
    case 'signed':
      return `Signed off (${partner.ratification.body.toLowerCase()}). The deal is done.`;
    case 'rejected':
      return `The deal was voted down (${partner.ratification.body.toLowerCase()}). Too much of what we stood for was left out.`;
    case 'ratifying':
      return 'Sign-off is under way.';
    case 'rival-signing':
      return partner.ratification.days === 0
        ? `We have agreed terms with ${other}.`
        : `We have agreed terms with ${other}. It now goes to our ${partner.ratification.body.toLowerCase()}.`;
    case 'rival-deal':
      return `We have reached an agreement with ${other}.`;
    case 'rival-rejected':
      return `Our ${partner.ratification.body.toLowerCase()} did not back the deal with ${other}. We are open to talks again.`;
    case 'poached':
      return `We are leaving our arrangement with ${other}. Your offer is the better one.`;
    case 'rival-collapse':
      return 'With this deal signed, the other bloc has no path to a majority.';
    case 'reopened':
      return 'We are willing to look at the agreement again. We will want something in return.';
    case 'renegotiated':
      return 'The changes to our agreement are agreed.';
    case 'reapproached':
      return 'We are prepared to listen once more. It will take a clearly better offer.';
    case 'unsettled':
      return `The programme you have agreed with others now includes ${titles}. That is a problem for us and we need to talk.`;
    case 'settled':
      return 'Thank you for sorting that out. We are comfortable with the programme again.';
    case 'requested':
      return titles
        ? `Our members feel the agreement gives us too little. We would like to reopen it and talk about ${titles}.`
        : 'Our members feel the agreement gives us too little. We would like to reopen it.';
    case 'left':
      return `${titles} is still in the programme. We are leaving the agreement.`;
  }
}
