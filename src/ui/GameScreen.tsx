import { useMemo, useState } from 'react';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { ISSUE_LABELS, type Party } from '../data/schema';
import {
  agreedPolicies,
  createGame,
  DAYS,
  makeOffer,
  pressureOn,
  reopenTalks,
  seatsAgreed,
  seatsSecured,
  summarise,
  waitDay,
  type DealStatus,
  type GameState,
} from '../engine/game';
import {
  bestPersonFor,
  compatibility,
  eligiblePortfolios,
  PORTFOLIOS,
  REACTION_LABELS,
  reactionTo,
  type Offer,
  type PortfolioId,
} from '../engine/negotiation';
import { leaderOf, lineFor } from '../engine/dialogue';
import type { GameSetup } from './App';
import { ComparisonView } from './ComparisonView';

const STATUS_LABELS: Record<DealStatus, string> = {
  open: 'Open to talks',
  ratifying: 'Signing off',
  signed: 'Signed',
  rejected: 'Deal voted down',
  walked: 'Walked away',
};

function emptyOffer(partnerId: string): Offer {
  return { partnerId, partnerPolicyIds: [], playerPolicyIds: [], portfolios: [], arrangement: 'coalition' };
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function GameScreen({ setup, onQuit }: { setup: GameSetup; onQuit: () => void }) {
  const player = PARTY_BY_ID[setup.playerId]!;
  const seats = useMemo(
    () => Object.fromEntries(setup.result.parties.map((p) => [p.partyId, p.total])),
    [setup.result],
  );
  const [game, setGame] = useState<GameState>(() =>
    createGame({
      player,
      parties: PARTIES,
      seats,
      majority: setup.result.majority,
      totalSeats: setup.result.totalSeats,
      seed: setup.seed,
    }),
  );
  const [tab, setTab] = useState<'negotiate' | 'compare'>('negotiate');
  const partnerIds = Object.keys(game.partners).sort((a, b) => (seats[b] ?? 0) - (seats[a] ?? 0));
  const [selectedId, setSelectedId] = useState(partnerIds[0] ?? '');
  const [drafts, setDrafts] = useState<Record<string, Offer>>({});

  if (game.outcome !== 'playing') return <Results game={game} setup={setup} onQuit={onQuit} />;

  const partner = PARTY_BY_ID[selectedId];
  const draft = drafts[selectedId] ?? emptyOffer(selectedId);
  const setDraft = (offer: Offer) => setDrafts({ ...drafts, [offer.partnerId]: offer });
  const secured = seatsSecured(game);
  const agreed = seatsAgreed(game);

  const send = () => {
    const next = makeOffer(game, PARTIES, draft);
    // Pre-fill the next offer with whatever the partner asked for.
    const response = next.log.filter((l) => l.offer).at(-1)?.response;
    if (response?.counter?.addPolicy) {
      setDraft({ ...draft, partnerPolicyIds: [...draft.partnerPolicyIds, response.counter.addPolicy.id] });
    } else if (response?.counter?.addPortfolio) {
      setDraft({ ...draft, portfolios: [...draft.portfolios, response.counter.addPortfolio] });
    }
    setGame(next);
  };

  return (
    <>
      <section className="panel status-bar">
        <div>
          <strong>
            Day {game.day} of {DAYS}
          </strong>
          <span className="muted"> · playing as {player.name}</span>
        </div>
        <SeatBar secured={secured} agreed={agreed} majority={game.majority} total={game.totalSeats} />
        <div className="muted">
          {secured} seats signed{agreed > secured ? `, ${agreed - secured} more signing off` : ''}. You need{' '}
          {game.majority}. Pressure {Math.round(pressureOn(game.day) * 100)}%.
        </div>
      </section>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'negotiate'} onClick={() => setTab('negotiate')}>
          Negotiate
        </button>
        <button type="button" role="tab" aria-selected={tab === 'compare'} onClick={() => setTab('compare')}>
          Compare policies
        </button>
      </div>

      {tab === 'compare' ? (
        <ComparisonView player={player} />
      ) : (
        <div className="negotiate">
          <section className="panel partners">
            <h2>Parties</h2>
            <ul>
              {partnerIds.map((id) => {
                const p = PARTY_BY_ID[id]!;
                const state = game.partners[id]!;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`partner ${id === selectedId ? 'selected' : ''}`}
                      style={{ borderLeftColor: p.colour }}
                      onClick={() => setSelectedId(id)}
                    >
                      <span className="partner-name">
                        <strong>{p.name}</strong> <span className="muted">{seats[id]} seats</span>
                      </span>
                      <span className={`status ${state.status}`}>{STATUS_LABELS[state.status]}</span>
                      <span className="muted small">
                        {compatibility(player, p)}% match · trust {Math.round(state.trust)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setGame(waitDay(game, PARTIES))}>
              Wait a day
            </button>
          </section>

          {partner && (
            <OfferBuilder
              game={game}
              player={player}
              partner={partner}
              draft={draft}
              setDraft={setDraft}
              onSend={send}
              onReopen={() => setGame(reopenTalks(game, partner.id))}
            />
          )}
        </div>
      )}

      <TalksLog game={game} />
      <div className="start-row">
        <button type="button" onClick={onQuit}>
          Quit to setup
        </button>
      </div>
    </>
  );
}

function SeatBar({ secured, agreed, majority, total }: { secured: number; agreed: number; majority: number; total: number }) {
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  return (
    <div className="seat-bar" role="img" aria-label={`${secured} of ${majority} seats needed`}>
      <div className="seat-bar-agreed" style={{ width: pct(agreed) }} />
      <div className="seat-bar-secured" style={{ width: pct(secured) }} />
      <div className="seat-bar-majority" style={{ left: pct(majority) }} />
    </div>
  );
}

interface OfferBuilderProps {
  game: GameState;
  player: Party;
  partner: Party;
  draft: Offer;
  setDraft: (offer: Offer) => void;
  onSend: () => void;
  onReopen: () => void;
}

function OfferBuilder({ game, player, partner, draft, setDraft, onSend, onReopen }: OfferBuilderProps) {
  const state = game.partners[partner.id]!;
  const programme = agreedPolicies(game, PARTIES, partner.id).filter((p) => !partner.policies.includes(p));
  const programmeClashes = programme.filter((p) => reactionTo(partner, p) === -2);
  const asked = player.policies.filter((p) => draft.playerPolicyIds.includes(p.id));
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2);
  const missingBottomLines = partner.policies.filter((p) => p.isBottomLine && !draft.partnerPolicyIds.includes(p.id));

  if (state.status !== 'open') {
    return (
      <section className="panel offer">
        <h2>{partner.name}</h2>
        <p>{STATUS_LABELS[state.status]}.</p>
        {state.status === 'ratifying' && (
          <p className="muted">
            Waiting on {partner.ratification.body.toLowerCase()} (day {state.ratifyOnDay}).
          </p>
        )}
        {state.status === 'rejected' && (
          <button type="button" onClick={onReopen}>
            Reopen talks
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="panel offer">
      <h2>Offer to {partner.name}</h2>
      <p className="muted">
        Led by {leaderOf(partner)}. Sign-off: {partner.ratification.body.toLowerCase()}
        {partner.ratification.days > 0 ? `, takes ${partner.ratification.days} day${partner.ratification.days > 1 ? 's' : ''}` : ', same day'}.
      </p>

      <fieldset>
        <legend>Their policies you will include</legend>
        {partner.policies.map((p) => (
          <label key={p.id} className="check">
            <input
              type="checkbox"
              checked={draft.partnerPolicyIds.includes(p.id)}
              onChange={() => setDraft({ ...draft, partnerPolicyIds: toggle(draft.partnerPolicyIds, p.id) })}
            />
            <span>
              {p.isBottomLine ? '🔒 ' : p.weight >= 4 ? '★ ' : ''}
              {p.title} <span className="muted small">({ISSUE_LABELS[p.issue]})</span>
              <span className={`reaction r${reactionTo(player, p)}`}>{REACTION_LABELS[reactionTo(player, p)]} for you</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Your policies you want them to back</legend>
        {player.policies.map((p) => {
          const r = reactionTo(partner, p);
          return (
            <label key={p.id} className="check">
              <input
                type="checkbox"
                checked={draft.playerPolicyIds.includes(p.id)}
                onChange={() => setDraft({ ...draft, playerPolicyIds: toggle(draft.playerPolicyIds, p.id) })}
              />
              <span>
                {p.isBottomLine ? '🔒 ' : p.weight >= 4 ? '★ ' : ''}
                {p.title}
                <span className={`reaction r${r}`}>{REACTION_LABELS[r]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Arrangement</legend>
        <label className="check">
          <input
            type="radio"
            checked={draft.arrangement === 'coalition'}
            onChange={() => setDraft({ ...draft, arrangement: 'coalition' })}
          />
          <span>Coalition: they join cabinet</span>
        </label>
        <label className="check">
          <input
            type="radio"
            checked={draft.arrangement === 'confidence-supply'}
            onChange={() => setDraft({ ...draft, arrangement: 'confidence-supply', portfolios: [] })}
          />
          <span>Confidence and supply: they back you on votes that keep the government in office, with no cabinet roles. Asks less of them, and is worth less to you.</span>
        </label>
      </fieldset>

      {draft.arrangement === 'coalition' && (
        <fieldset>
          <legend>Cabinet roles for them</legend>
          <p className="muted small">Only roles they have someone with the right skills for.</p>
          <div className="chips">
            {eligiblePortfolios(partner).map((id: PortfolioId) => {
              const person = bestPersonFor(partner, id)!;
              const label = PORTFOLIOS.find((p) => p.id === id)!.label;
              return (
                <label key={id} className={`chip ${draft.portfolios.includes(id) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={draft.portfolios.includes(id)}
                    onChange={() => setDraft({ ...draft, portfolios: toggle(draft.portfolios, id) })}
                  />
                  {label}: {person.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {(redLines.length > 0 || programmeClashes.length > 0 || missingBottomLines.length > 0) && (
        <ul className="warnings">
          {redLines.map((p) => (
            <li key={p.id}>"{p.title}" crosses a {partner.name} red line.</li>
          ))}
          {programmeClashes.map((p) => (
            <li key={p.id}>Already agreed with another party: "{p.title}" crosses a {partner.name} red line.</li>
          ))}
          {missingBottomLines.map((p) => (
            <li key={p.id}>Their bottom line "{p.title}" is not included.</li>
          ))}
        </ul>
      )}

      <button type="button" className="primary" onClick={onSend}>
        Send offer (uses a day)
      </button>
    </section>
  );
}

function TalksLog({ game }: { game: GameState }) {
  const entries = [...game.log].reverse();
  if (entries.length === 0) return null;
  return (
    <section className="panel">
      <h2>Talks so far</h2>
      <p className="muted small">Leader replies are fictional lines written for the game, not real quotes.</p>
      <ul className="log">
        {entries.map((entry, i) => {
          const p = PARTY_BY_ID[entry.partnerId]!;
          return (
            <li key={i} style={{ borderLeftColor: p.colour }}>
              <span className="muted small">
                Day {entry.day} · {p.name}
              </span>
              <span>
                <strong>{leaderOf(p)} (fictional):</strong> {lineFor(entry, p)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function Results({ game, setup, onQuit }: { game: GameState; setup: GameSetup; onQuit: () => void }) {
  const summary = summarise(game, PARTIES);
  const player = PARTY_BY_ID[game.playerId]!;
  const partners = summary.partners.map((id) => PARTY_BY_ID[id]!);
  return (
    <section className="panel results">
      <h2>{game.outcome === 'won' ? 'Government formed' : 'No government formed'}</h2>
      {game.outcome === 'won' ? (
        <p>
          {player.name}
          {partners.length > 0 ? ` with ${joinNames(partners.map((p) => p.name))}` : ' alone'} holds{' '}
          {seatsSecured(game)} of {game.totalSeats} seats on day {Math.min(game.day, DAYS)}.
        </p>
      ) : (
        <p>The deadline passed without a majority. A snap election or another party's deal would follow.</p>
      )}
      <p className="score">
        Policy score: <strong>{summary.policyScore}</strong> / 100
      </p>
      <p className="muted small">
        The weighted share of your own policies written into signed deals. Voter mood and the budget join the score
        in a later version. Scenario: {setup.scenarioLabel}.
      </p>
      <div className="two-col">
        <div>
          <h3>Policies secured</h3>
          <ul>
            {summary.won.map((p) => (
              <li key={p.id}>{p.title}</li>
            ))}
            {summary.won.length === 0 && <li className="muted">None</li>}
          </ul>
        </div>
        <div>
          <h3>Policies left out</h3>
          <ul>
            {summary.lost.map((p) => (
              <li key={p.id}>{p.title}</li>
            ))}
            {summary.lost.length === 0 && <li className="muted">None</li>}
          </ul>
        </div>
      </div>
      <TalksLog game={game} />
      <button type="button" className="primary" onClick={onQuit}>
        Play again
      </button>
    </section>
  );
}
