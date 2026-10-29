import { useEffect, useMemo, useState } from 'react';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { ISSUE_LABELS, type Party, type Policy } from '../data/schema';
import {
  agreedPolicies,
  canOffer,
  canReapproach,
  canReopen,
  closeRenegotiation,
  createGame,
  dealVersions,
  holdPress,
  lastResponse,
  makeOffer,
  moodOf,
  pendingPress,
  PRESS_OPTIONS,
  previewDeal,
  previousOffer,
  programmeOf,
  partyMood,
  POACH_PREMIUM,
  pressureFor,
  REAPPROACH_AFTER_DAYS,
  reapproach,
  reopenDeal,
  reopenTalks,
  rivalSeats,
  takenPortfolios,
  seatsSecured,
  abstainCredit,
  abstainingSeats,
  summarise,
  waitDay,
  waitForNews,
  type DealPreview,
  type DealStatus,
  type GameState,
  type PressSpin,
  offerDays,
  SMALL_OFFER,
  BIG_OFFER,
  QUICK_OFFERS_PER_DAY,
  canSetAside,
  CHALLENGE_AFTER_DAYS,
  firmnessFor,
  hintFor,
  rulesOf,
} from '../engine/game';
import { ABSTAIN_POLICY_LIMIT, CAUCUS_FLOOR, COMMITMENT_LABELS, MAX_SOFT_COMMITMENTS, type Commitment } from '../engine/negotiation';
import { REVOLT_BELOW } from '../engine/voters';
import { RULES_LABELS } from '../engine/rules';
import { budgetFor, formatChange, formatMoney, hardestYear } from '../engine/budget';
import {
  bestPersonFor,
  canCompromise,
  compatibility,
  compromiseOf,
  eligiblePortfolios,
  isLikelyPartner,
  metByAlternative,
  offerPolicies,
  PORTFOLIOS,
  REACTION_LABELS,
  reactionTo,
  type Offer,
  type OfferResponse,
  type PortfolioId,
} from '../engine/negotiation';
import { blocProgress, dailyChange, pathsToMajority, progressText, whyTheySigned, whyTheySwitched, type WhySigned } from '../engine/explain';
import { BudgetView } from './BudgetView';
import { fixLine, leaderOf, lineFor, speakerFor } from '../engine/dialogue';
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
  'rival-signing': 'Signing off with the other side',
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
      days: setup.days,
      rules: setup.rules,
      leadershipChallenges: setup.challenges,
    }),
  );
  const [hintUsed, setHintUsed] = useState(false);
  const [tab, setTab] = useState<'negotiate' | 'compare' | 'budget'>('negotiate');
  const partnerIds = Object.keys(game.partners).sort((a, b) => (seats[b] ?? 0) - (seats[a] ?? 0));
  const [selectedId, setSelectedId] = useState(partnerIds[0] ?? '');
  const [drafts, setDrafts] = useState<Record<string, Offer>>({});
  const [card, setCard] = useState<Policy | null>(null);
  const cardView = card && <PolicyCard key={card.id} policy={card} onClose={() => setCard(null)} />;

  if (game.outcome !== 'playing') {
    return (
      <>
        <Results game={game} setup={setup} hintUsed={hintUsed} onQuit={onQuit} onRematch={onRematch} onCard={setCard} />
        {cardView}
      </>
    );
  }

  const partner = PARTY_BY_ID[selectedId];
  const previous = previousOffer(game, selectedId);
  const draft = drafts[selectedId] ?? (previous ? { ...previous.offer } : emptyOffer(selectedId));
  const setDraft = (offer: Offer) => setDrafts({ ...drafts, [offer.partnerId]: offer });
  const budget = budgetFor(programmeOf(game, PARTIES), PARTIES);
  const mood = moodOf(game, PARTIES);
  const preview = partner && canOffer(game.partners[partner.id]) ? previewDeal(game, PARTIES, draft) : undefined;
  const press = pendingPress(game);
  const rival = game.rivalId && rivalSeats(game) > 0 ? PARTY_BY_ID[game.rivalId] : undefined;
  const progress = blocProgress(game);
  const change = dailyChange(game, PARTIES);
  const playerPaths = pathsToMajority(game, PARTIES, 'player');
  const rivalPaths = pathsToMajority(game, PARTIES, 'rival');
  const todaysNews = game.news.filter((n) => n.day === game.day);

  // Forget unsent drafts for a partner whose deal just changed, so the next one starts from it.
  const play = (next: GameState, keep?: Offer) => {
    const changed = Object.keys(next.partners).filter((id) => next.partners[id]!.status !== game.partners[id]!.status || next.partners[id]!.deal !== game.partners[id]!.deal);
    const nextDrafts = { ...drafts };
    for (const id of changed) delete nextDrafts[id];
    if (keep) nextDrafts[keep.partnerId] = keep;
    setDrafts(nextDrafts);
    setGame(next);
  };

  const send = () => {
    const next = makeOffer(game, PARTIES, draft);
    // Pre-fill the next offer with whatever the partner asked for.
    const response = next.log.filter((l) => l.offer && l.partnerId === draft.partnerId).at(-1)?.response;
    const c = response?.counter;
    let keep: Offer | undefined = draft;
    if (c?.addPolicy) {
      const id = c.addPolicy.id;
      const compromise = new Set(draft.compromisePolicyIds ?? []);
      if (c.compromise) compromise.add(id);
      else compromise.delete(id);
      const { [id]: _, ...commitments } = draft.commitments ?? {};
      keep = {
        ...draft,
        partnerPolicyIds: [...new Set([...draft.partnerPolicyIds, id])],
        compromisePolicyIds: [...compromise],
        commitments,
        setAsideIds: (draft.setAsideIds ?? []).filter((x) => x !== id),
      };
    } else if (c?.dropPolicy) {
      keep = { ...draft, playerPolicyIds: draft.playerPolicyIds.filter((x) => x !== c.dropPolicy!.id) };
    } else if (c?.addPortfolio) {
      keep = { ...draft, portfolios: [...draft.portfolios, c.addPortfolio] };
    } else if (response?.budget?.fix?.items.length && (c?.cutPolicy || c?.softenPolicy)) {
      // Apply every change the partner named to fix the budget.
      keep = response.budget.fix.items.reduce<Offer>(
        (o, f) =>
          f.action === 'compromise'
            ? { ...o, compromisePolicyIds: [...new Set([...(o.compromisePolicyIds ?? []), f.policy.id])] }
            : { ...o, partnerPolicyIds: o.partnerPolicyIds.filter((x) => x !== f.policy.id), playerPolicyIds: o.playerPolicyIds.filter((x) => x !== f.policy.id) },
        draft,
      );
    } else if (response?.kind === 'accept') {
      keep = undefined;
    }
    play(next, keep);
  };

  return (
    <>
      <section className="panel status-bar">
        <div>
          <strong>
            Day {Math.min(game.day, game.days)} of {game.days}
          </strong>
          <span className="muted">
            {' '}
            · playing as {player.name} · {RULES_LABELS[rulesOf(game).version].label.replace(/ \(.*\)$/, '')} rules
            {game.leadershipChallenges ? ', leadership challenges on' : ''}
          </span>
        </div>
        {game.caucus?.unrestSince !== undefined && (
          <p className="warnings caucus-banner">
            <strong>Caucus unrest.</strong> Your voters are at {mood.mood}, below {REVOLT_BELOW}. Lift them above {REVOLT_BELOW} by the end
            of day {game.caucus.unrestSince + CHALLENGE_AFTER_DAYS}, or your caucus votes on your leadership (sooner if mood falls below 20).
            Hurting most:{' '}
            {mood.factors
              .filter((f) => f.points < 0)
              .sort((a, b) => a.points - b.points)
              .slice(0, 2)
              .map((f) => `${f.label} (${f.points})`)
              .join('; ')}
            . <Explain topic="leadership" label="leadership challenges" />
          </p>
        )}
        <div>
          <span className="progress-text">You: {progressText(progress.player, game.majority)}</span>
          {progress.player.signing > 0 && <span className="muted small"> ({progress.player.signing} still signing off)</span>}
          {abstainingSeats(game) > 0 && (
            <span className="muted small">
              {' '}
              (counts {abstainingSeats(game)} abstaining MPs as the {abstainCredit(game, abstainingSeats(game))} seats they take off the majority{' '}
              <Explain topic="abstain" label="abstaining" />)
            </span>
          )}
        </div>
        <SeatBar secured={progress.player.secured} agreed={progress.player.secured + progress.player.signing} majority={game.majority} total={game.totalSeats} />
        <div className="muted">
          You need {game.majority} <Explain topic="majority" label="majority" />. Pressure on everyone{' '}
          {Math.round(pressureFor(game, PARTIES) * 100)}% <Explain topic="pressure" label="pressure" />
        </div>
        {rival && progress.rival && (
          <>
            <div className="rival-row">
              <span>
                Rival bloc led by <strong>{rival.name}</strong> <Explain topic="rival" label="rival bloc" />
              </span>
              <span className="progress-text">{progressText(progress.rival, game.majority)}</span>
            </div>
            <SeatBar
              secured={progress.rival.secured}
              agreed={progress.rival.secured + progress.rival.signing}
              majority={game.majority}
              total={game.totalSeats}
              rival
            />
            {progress.rival.signing > 0 && <div className="muted small">{progress.rival.signing} rival seats still signing off.</div>}
          </>
        )}
        {change && (
          <div className="muted small">
            Since yesterday: {change.player}
            {rival ? ` · ${change.rival}` : ''}
          </div>
        )}
        {(playerPaths.length > 0 || rivalPaths.length > 0) && (
          <div className="muted small">
            {playerPaths.length > 0 && <>Your paths to a majority: {playerPaths.map((p) => p.join(' + ')).join(', or ')}. </>}
            {rival && rivalPaths.length > 0 && <>Rival's: {rivalPaths.map((p) => p.join(' + ')).join(', or ')}.</>}
          </div>
        )}
        {todaysNews.length > 0 && (
          <div>
            <strong className="small">This morning</strong>
            <ul className="news">
              {todaysNews.map((n, i) => (
                <li key={i}>{n.text}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="meters">
          <button type="button" className="meter-button" onClick={() => setTab('budget')} aria-label="Open the budget tab">
            <BudgetMeter budget={budget} preview={tab === 'negotiate' ? preview?.budget : undefined} />
          </button>
          <MoodMeter mood={mood} preview={tab === 'negotiate' ? preview?.mood : undefined} />
        </div>
        {preview && tab === 'negotiate' && (
          <p className="muted small">Meters show what happens if {partner!.name} accepts the offer below. Tap the budget for the detail.</p>
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
        <button type="button" role="tab" aria-selected={tab === 'budget'} onClick={() => setTab('budget')}>
          Budget
        </button>
      </div>

      <Coach game={game} />

      {tab === 'compare' ? (
        <ComparisonView player={player} onCard={setCard} />
      ) : tab === 'budget' ? (
        <>
          <BudgetView budget={budget} onCard={setCard} />
          {preview && partner && (
            <details className="panel">
              <summary>If {partner.name} accepts your current offer</summary>
              <BudgetView budget={preview.budget} onCard={setCard} compact />
            </details>
          )}
        </>
      ) : (
        <div className="negotiate">
          <section className="panel partners">
            <h2>Parties</h2>
            <ul>
              {partnerIds.map((id) => {
                const p = PARTY_BY_ID[id]!;
                const state = game.partners[id]!;
                const tag = state.status === 'open' || state.status === 'rival-signing' ? partyMood(game, id, PARTIES) : null;
                const unlikely = state.status === 'open' && !isLikelyPartner(p, player);
                const firmness = state.status === 'open' || state.status === 'rival-signing' ? firmnessFor(game, PARTIES, id) : 1;
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
                      <span className={`status ${state.status}`}>
                        {state.status === 'rival-signing'
                          ? `Signing off with the rival, decision on day ${state.rivalRatifyOnDay}`
                          : STATUS_LABELS[state.status]}
                        {state.renegotiating ? ' · reopened' : ''}
                      </span>
                      {state.unsettled && (
                        <span className="tag unsettled">
                          {state.unsettled.severity === 'request'
                            ? 'Asking for a change'
                            : `Unsettled${state.unsettled.deadline ? `: fix by day ${state.unsettled.deadline} or it leaves` : ': wants to renegotiate'}`}
                        </span>
                      )}
                      {tag && tag.label && <span className={`tag ${tag.mood}`}>{tag.label}</span>}
                      {unlikely && <span className="tag unlikely">Unlikely partner: from the other side of politics</span>}
                      {firmness < 1 && <span className="tag keen">Bottom lines {Math.round(firmness * 100)}% firm</span>}
                      {state.rivalStrain && (state.status === 'rival' || state.status === 'rival-signing') && (
                        <span className="tag keen">Unhappy with the rival bloc</span>
                      )}
                      <span className="muted small">
                        {compatibility(player, p)}% match · trust {Math.round(state.trust)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="row-buttons">
              <button type="button" onClick={() => play(waitDay(game, PARTIES))}>
                Wait a day
              </button>
              <button type="button" onClick={() => play(waitForNews(game, PARTIES))}>
                Wait for news
              </button>
            </div>
            <p className="muted small">"Wait for news" skips quiet days until something happens, up to a week.</p>
          </section>

          {partner && (
            <OfferBuilder
              game={game}
              player={player}
              partner={partner}
              draft={draft}
              base={previous}
              preview={preview}
              setDraft={setDraft}
              onSend={send}
              onReset={() => {
                const next = { ...drafts };
                delete next[partner.id];
                setDrafts(next);
              }}
              onReopen={() => play(reopenTalks(game, partner.id))}
              onReopenDeal={() => play(reopenDeal(game, partner.id))}
              onCloseRenegotiation={() => play(closeRenegotiation(game, partner.id))}
              onReapproach={() => play(reapproach(game, PARTIES, partner.id))}
              onCard={setCard}
              onHintOpened={() => setHintUsed(true)}
            />
          )}
        </div>
      )}

      <ProgressGraph history={game.history} majority={game.majority} totalSeats={game.totalSeats} player={player} rival={rival} days={game.days} />
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
    <div className={`seat-bar ${rival ? 'rival' : ''}`} role="img" aria-label={`${agreed} of ${majority} seats needed, ${secured} signed`}>
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
  /** The deal or offer this one starts from. */
  base: { offer: Offer; source: 'deal' | 'offer' } | null;
  preview?: DealPreview;
  setDraft: (offer: Offer) => void;
  onSend: () => void;
  onReset: () => void;
  onReopen: () => void;
  onReopenDeal: () => void;
  onCloseRenegotiation: () => void;
  onReapproach: () => void;
  onCard: (policy: Policy) => void;
  onHintOpened: () => void;
}

/** A policy title that opens its card, with its budget effect. */
function PolicyTitle({ policy, onCard }: { policy: Policy; onCard: (policy: Policy) => void }) {
  return (
    <>
      <button type="button" className="link" onClick={() => onCard(policy)}>
        {policy.title}
      </button>
      {policy.fiscalImpactNZDm ? (
        <span
          className={`fiscal ${policy.fiscalImpactNZDm < 0 ? 'cost' : 'gain'}`}
          title={policy.fiscalBasis === 'estimate' ? `Game estimate. ${policy.fiscalNote ?? ''}`.trim() : policy.fiscalNote}
        >
          {formatChange(policy.fiscalImpactNZDm)}
          {policy.fiscalBasis === 'estimate' ? '*' : ''}
        </span>
      ) : null}
    </>
  );
}

/** "added" or "removed" against the version the offer started from. */
function diffClass(base: string[] | undefined, now: string[], id: string): string {
  if (!base) return '';
  const was = base.includes(id);
  const is = now.includes(id);
  return was && !is ? 'diff-removed' : !was && is ? 'diff-added' : '';
}

function countChanges(base: Offer, draft: Offer): number {
  const diff = (a: string[] = [], b: string[] = []) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
  return (
    diff(base.partnerPolicyIds, draft.partnerPolicyIds) +
    diff(base.playerPolicyIds, draft.playerPolicyIds) +
    diff(base.compromisePolicyIds, draft.compromisePolicyIds) +
    diff(base.portfolios, draft.portfolios) +
    diff(softKeys(base), softKeys(draft)) +
    diff(base.setAsideIds, draft.setAsideIds) +
    (base.arrangement === draft.arrangement ? 0 : 1)
  );
}

function softKeys(offer: Offer): string[] {
  return Object.entries(offer.commitments ?? {}).map(([id, c]) => `${id}:${c}`);
}

type PolicyFilter = 'all' | 'key' | 'acceptable';

const FILTER_LABELS: Record<PolicyFilter, string> = {
  all: 'All policies',
  key: 'Bottom lines and flagships',
  acceptable: 'Hide red lines',
};

function theyWanted(response: OfferResponse | undefined): string | null {
  const c = response?.counter;
  if (c?.dropPolicy) return `"${c.dropPolicy.title}" left out: their voters would not accept it`;
  if (response?.caucus && !c) return 'more for their own voters';
  if (c?.addPolicy && c.either?.length) return [c.addPolicy, ...c.either].map((p) => p.title).join(' or ');
  if (c?.addPolicy) return c.compromise && c.addPolicy.compromise ? `${c.addPolicy.compromise.title} (compromise)` : c.addPolicy.title;
  if (c?.addPortfolio) return PORTFOLIOS.find((p) => p.id === c.addPortfolio)?.label ?? null;
  if ((c?.cutPolicy || c?.softenPolicy) && response?.budget?.fix) return fixLine(response.budget.fix).replace(/ would.*$/, ' to fix the budget');
  if (response?.sticking) return `"${response.sticking.title}" left out`;
  if (response?.redLines.length) return `${response.redLines.map((p) => `"${p.title}"`).join(', ')} left out`;
  if (response?.considering) return 'time: they are weighing their options';
  return null;
}

function OfferBuilder({
  game,
  player,
  partner,
  draft,
  base,
  preview,
  setDraft,
  onSend,
  onReset,
  onReopen,
  onReopenDeal,
  onCloseRenegotiation,
  onReapproach,
  onCard,
  onHintOpened,
}: OfferBuilderProps) {
  const [filter, setFilter] = useState<PolicyFilter>('all');
  const [hintOpen, setHintOpen] = useState(false);
  const state = game.partners[partner.id]!;
  const rules = rulesOf(game);
  const taken = takenPortfolios(game, partner.id);
  const programme = agreedPolicies(game, PARTIES, partner.id).filter((p) => !partner.policies.some((own) => own.id === p.id));
  const programmeClashes = programme.filter((p) => reactionTo(partner, p) === -2);
  const compromised = new Set(draft.compromisePolicyIds ?? []);
  const asked = player.policies.filter((p) => draft.playerPolicyIds.includes(p.id)).map((p) => (compromised.has(p.id) && canCompromise(p) ? compromiseOf(p) : p));
  const redLines = asked.filter((p) => reactionTo(partner, p) === -2);
  const soft = draft.commitments ?? {};
  const asideIds = draft.setAsideIds ?? [];
  const missingBottomLines = partner.policies.filter(
    (p) =>
      p.isBottomLine &&
      !asideIds.includes(p.id) &&
      (!draft.partnerPolicyIds.includes(p.id) || !!soft[p.id]) &&
      !metByAlternative(partner, p, draft.partnerPolicyIds, draft.compromisePolicyIds, soft),
  );
  const reply = lastResponse(game, partner.id);
  const wanted = theyWanted(reply);
  const unsettledNote = state.unsettled && (state.unsettled.severity === 'request' ? (
    <p className="warnings">
      {partner.name} has asked to change the deal: it now finds it thin
      {state.unsettled.policyIds.length ? ` and wants ${state.unsettled.policyIds.map((id) => `"${policyTitle(id)}"`).join(', ')}` : ''}. Reopen
      this deal (free) to give it something, or leave it as is: an unhappy partner makes the government less stable.
    </p>
  ) : (
    <p className="warnings">
      {partner.name} is unsettled by {state.unsettled.policyIds.map((id) => `"${policyTitle(id)}"`).join(', ')} in another deal.{' '}
      {state.unsettled.deadline
        ? `It crosses a red line: drop it or use its compromise in that deal by day ${state.unsettled.deadline}, or ${partner.name} leaves.`
        : 'Reopen this deal (free) and offer something in return to settle it.'}
    </p>
  ));

  if (!canOffer(state)) {
    const deal = state.pendingDeal ?? state.deal;
    return (
      <section className="panel offer">
        <h2>{partner.name}</h2>
        <p>{STATUS_LABELS[state.status]}.</p>
        {unsettledNote}
        {state.status === 'ratifying' && (
          <p className="muted">
            Waiting on {partner.ratification.body.toLowerCase()} (day {state.ratifyOnDay}).
          </p>
        )}
        {state.pendingDeal && (
          <p className="muted">Changes to the deal go to {partner.ratification.body.toLowerCase()} on day {state.ratifyOnDay}. The signed deal stands until then.</p>
        )}
        {deal && (state.status === 'signed' || state.status === 'ratifying') && (
          <div className="small">
            <strong>The deal:</strong>{' '}
            {offerPolicies(deal, player, partner)
              .map((p) => p.title)
              .join(', ') || 'no policies'}
            {deal.arrangement === 'coalition'
              ? `; ${deal.portfolios.length} cabinet role${deal.portfolios.length === 1 ? '' : 's'}`
              : deal.arrangement === 'abstain'
                ? '; they abstain on confidence'
                : '; confidence and supply'}
            .
          </div>
        )}
        {canReopen(state) && (
          <p>
            <button type="button" onClick={onReopenDeal}>
              {state.unsettled ? 'Reopen this deal (free while unsettled)' : 'Reopen this deal'}
            </button>{' '}
            <Explain topic="reopen" label="reopening a deal" />
            {!state.unsettled && <span className="muted small"> Once per party. Costs trust and a little voter mood.</span>}
          </p>
        )}
        {state.status === 'rejected' && (
          <button type="button" onClick={onReopen}>
            Reopen talks
          </button>
        )}
        {state.status === 'walked' &&
          (canReapproach(game, partner.id) ? (
            <p>
              <button type="button" onClick={onReapproach}>
                Approach them once more
              </button>{' '}
              <span className="muted small">Trust starts low, and it takes a clearly better offer. Two tries.</span>
            </p>
          ) : !state.reapproached ? (
            <p className="muted small">They will hear from you again from day {(state.walkedOnDay ?? 0) + REAPPROACH_AFTER_DAYS}.</p>
          ) : null)}
      </section>
    );
  }

  const renegotiating = state.renegotiating;
  const baseOffer = base?.offer;
  const changes = baseOffer ? countChanges(baseOffer, draft) : 0;
  const newMoodHits = preview
    ? preview.mood.factors.filter((f) => f.points < 0 && !moodOf(game, PARTIES).factors.some((g) => g.label === f.label))
    : [];
  const worst = preview ? hardestYear(preview.budget) : null;

  const compromiseToggle = (p: Policy) =>
    p.isBottomLine && canCompromise(p) && (draft.partnerPolicyIds.includes(p.id) || draft.playerPolicyIds.includes(p.id)) ? (
      <label className="compromise-toggle">
        <input
          type="checkbox"
          checked={compromised.has(p.id)}
          onChange={() => setDraft({ ...draft, compromisePolicyIds: toggle(draft.compromisePolicyIds ?? [], p.id) })}
        />{' '}
        compromise: {p.compromise!.title} ({p.flex})
      </label>
    ) : null;

  const softCount = Object.keys(soft).length;
  const commitmentPicker = (p: Policy) => {
    if (!rules.softCommitments || !(draft.partnerPolicyIds.includes(p.id) || draft.playerPolicyIds.includes(p.id))) return null;
    // A lesser commitment never meets a partner's bottom line, so it is not offered there.
    if (p.isBottomLine && partner.policies.includes(p)) return null;
    const full = softCount >= MAX_SOFT_COMMITMENTS && !soft[p.id];
    return (
      <label className="commitment-picker">
        as{' '}
        <select
          value={soft[p.id] ?? 'full'}
          onChange={(e) => {
            const { [p.id]: _, ...rest } = soft;
            const v = e.target.value as Commitment | 'full';
            setDraft({ ...draft, commitments: v === 'full' ? rest : { ...rest, [p.id]: v } });
          }}
        >
          <option value="full">In the agreement</option>
          <option value="committee" disabled={full}>
            {COMMITMENT_LABELS.committee} (worth 25%)
          </option>
          <option value="members-bill" disabled={full}>
            {COMMITMENT_LABELS['members-bill']} (worth 15%)
          </option>
        </select>
      </label>
    );
  };
  // Their policies are judged by your reaction, yours by theirs.
  const shown = (p: Policy, theirs: boolean) =>
    filter === 'key' ? p.isBottomLine || p.weight >= 4 : filter === 'acceptable' ? reactionTo(theirs ? player : partner, p) > -2 : true;
  const listButtons = (theirs: boolean) => {
    const set = (ids: string[]) => setDraft(theirs ? { ...draft, partnerPolicyIds: ids } : { ...draft, playerPolicyIds: ids });
    const agreed = theirs
      ? partner.policies.filter((p) => p.isBottomLine || reactionTo(player, p) >= 0)
      : player.policies.filter((p) => reactionTo(partner, p) >= 0);
    return (
      <div className="row-buttons select-buttons">
        <button type="button" onClick={() => set((theirs ? partner : player).policies.map((p) => p.id))}>
          Select all
        </button>
        <button type="button" onClick={() => set(agreed.map((p) => p.id))}>
          {theirs ? 'All I can accept + their bottom lines' : 'All they can accept'}
        </button>
        <button type="button" onClick={() => set([])}>
          Clear
        </button>
      </div>
    );
  };
  const midDay = Math.ceil(1 + (game.days - 1) / 2);
  const asideOptions = [
    ...partner.policies.filter((p) => p.isBottomLine || draft.partnerPolicyIds.includes(p.id)).map((p) => ({ p, owner: partner.name })),
    ...player.policies.map((p) => ({ p, owner: 'Yours' })),
  ];
  const hint = hintOpen ? hintFor(game, PARTIES, draft) : null;

  return (
    <section className="panel offer">
      <h2>{renegotiating ? `Changing your deal with ${partner.name}` : `Offer to ${partner.name}`}</h2>
      {unsettledNote}
      {renegotiating && (
        <p className="muted small">
          The signed deal stands unless they agree to the changes and sign them off.{' '}
          <button type="button" className="link" onClick={onCloseRenegotiation}>
            Leave the deal as it is
          </button>
        </p>
      )}
      {state.status === 'rival' && (
        <p className="poach-note small">
          {partner.name} has signed with the rival bloc. To win them over, your offer must beat a fresh deal by a clear
          margin ({Math.round((state.rivalStrain ? 0 : POACH_PREMIUM) * 100)} points), and talks that fail leave them where they are.
        </p>
      )}
      {state.status === 'rival-signing' && (
        <p className="poach-note small">
          {partner.name} has agreed terms with the rival bloc and is signing off, with a decision on day {state.rivalRatifyOnDay}. Until
          then a better offer needs only half the usual margin.
        </p>
      )}
      <p className="muted">
        Led by {leaderOf(partner)}. Sign-off: {partner.ratification.body.toLowerCase()}
        {partner.ratification.days > 0 ? `, takes ${partner.ratification.days} day${partner.ratification.days > 1 ? 's' : ''}` : ', same day'}.{' '}
        <Explain topic="ratification" label="sign-off" />
      </p>
      {baseOffer && (
        <p className="muted small">
          Starting from {base!.source === 'deal' ? 'your agreed deal' : 'your last offer'}
          {wanted && !renegotiating ? `. They wanted: ${wanted}` : ''}. {changes} change{changes === 1 ? '' : 's'}.{' '}
          {changes > 0 && (
            <button type="button" className="link" onClick={onReset}>
              Back to previous
            </button>
          )}
        </p>
      )}

      <p className="muted small">
        🔒 bottom line <Explain topic="bottom-line" label="bottom lines" /> · ★ flagship · tap a policy for its card · *
        rough game estimate of the budget effect · compromise versions <Explain topic="compromise" label="compromises" />
        {rules.softCommitments && (
          <>
            {' '}
            · a ticked policy can be agreed as a select committee referral or members' bill, up to {MAX_SOFT_COMMITMENTS} a deal{' '}
            <Explain topic="commitments" label="lesser commitments" />
          </>
        )}
      </p>
      <label className="filter-row small">
        Show{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as PolicyFilter)}>
          {(Object.keys(FILTER_LABELS) as PolicyFilter[]).map((f) => (
            <option key={f} value={f}>
              {FILTER_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Their policies you will include</legend>
        {listButtons(true)}
        {partner.policies.filter((p) => shown(p, true)).map((p) => (
          <div key={p.id} className="check-row">
            <label className={`check ${diffClass(baseOffer?.partnerPolicyIds, draft.partnerPolicyIds, p.id)}`}>
              <input
                type="checkbox"
                checked={draft.partnerPolicyIds.includes(p.id)}
                onChange={() => setDraft({ ...draft, partnerPolicyIds: toggle(draft.partnerPolicyIds, p.id) })}
              />
              <span>
                {p.isBottomLine ? '🔒 ' : p.weight >= 4 ? '★ ' : ''}
                <PolicyTitle policy={p} onCard={onCard} /> <span className="muted small">({ISSUE_LABELS[p.issue]})</span>
                {eitherNote(partner, p)}
                <span className={`reaction r${reactionTo(player, p)}`}>{REACTION_LABELS[reactionTo(player, p)]} for you</span>
              </span>
            </label>
            {compromiseToggle(p)}
            {commitmentPicker(p)}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Your policies you want them to back</legend>
        {listButtons(false)}
        {player.policies.filter((p) => shown(p, false)).map((p) => {
          const r = reactionTo(partner, compromised.has(p.id) && canCompromise(p) ? compromiseOf(p) : p);
          return (
            <div key={p.id} className="check-row">
              <label className={`check ${diffClass(baseOffer?.playerPolicyIds, draft.playerPolicyIds, p.id)}`}>
                <input
                  type="checkbox"
                  checked={draft.playerPolicyIds.includes(p.id)}
                  onChange={() => setDraft({ ...draft, playerPolicyIds: toggle(draft.playerPolicyIds, p.id) })}
                />
                <span>
                  {p.isBottomLine ? '🔒 ' : p.weight >= 4 ? '★ ' : ''}
                  <PolicyTitle policy={p} onCard={onCard} />
                  {eitherNote(player, p)}
                  <span className={`reaction r${r}`}>{REACTION_LABELS[r]}</span>
                </span>
              </label>
              {compromiseToggle(p)}
              {commitmentPicker(p)}
            </div>
          );
        })}
      </fieldset>

      {rules.agreeToDisagree && (
        <fieldset>
          <legend>
            Agree to disagree <Explain topic="agree-to-disagree" label="agree to disagree" />
          </legend>
          {canSetAside(game) ? (
            <label className="small">
              Set aside one policy:{' '}
              <select value={asideIds[0] ?? ''} onChange={(e) => setDraft({ ...draft, setAsideIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">Nothing set aside</option>
                {asideOptions.map(({ p, owner }) => (
                  <option key={p.id} value={p.id}>
                    {owner}: {p.title}
                    {p.isBottomLine ? ' (bottom line)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted small">Available from day {midDay}. One policy per deal, from either side.</p>
          )}
        </fieldset>
      )}

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
        {rules.abstention && (
          <label className="check">
            <input
              type="radio"
              checked={draft.arrangement === 'abstain'}
              onChange={() => setDraft({ ...draft, arrangement: 'abstain', portfolios: [] })}
            />
            <span>
              Abstain on confidence: they stay on the cross benches and abstain, so you need fewer votes. At most {ABSTAIN_POLICY_LIMIT} of
              their policies, the easiest deal to sell to their voters and the weakest for you. <Explain topic="abstain" label="abstaining" />
            </span>
          </label>
        )}
        {draft.arrangement === 'abstain' && draft.partnerPolicyIds.length > ABSTAIN_POLICY_LIMIT && (
          <p className="warnings">Only the first {ABSTAIN_POLICY_LIMIT} of their policies you picked go into an abstention deal. Untick the rest.</p>
        )}
      </fieldset>

      {draft.arrangement === 'coalition' && (
        <fieldset>
          <legend>
            Cabinet roles for them <Explain topic="cabinet" label="cabinet share" />
          </legend>
          {preview?.cabinet && (
            <p className={preview.cabinet.offered < preview.cabinet.expected ? 'warnings' : 'muted small'}>
              Cabinet: {preview.cabinet.offered} of an expected {preview.cabinet.expected}
              {preview.cabinet.major ? '. As a major partner they also want Deputy Prime Minister or Finance.' : '.'}
            </p>
          )}
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
                <label
                  key={id}
                  className={`chip ${draft.portfolios.includes(id) ? 'on' : ''} ${holder ? 'taken' : ''} ${diffClass(baseOffer?.portfolios, draft.portfolios, id)}`}
                >
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

      {preview && (
        <ul className="preview-notes">
          {worst && (
            <li>
              Budget over four years: {formatChange(preview.budget.totalChange)}
              {worst.change < 0 ? `, hardest in ${worst.year} (${formatChange(worst.change)})` : ''}.
            </li>
          )}
          {preview.budgetProblem && partner.personality.fiscalStance !== 'balanced' && (
            <li className="bad">
              {preview.budgetProblem.kind === 'cuts'
                ? `${partner.name} objects to cuts to services ${formatMoney(preview.budgetProblem.over)} a year past its line.`
                : `${partner.name} watches the deficit: this is ${formatMoney(preview.budgetProblem.over)} a year past its line.`}
              {preview.budgetProblem.refuse && !preview.budgetProblem.fix?.enough ? ' Too far: it will refuse whatever the policies.' : ''}{' '}
              {fixLine(preview.budgetProblem.fix)}
            </li>
          )}
          {preview.partnerMood !== undefined && (
            <li className={preview.partnerMood < CAUCUS_FLOOR ? 'bad' : ''}>
              Their voters: {preview.partnerMood}
              {preview.partnerMood < CAUCUS_FLOOR ? `, below the ${CAUCUS_FLOOR} their leader needs to sign` : ''}.{' '}
              <Explain topic="their-voters" label="their voters" />
            </li>
          )}
          {newMoodHits.map((f) => (
            <li key={f.label} className="bad">
              Your voters: {f.label}, {f.points}
            </li>
          ))}
          {preview.unsettles.map((u) => (
            <li key={u.partnerId} className="bad">
              {PARTY_BY_ID[u.partnerId]!.name} {u.severity === 'red-line' ? 'cannot accept' : 'strongly opposes'}{' '}
              {u.policies.map((p) => `"${p.title}"`).join(', ')}
              {u.severity === 'red-line' ? ' and will leave unless it is fixed within 2 days.' : ' and will demand changes.'}
            </li>
          ))}
        </ul>
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
            <li key={p.id}>
              Their bottom line "{p.title}" is not included
              {p.orPolicyIds?.length
                ? ` (or ${p.orPolicyIds.map((id) => `"${partner.policies.find((x) => x.id === id)?.title ?? id}"`).join(' or ')} instead)`
                : ''}
              .
            </li>
          ))}
        </ul>
      )}

      <details
        className="hint"
        open={hintOpen}
        onToggle={(e) => {
          const open = (e.target as HTMLDetailsElement).open;
          setHintOpen(open);
          if (open) onHintOpened();
        }}
      >
        <summary>Negotiator's hint</summary>
        {hint ? (
          <p>
            <strong className={`hint-${hint.verdict}`}>
              {hint.verdict === 'yes' ? 'Likely yes' : hint.verdict === 'close' ? 'Close' : 'Unlikely'}
            </strong>
            {hint.tip ? `. ${hint.tip}` : '.'}
          </p>
        ) : (
          <p className="muted small">No offer to judge yet.</p>
        )}
        <p className="muted small">A guess from the game, not a promise. Using it is noted on your result.</p>
      </details>

      <button type="button" className="primary" onClick={onSend}>
        {renegotiating ? 'Send changes' : 'Send offer'} ({['same day', 'uses a day', 'takes 2 days'][offerDays(game, draft)]})
      </button>
      <p className="muted small">
        Small offers or changes ({SMALL_OFFER} items or fewer) take no time, up to {QUICK_OFFERS_PER_DAY} a day. Offers of {BIG_OFFER} or more items take two days.{' '}
        <Explain topic="time" label="how long talks take" />
      </p>
    </section>
  );
}

/** "Either this or ..." beside a bottom line that another of the party's policies can stand in for. */
function eitherNote(party: Party, p: Policy) {
  if (!p.isBottomLine || !p.orPolicyIds?.length) return null;
  const others = p.orPolicyIds.map((id) => `"${party.policies.find((x) => x.id === id)?.title ?? id}"`).join(' or ');
  return <span className="muted small"> Either this or {others}</span>;
}

function policyTitle(id: string): string {
  return PARTIES.flatMap((p) => p.policies).find((p) => p.id === id)?.title ?? id;
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
          const why = entry.kind === 'rival-deal' ? whyTheySigned(game, PARTIES, entry) : null;
          return (
            <li key={i} style={{ borderLeftColor: p.colour }}>
              <span className="muted small">
                Day {entry.day} · {p.name}
              </span>
              <span>
                <strong>{speakerFor(p)} (fictional):</strong> {lineFor(entry, p)}
              </span>
              {why && <WhyCard why={why} />}
              {entry.kind === 'poached' && (
                <details className="why">
                  <summary>Why they switched</summary>
                  <ul>
                    {whyTheySwitched(game, PARTIES, entry).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WhyCard({ why }: { why: WhySigned }) {
  const party = PARTY_BY_ID[why.partyId]!;
  const rival = PARTY_BY_ID[why.withId]!;
  return (
    <details className="why">
      <summary>Why they signed with {rival.name}</summary>
      <p>
        <strong>What the rival gave them:</strong> {why.policies.length} of their policies
        {why.bottomLines.length > 0 &&
          ` (bottom lines: ${why.bottomLines.map((b) => `${b.policy.title}${b.compromise ? ', as a compromise' : ''}`).join('; ')})`}
        , {why.arrangement === 'coalition' ? `a coalition with ${why.portfolios.length > 0 ? why.portfolios.join(', ') : 'no cabinet roles'}` : why.arrangement === 'abstain' ? 'an agreement to abstain on confidence' : 'confidence and supply'}.
      </p>
      {why.comparison && <p>{why.comparison}</p>}
      <ul>
        {why.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {why.winBack && <p className="muted">{why.winBack}</p>}
      <p className="muted small">Game analysis of {party.name}'s choice, not a statement by the party.</p>
    </details>
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
  hintUsed,
  onQuit,
  onRematch,
  onCard,
}: {
  game: GameState;
  setup: GameSetup;
  hintUsed: boolean;
  onQuit: () => void;
  onRematch: () => void;
  onCard: (policy: Policy) => void;
}) {
  const summary = summarise(game, PARTIES);
  const player = PARTY_BY_ID[game.playerId]!;
  const partners = summary.partners.map((id) => PARTY_BY_ID[id]!);
  const programme = programmeOf(game, PARTIES, false);
  const budget = budgetFor(programme, PARTIES);
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
      rules: setup.rules,
      challenges: setup.challenges,
      turnout: setup.turnout,
      hintUsed,
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
          {seatsSecured(game)} of {game.totalSeats} seats on day {Math.min(game.day, game.days)}.
        </p>
      ) : (
        <p>
          {game.lostTo === 'rival' && game.rivalId
            ? `The rival bloc led by ${PARTY_BY_ID[game.rivalId]!.name} reached ${game.majority} seats first and will form the government.`
            : game.lostTo === 'caucus'
              ? `Your caucus replaced you as leader: your voters had turned against the deal. ${player.name} will take a new leader back into talks.`
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
        {setup.daily ? " (today's challenge)" : ''}. {RULES_LABELS[rulesOf(game).version].label.replace(/ \(.*\)$/, '')} rules
        {game.leadershipChallenges ? ', leadership challenges on' : ''}
        {hintUsed ? ". Negotiator's hint used" : ''}.
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
        </div>
      )}
      {won && (
        <details className="panel" open>
          <summary>
            <strong>Budget</strong>
          </summary>
          <BudgetView budget={budget} onCard={onCard} compact />
        </details>
      )}
      {won && <DealHistory game={game} />}
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
              lostToCaucus: game.lostTo === 'caucus',
              hintUsed,
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
        days={game.days}
      />
      <DayByDay game={game} />
      <TalksLog game={game} />
      <button type="button" className="primary" onClick={onQuit}>
        Play again
      </button>
    </section>
  );
}

/** How each deal changed over the talks, version by version. */
function DealHistory({ game }: { game: GameState }) {
  const player = PARTY_BY_ID[game.playerId]!;
  const versions = Object.entries(dealVersions(game)).filter(([, v]) => v.length > 1);
  if (versions.length === 0) return null;
  return (
    <div className="panel">
      <h3>How deals changed</h3>
      <ul>
        {versions.map(([id, list]) => {
          const partner = PARTY_BY_ID[id]!;
          const titles = (o: Offer) => offerPolicies(o, player, partner).map((p) => p.title);
          return (
            <li key={id}>
              <strong>{partner.name}</strong>: {list.length} versions.
              {list.slice(1).map((v, i) => {
                const before = titles(list[i]!);
                const after = titles(v);
                const added = after.filter((t) => !before.includes(t));
                const removed = before.filter((t) => !after.includes(t));
                return (
                  <div key={i} className="small">
                    Version {i + 2}: {added.length > 0 && <span className="diff-added">added {added.join(', ')} </span>}
                    {removed.length > 0 && <span className="diff-removed">{removed.join(', ')}</span>}
                    {added.length === 0 && removed.length === 0 && 'cabinet or arrangement changed'}
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Both blocs' seats each day, from the same history as the graph. */
function DayByDay({ game }: { game: GameState }) {
  const rival = game.rivalId ? PARTY_BY_ID[game.rivalId] : undefined;
  return (
    <details className="panel days-table">
      <summary>Day by day</summary>
      <table className="budget-table">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">You</th>
            {rival && <th scope="col">Rival</th>}
            <th scope="col">Mood</th>
            <th scope="col">News</th>
          </tr>
        </thead>
        <tbody>
          {game.history.map((h) => (
            <tr key={h.day}>
              <td>{h.day}</td>
              <td>{h.playerSeats}</td>
              {rival && <td>{h.rivalSeats}</td>}
              <td>{h.mood}</td>
              <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                {game.news
                  .filter((n) => n.day === h.day)
                  .map((n) => n.text)
                  .join(' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
