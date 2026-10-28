import { PARTIES } from '../data/parties';
import { POLLS } from '../data/scenarios';
import { BASELINE } from '../engine/budget';
import { DISCLAIMER } from './Disclaimer';

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
          a few of your policies, and send. Each offer uses one of your 10 days.
        </li>
        <li>Read the reply. A counter-offer is filled in for you. A red line means take that policy out.</li>
        <li>Watch the rival bloc: if it reaches a majority first, you lose.</li>
        <li>When a deal is signed, pick how to present it at the press conference.</li>
      </ol>
      <p>Tips appear above the talks during play. You can hide them and bring them back at any time.</p>

      <h3>How the score works</h3>
      <p>
        You only score if you form a government. The score is 60% the policies you won (weighted by how much your party
        cares about each; confidence and supply backing counts for less), 30% your own voters' mood, and 10% stability.
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
      </ul>

      <h3>Ground rules</h3>
      <ul>
        <li>The game takes no side and never asks how you will vote.</li>
        <li>Talks replies come from each party's "negotiating team" and are written by the game, not quoted.</li>
        <li>Only party leaders and a few key figures are named; other MPs are role titles.</li>
        <li>No party logos are used, and no party has endorsed the game.</li>
        <li>The game is switched off on election day, 7 November 2026.</li>
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
