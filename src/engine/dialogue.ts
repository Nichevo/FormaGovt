import { PARTY_BY_ID } from '../data/parties';
import type { Party } from '../data/schema';
import { PORTFOLIOS } from './negotiation';
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

export function lineFor(entry: LogEntry, partner: Party): string {
  const r = entry.response;
  const other = (entry.otherId && PARTY_BY_ID[entry.otherId]?.name) || 'the other side';
  const key = entry.day + partner.name.length;
  switch (entry.kind) {
    case 'accept':
      return partner.ratification.days === 0
        ? pick(['We have a deal.', 'That works for us. Consider it agreed.'], key)
        : `We can support this. It now goes to our ${partner.ratification.body.toLowerCase()} for sign-off.`;
    case 'counter':
      if (r?.counter?.addPolicy) {
        const bottomLine = r.counter.addPolicy.isBottomLine ? ' That is a bottom line for us.' : '';
        return `We are close, but we need "${r.counter.addPolicy.title}" in the agreement.${bottomLine}`;
      }
      if (r?.counter?.addPortfolio) {
        return `The policy is close. We would want ${portfolioLabel(r.counter.addPortfolio)} to make it work.`;
      }
      return 'We are close. Come back with a little more.';
    case 'hold':
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
    case 'rival-deal':
      return `We have reached an agreement with ${other}.`;
    case 'poached':
      return `We are leaving our arrangement with ${other}. Your offer is the better one.`;
    case 'rival-collapse':
      return 'With this deal signed, the other bloc has no path to a majority.';
  }
}
