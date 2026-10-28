import { useEffect, useMemo, useState } from 'react';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { ISSUE_LABELS, type Party, type Policy } from '../data/schema';
import {
  agreedPolicies,
  createGame,
  DAYS,
  holdPress,
  makeOffer,
  moodOf,
  pendingPress,
  PRESS_OPTIONS,
  previewDeal,
  programmeOf,
  POACH_PREMIUM,
  pressureFor,
  reopenTalks,
  rivalSeats,
  takenPortfolios,
  seatsAgreed,
  seatsSecured,
  summarise,
  waitDay,
  type DealStatus,
  type GameState,
  type PressSpin,
} from '../engine/game';
import { budgetFor, formatChange, formatBalance } from '../engine/budget';
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
import { leaderOf, lineFor, speakerFor } from '../engine/dialogue';
import type { GameSetup } from './App';
import { ComparisonView } from './ComparisonView';
import { Explain } from './Explain';
import { BudgetMeter, MoodMeter } from './Meters';
import { PolicyCard } from './PolicyCard';
import { ProgressGraph } from './ProgressGraph';
import { Coach } from './Coach';
import { DriftCompass } from './Compass';
import { saveRecord } from './history';
import { unlock } from './achievementStore';
import { ACHIEVEMENTS, earnedBy } from '../engine/achievements';
import { ACTUAL_2026 } from '../data/actual';
import type { GovType } from '../engine/game';
import { downloadResultCard } from './resultCard';
import { challengeUrl, shareLink } from './share';
import { cabinetOf } from '../engine/cabinet';

const STATUS_LABELS: Record<DealStatus, string> = {
  open: 'Open to talks',
  ratifying: 'Signing off',
  signed: 'Signed',
  rejected: 'Deal voted down',
  walked: 'Walked away',
  rival: 'Signed with the other side',
};

function emptyOffer(partnerId: string): Offer {
  return { partnerId, partnerPolicyIds: [], playerPolicyIds: [], portfolios: [], arrangement: 'coalition' };
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function GameScreen({
  setup,
  onQuit,
  onRematch,
}: {
  setup: GameSetup;
  onQuit: () => void;
  onRematch: () => void;
}) {
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
  const [card, setCard] = useState<Policy | null>(null);
  const cardView = card && <PolicyCard key={card.id} policy={card} onClose={() => setCard(null)} />;

  if (game.outcome !== 'playing') {
    return (
      <>
        <Results game={game} setup={setup} onQuit={onQuit} onRematch={onRematch} onCard={setCard} />
        {cardView}
      </>
    );
  }

  const partner = PARTY_BY_ID[selectedId];
  const draft = drafts[selectedId] ?? emptyOffer(selectedId);
  const setDraft = (offer: Offer) => setDrafts({ ...drafts, [offer.partnerId]: offer });
  const secured = seatsSecured(game);
  const agreed = seatsAgreed(game);
  const budget = budgetFor(programmeOf(game, PARTIES));
  const mood = moodOf(game, PARTIES);
  const preview = partner && game.partners[partner.id]?.status === 'open' ? previewDeal(game, PARTIES, draft) : undefined;
  const press = pendingPress(game);
  const rival = game.rivalId && rivalSeats(game) > 0 ? PARTY_BY_ID[game.rivalId] : undefined;

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
          {game.majority} <Explain topic="majority" label="majority" />. Pressure on everyone{' '}
          {Math.round(pressureFor(game, PARTIES) * 100)}% <Explain topic="pressure" label="pressure" />
        </div>
        {rival && (
          <>
            <div className="rival-row">
              <span>
                Rival bloc led by <strong>{rival.name}</strong> <Explain topic="rival" label="rival bloc" />
              </span>
              <span>{rivalSeats(game)} seats</span>
            </div>
            <SeatBar secured={rivalSeats(game)} agreed={rivalSeats(game)} majority={game.majority} total={game.totalSeats} rival />
          </>
        )}
        <div className="meters">
          <BudgetMeter budget={budget} preview={tab === 'negotiate' ? preview?.budget : undefined} />
          <MoodMeter mood={mood} preview={tab === 'negotiate' ? preview?.mood : undefined} />
        </div>
        {preview && tab === 'negotiate' && (
          <p className="muted small">Meters show what happens if {partner!.name} accepts the offer below.</p>
        )}
      </section>

      {press.map((id) => (
        <PressConferencePanel key={id} partner={PARTY_BY_ID[id]!} onChoose={(spin) => setGame(holdPress(game, id, spin))} />
      ))}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'negotiate'} onClick={() => setTab('negotiate')}>
          Negotiate
        </button>
        <button type="button" role="tab" aria-selected={tab === 'compare'} onClick={() => setTab('compare')}>
          Compare policies
        </button>
      </div>

      <Coach game={game} />

      {tab === 'compare' ? (
        <ComparisonView player={player} onCard={setCard} />
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
              onCard={setCard}
            />
          )}
        </div>
      )}

      <ProgressGraph history={game.history} majority={game.majority} totalSeats={game.totalSeats} player={player} rival={rival} />
      <TalksLog game={game} />
      <div className="start-row">
        <button type="button" onClick={onQuit}>
          Quit to setup
        </button>
      </div>
      {cardView}
    </>
  );
}

function SeatBar({
  secured,
  agreed,
  majority,
  total,
  rival,
}: {
  secured: number;
  agreed: number;
  majority: number;
  total: number;
  rival?: boolean;
}) {
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  return (
    <div className={`seat-bar ${rival ? 'rival' : ''}`} role="img" aria-label={`${secured} of ${majority} seats needed`}>
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
  onCard: (policy: Policy) => void;
}

/** A policy title that opens its card, with its budget effect. */
function PolicyTitle({ policy, onCard }: { policy: Policy; onCard: (policy: Policy) => void }) {
  return (
    <>
      <button type="button" className="link" onClick={() => onCard(policy)}>
        {policy.title}
      </button>
      {policy.fiscalImpactNZDm ? (
        <span className={`fiscal ${policy.fiscalImpactNZDm < 0 ? 'cost' : 'gain'}`}>
          {formatChange(policy.fiscalImpactNZDm)}
          {policy.fiscalBasis === 'estimate' ? '*' : ''}
        </span>
      ) : null}
    </>
  );
}

function OfferBuilder({ game, player, partner, draft, setDraft, onSend, onReopen, onCard }: OfferBuilderProps) {
  const state = game.partners[partner.id]!;
  const taken = takenPortfolios(game, partner.id);
  const programme = agreedPolicies(game, PARTIES, partner.id).filter((p) => !partner.policies.includes(p));
  const programmeClashes = programme.filter((p) => reactionTo(partner, p) === -2);
  const asked = player.policies.filter((p) => draft.playerPolicyIds.includes(p.id));
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2);
  const missingBottomLines = partner.policies.filter((p) => p.isBottomLine && !draft.partnerPolicyIds.includes(p.id));

  if (state.status !== 'open' && state.status !== 'rival') {
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
      {state.status === 'rival' && (
        <p className="poach-note small">
          {partner.name} has signed with the rival bloc. To win them over, your offer must beat a fresh deal by a clear
          margin ({Math.round(POACH_PREMIUM * 100)} points), and talks that fail leave them where they are.
        </p>
      )}
      <p className="muted">
        Led by {leaderOf(partner)}. Sign-off: {partner.ratification.body.toLowerCase()}
        {partner.ratification.days > 0 ? `, takes ${partner.ratification.days} day${partner.ratification.days > 1 ? 's' : ''}` : ', same day'}.{' '}
        <Explain topic="ratification" label="sign-off" />
      </p>

      <p className="muted small">
        🔒 bottom line <Explain topic="bottom-line" label="bottom lines" /> · ★ flagship · tap a policy for its card · *
        rough game estimate of the budget effect
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
              <PolicyTitle policy={p} onCard={onCard} /> <span className="muted small">({ISSUE_LABELS[p.issue]})</span>
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
                <PolicyTitle policy={p} onCard={onCard} />
                <span className={`reaction r${r}`}>{REACTION_LABELS[r]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>
          Arrangement <Explain topic="coalition" label="coalition" />
        </legend>
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
          <span>Confidence and supply: they back you on votes that keep the government in office, with no cabinet roles. Asks less of them, and is worth less to you. <Explain topic="confidence-supply" label="confidence and supply" /></span>
        </label>
      </fieldset>

      {draft.arrangement === 'coalition' && (
        <fieldset>
          <legend>Cabinet roles for them</legend>
          <p className="muted small">
            Only roles they have someone with the right skills for. You keep the Prime Minister's office, and each role can
            be promised once.
          </p>
          <div className="chips">
            {eligiblePortfolios(partner).map((id: PortfolioId) => {
              const person = bestPersonFor(partner, id)!;
              const label = PORTFOLIOS.find((p) => p.id === id)!.label;
              const holder = taken.get(id);
              return (
                <label key={id} className={`chip ${draft.portfolios.includes(id) ? 'on' : ''} ${holder ? 'taken' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={!!holder}
                    checked={draft.portfolios.includes(id) && !holder}
                    onChange={() => setDraft({ ...draft, portfolios: toggle(draft.portfolios, id) })}
                  />
                  {label}: {holder ? `promised to ${PARTY_BY_ID[holder]!.name}` : person.name}
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
      <p className="muted small">Replies are fictional lines written for the game. They are not quotes from any real person or party.</p>
      <ul className="log">
        {entries.map((entry, i) => {
          const p = PARTY_BY_ID[entry.partnerId]!;
          return (
            <li key={i} style={{ borderLeftColor: p.colour }}>
              <span className="muted small">
                Day {entry.day} · {p.name}
              </span>
              <span>
                <strong>{speakerFor(p)} (fictional):</strong> {lineFor(entry, p)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const GOV_TYPE_LABELS: Record<GovType, string> = {
  'single-party': 'Single-party majority',
  'majority-coalition': 'Majority coalition',
  minority: 'Minority government',
  'grand-coalition': 'Grand coalition',
  'fragile-minority': 'Fragile minority',
};

function sameGovernment(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function PressConferencePanel({ partner, onChoose }: { partner: Party; onChoose: (spin: PressSpin) => void }) {
  return (
    <section className="panel press">
      <h2>Press conference: deal with {partner.name}</h2>
      <p className="muted small">The media wants your take on the signed deal. How do you frame it? This takes no time.</p>
      <div className="press-options">
        {(Object.keys(PRESS_OPTIONS) as PressSpin[]).map((spin) => (
          <button key={spin} type="button" onClick={() => onChoose(spin)}>
            <strong>{PRESS_OPTIONS[spin].label}</strong>
            <span className="muted small">{PRESS_OPTIONS[spin].detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Results({
  game,
  setup,
  onQuit,
  onRematch,
  onCard,
}: {
  game: GameState;
  setup: GameSetup;
  onQuit: () => void;
  onRematch: () => void;
  onCard: (policy: Policy) => void;
}) {
  const summary = summarise(game, PARTIES);
  const player = PARTY_BY_ID[game.playerId]!;
  const partners = summary.partners.map((id) => PARTY_BY_ID[id]!);
  const programme = programmeOf(game, PARTIES, false);
  const budget = budgetFor(programme);
  const won = game.outcome === 'won';
  const [shareNote, setShareNote] = useState('');
  const [fresh, setFresh] = useState<string[]>([]);

  useEffect(() => {
    const records = saveRecord({
      id: `${setup.startedAt}-${setup.playerId}-${setup.seed}`,
      at: new Date().toISOString(),
      playerId: setup.playerId,
      scenarioId: setup.scenarioId,
      scenarioLabel: setup.scenarioLabel,
      variance: setup.variance,
      seed: setup.seed,
      outcome: won ? 'won' : 'lost',
      lostTo: game.lostTo,
      score: summary.score,
      partners: summary.partners,
      daily: setup.daily,
    });
    const partiesWon = records.filter((r) => r.outcome === 'won').map((r) => r.playerId);
    setFresh(unlock(earnedBy({ game, scenarioId: setup.scenarioId, daily: setup.daily, partiesWon })));
    // Saved once when the results first show.
  }, []);

  const challenge = async () => {
    const url = challengeUrl(setup);
    // Neutral wording: the party played and the score, nothing about who should win.
    const text = won
      ? `I formed a government playing as ${player.name} in FormaGovt and scored ${summary.score}/100. Same election result, your turn.`
      : `I tried to form a government playing as ${player.name} in FormaGovt. Same election result, your turn.`;
    const outcome = await shareLink(url, text);
    setShareNote(outcome === 'copied' ? 'Link copied.' : outcome === 'failed' ? `Copy this link: ${url}` : '');
  };
  return (
    <section className="panel results">
      <h2>
        {won ? 'Government formed' : 'No government formed'}
        {game.govType && <span className="gov-type">{GOV_TYPE_LABELS[game.govType]}</span>}
      </h2>
      {won ? (
        <p>
          {player.name}
          {partners.length > 0 ? ` with ${joinNames(partners.map((p) => p.name))}` : ' alone'} holds{' '}
          {seatsSecured(game)} of {game.totalSeats} seats on day {Math.min(game.day, DAYS)}.
        </p>
      ) : (
        <p>
          {game.lostTo === 'rival' && game.rivalId
            ? `The rival bloc led by ${PARTY_BY_ID[game.rivalId]!.name} reached ${game.majority} seats first and will form the government.`
            : 'Nobody could put together a majority by the deadline. A snap election would follow.'}
        </p>
      )}
      <p className="score">
        Score: <strong>{summary.score}</strong> / 100 <Explain topic="score" label="score" />
      </p>
      {won && (
        <table className="breakdown">
          <tbody>
            <tr>
              <th scope="row">Policies won (60%)</th>
              <td>{summary.policyScore}</td>
            </tr>
            <tr>
              <th scope="row">Voter mood (30%)</th>
              <td>
                {summary.mood.mood}
                {summary.mood.revolt ? ' · revolt' : ''}
              </td>
            </tr>
            <tr>
              <th scope="row">Stability (10%)</th>
              <td>{summary.stability}</td>
            </tr>
          </tbody>
        </table>
      )}
      {game.govType === 'fragile-minority' && (
        <p className="muted small">
          You are the largest bloc but short of a majority, so you govern vote by vote. Stability counts for little.
        </p>
      )}
      <p className="muted small">
        Scenario: {setup.scenarioLabel}
        {setup.daily ? " (today's challenge)" : ''}.
      </p>
      {fresh.length > 0 && (
        <div className="new-achievements">
          <strong>New achievement{fresh.length > 1 ? 's' : ''}:</strong>{' '}
          {fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.title).join(', ')}
        </div>
      )}
      {ACTUAL_2026.available && (
        <div className="panel">
          <h3>What actually happened</h3>
          <p>
            After the 2026 election, the government was formed by{' '}
            {joinNames(ACTUAL_2026.government.map((id) => PARTY_BY_ID[id]?.name ?? id))} ({ACTUAL_2026.arrangement}).{' '}
            {sameGovernment(ACTUAL_2026.government, [player.id, ...summary.partners])
              ? 'Your government has the same parties.'
              : 'Your government is different.'}{' '}
            <a href={ACTUAL_2026.sourceUrl} target="_blank" rel="noreferrer">
              Source
            </a>
          </p>
        </div>
      )}
      <div className="two-col">
        <div>
          <h3>Policies secured</h3>
          <ul>
            {summary.won.map((p) => (
              <li key={p.id}>
                <button type="button" className="link" onClick={() => onCard(p)}>
                  {p.title}
                </button>
              </li>
            ))}
            {summary.won.length === 0 && <li className="muted">None</li>}
          </ul>
        </div>
        <div>
          <h3>Policies left out</h3>
          <ul>
            {summary.lost.map((p) => (
              <li key={p.id}>
                <button type="button" className="link" onClick={() => onCard(p)}>
                  {p.title}
                </button>
              </li>
            ))}
            {summary.lost.length === 0 && <li className="muted">None</li>}
          </ul>
        </div>
      </div>
      {won && (
        <div className="two-col">
          <div>
            <h3>What your voters think</h3>
            <ul className="factors">
              {summary.mood.factors.map((f) => (
                <li key={f.label}>
                  <span>{f.label}</span>
                  <span className={f.points < 0 ? 'bad' : ''}>{f.points > 0 ? `+${f.points}` : f.points}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Budget {formatBalance(budget.balance)}</h3>
            <p className="muted small">{formatChange(budget.change)} on Treasury's 2028/29 forecast.</p>
            <ul className="factors">
              {budget.lines.slice(0, 8).map((l) => (
                <li key={l.policy.id}>
                  <span>{l.policy.title}</span>
                  <span className={l.impact < 0 ? 'bad' : ''}>{formatChange(l.impact)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {won && (
        <div className="two-col">
          <div>
            <h3>Cabinet</h3>
            <ul className="factors">
              {cabinetOf(game, PARTIES).map((c) => (
                <li key={c.role}>
                  <span>{c.role}</span>
                  <span>
                    <span className="swatch" style={{ background: PARTY_BY_ID[c.partyId]!.colour }} />
                    {c.person}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <DriftCompass player={player} programme={programme} />
        </div>
      )}
      <div className="row-buttons">
        <button type="button" onClick={challenge}>
          Challenge a friend
        </button>
        <button
          type="button"
          onClick={() =>
            downloadResultCard({
              playerId: player.id,
              won,
              lostToRival: game.lostTo === 'rival',
              partners: summary.partners,
              seats: seatsSecured(game),
              majority: game.majority,
              score: summary.score,
              scenarioLabel: setup.scenarioLabel,
            })
          }
        >
          Save result image
        </button>
        <button type="button" onClick={onRematch}>
          Rematch: same result
        </button>
        {shareNote && <span className="muted small">{shareNote}</span>}
      </div>
      <ProgressGraph
        history={game.history}
        majority={game.majority}
        totalSeats={game.totalSeats}
        player={player}
        rival={game.rivalId ? PARTY_BY_ID[game.rivalId] : undefined}
      />
      <TalksLog game={game} />
      <button type="button" className="primary" onClick={onQuit}>
        Play again
      </button>
    </section>
  );
}
