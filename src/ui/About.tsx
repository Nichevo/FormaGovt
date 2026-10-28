import { PARTIES } from '../data/parties';
import { POLLS } from '../data/scenarios';
import { BASELINE } from '../engine/budget';
import { DISCLAIMER } from './Disclaimer';
import { VERSION_LABEL } from '../version';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** What the game is, how to play and share it, and where its data comes from. */
export function About({ onClose }: { onClose: () => void }) {
  const policySources = [...new Set(PARTIES.flatMap((p) => p.policies.map((pol) => pol.sourceUrl)))];
  const costingSources = [
    ...new Set(PARTIES.flatMap((p) => p.policies.map((pol) => pol.fiscalSourceUrl).filter((u): u is string => !!u))),
  ];
  return (
    <section className="panel about">
      <h2>About FormaGovt</h2>
      <p>{DISCLAIMER}</p>

      <h3>Your first game</h3>
      <ol>
        <li>Pick where the seats come from (the poll average is a good start) and leave variance off.</li>
        <li>Pick a party marked easy for that result. The badge comes from test plays of the same result.</li>
        <li>
          Open talks with the party closest to you (highest % match). Include their bottom lines (🔒), ask them to back
          a few of your policies, and send. Each offer uses one of your 21 days (10 in a short game).
        </li>
        <li>Read the reply. A counter-offer is filled in for you. A red line means take that policy out.</li>
        <li>Watch the rival bloc: if it reaches a majority first, you lose.</li>
        <li>When a deal is signed, pick how to present it at the press conference.</li>
        <li>Use "Wait for news" to skip quiet days.</li>
      </ol>

      <p className="muted small">{VERSION_LABEL}</p>
      <h3>What changed in v1.1</h3>
      <ul>
        <li>A Budget tab: four years of forecasts, revenue against spending, the cost by category and by party, and every costed policy labelled as a party costing or a game estimate.</li>
        <li>Talks run three weeks by default, with a ten-day short game.</li>
        <li>Clearer progress: how many seats each bloc is short, what changed since yesterday, paths to a majority and morning news.</li>
        <li>Partners expect a fair share of cabinet, and fiscal hawks can turn down deals on the budget alone.</li>
        <li>Some bottom lines can bend to a compromise version, written for the game and labelled as such.</li>
        <li>You can reopen a deal once per party, and a new deal that upsets an existing partner forces you to renegotiate.</li>
        <li>Parties courted by both blocs hold out for more, NZ First most of all.</li>
        <li>Deals with the rival bloc now go through each party's sign-off, and the talks log explains why a party signed with the other side.</li>
        <li>Partners can come back to you asking to change a thin deal. A strong deal rarely prompts this.</li>
        <li>Small offers and changes take no time, up to two a day, while big offers take two days.</li>
        <li>Some bottom lines are an either-or: the party needs one of two of its policies, not both.</li>
        <li>Parties far to the left or right only bargain hard with their natural side, and are marked as unlikely partners for the other.</li>
        <li>Budget objections name the items in the deal that would fix them, and the Budget tab sets your deal against the last Budget by category.</li>
      </ul>
      <p>Tips appear above the talks during play. You can hide them and bring them back at any time.</p>

      <h3>How the score works</h3>
      <p>
        You only score if you form a government. The score is 60% the policies you won (weighted by how much your party
        cares about each, with bottom lines counting double and compromises for less; confidence and supply backing counts
        for less), 30% your own voters' mood, and 10% stability. Dropping your own bottom lines and flagships costs voter
        mood, more so when you give up several.
      </p>

      <h3>Sharing</h3>
      <ul>
        <li>Share the page address to send someone the game.</li>
        <li>
          On the results screen, "Challenge a friend" sends a link with the same election result and party, so you can
          compare scores. On a phone it opens the share sheet; on a computer it copies the link.
        </li>
        <li>"Save result image" downloads a picture of your result, with the disclaimer on it.</li>
        <li>Your past games stay in this browser. Use Export and Import on the start screen to move them.</li>
        <li>"Play today's challenge" gives everyone in New Zealand the same result and party for the day, so you can compare.</li>
      </ul>

      <h3>Ground rules</h3>
      <ul>
        <li>The game takes no side and never asks how you will vote.</li>
        <li>Talks replies come from each party's "negotiating team" and are written by the game, not quoted.</li>
        <li>Only party leaders and a few key figures are named; other MPs are role titles.</li>
        <li>No party logos are used, and no party has endorsed the game.</li>
        <li>The game is switched off on election day, 7 November 2026.</li>
        <li>The 2017 scenario is a what-if: real 2017 seats played with today's parties and policies.</li>
      </ul>

      <h3>Where the data comes from</h3>
      <ul>
        <li>
          Seats: the {POLLS.length} most recent public polls (
          {[...new Set(POLLS.map((p) => p.pollster))].join(', ')}) or the official 2023 result, shared out with MMP rules.
        </li>
        <li>
          Budget: {BASELINE.label}, a ${(BASELINE.balanceNZDm / 1000).toFixed(1)}bn surplus.{' '}
          <a href={BASELINE.sourceUrl} target="_blank" rel="noreferrer">
            Source
          </a>
        </li>
        <li>
          Policy costings: party figures where one was reported (
          {costingSources.map((u, i) => (
            <span key={u}>
              {i > 0 && ', '}
              <a href={u} target="_blank" rel="noreferrer">
                {hostOf(u)}
              </a>
            </span>
          ))}
          ); everything else is a rough game estimate and labelled as one.
        </li>
        <li>
          Policies:{' '}
          {policySources.map((u, i) => (
            <span key={u}>
              {i > 0 && ', '}
              <a href={u} target="_blank" rel="noreferrer">
                {hostOf(u)}
              </a>
            </span>
          ))}
          . Bottom lines, priorities and positions are set by the game from party messaging.
        </li>
      </ul>
      <button type="button" className="primary" onClick={onClose}>
        Back to the game
      </button>
    </section>
  );
}
