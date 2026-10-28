import { useEffect, useRef } from 'react';
import { PARTIES } from '../data/parties';
import { ISSUE_LABELS, type Policy } from '../data/schema';
import { formatChange, YEARS, yearlyImpact } from '../engine/budget';
import { ownerOf } from '../engine/negotiation';

const STANCE_LABELS: Record<string, string> = {
  '-2': 'Strongly left or progressive',
  '-1': 'Left or progressive',
  '0': 'Centre',
  '1': 'Right or conservative',
  '2': 'Strongly right or conservative',
};

function stanceLabel(stance: number): string {
  return STANCE_LABELS[String(Math.round(stance))] ?? 'Centre';
}

/** A policy's details and sources, shown in a modal dialog. */
export function PolicyCard({ policy, onClose }: { policy: Policy; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);
  const owner = ownerOf(PARTIES, policy.id);
  return (
    <dialog ref={ref} className="policy-card" onClose={onClose} onCancel={onClose}>
      <div className="policy-card-head" style={{ borderTopColor: owner?.colour }}>
        <span className="muted small">
          {owner?.name} · {ISSUE_LABELS[policy.issue]}
        </span>
        <h2>{policy.title}</h2>
      </div>
      <p>{policy.summary}</p>
      <dl>
        <dt>Priority for the party</dt>
        <dd>
          {policy.weight} of 5{policy.weight >= 4 ? ' (flagship)' : ''}
        </dd>
        <dt>Bottom line</dt>
        <dd>
          {policy.isBottomLine
            ? policy.bottomLineBasis === 'declared'
              ? 'Yes, declared by the party'
              : 'Yes, inferred by the game from party messaging'
            : 'No'}
        </dd>
        {policy.isBottomLine && policy.orPolicyIds?.length ? (
          <>
            <dt>Either or (game rating)</dt>
            <dd>
              The party would accept {policy.orPolicyIds.length === 1 ? 'another of its policies' : 'other policies of its own'} in place of this one:{' '}
              {policy.orPolicyIds.map((id) => `"${PARTIES.flatMap((p) => p.policies).find((p) => p.id === id)?.title ?? id}"`).join(' or ')}.
            </dd>
          </>
        ) : null}
        {policy.isBottomLine && policy.flex && (
          <>
            <dt>Room to compromise (game rating)</dt>
            <dd>
              {policy.flex === 'fixed' ? 'Fixed: no compromise' : policy.flex === 'firm' ? 'Firm: bends late or for a strong offer' : 'Soft: bends readily'}
              {policy.compromise && policy.flex !== 'fixed' && (
                <div className="small">
                  Compromise: <strong>{policy.compromise.title}</strong>. {policy.compromise.summary}{' '}
                  <span className="muted">Game compromise, not a party proposal.</span>
                </div>
              )}
            </dd>
          </>
        )}
        <dt>Where it sits</dt>
        <dd>{stanceLabel(policy.stance)} (game rating)</dd>
        <dt>Budget, 2028/29</dt>
        <dd>
          {policy.fiscalImpactNZDm === null ? 'Not costed' : `${formatChange(policy.fiscalImpactNZDm)} a year`}
          {policy.fiscalBasis && (
            <span className="muted small">
              {' '}
              ({policy.fiscalBasis === 'party' ? 'party costing' : 'game estimate, not a party costing'})
            </span>
          )}
          {policy.fiscalNote && <div className="muted small">{policy.fiscalNote}</div>}
          {policy.fiscalImpactNZDm ? (
            <div className="muted small">
              By year:{' '}
              {yearlyImpact(policy)
                .map((v, i) => `${YEARS[i]} ${formatChange(v)}`)
                .join(' · ')}
              {policy.fiscalByYear ? '' : ' (spread by the game from the yearly figure)'}
            </div>
          ) : null}
          {policy.fiscalSourceUrl && (
            <div className="small">
              <a href={policy.fiscalSourceUrl} target="_blank" rel="noreferrer">
                Costing source
              </a>
            </div>
          )}
        </dd>
      </dl>
      <p className="small">
        <a href={policy.sourceUrl} target="_blank" rel="noreferrer">
          Policy source
        </a>
      </p>
      <p className="muted small">
        Simplified for the game and may not match the party's full policy. Check the party's own material before relying
        on it.
      </p>
      <form method="dialog">
        <button type="submit" className="primary">
          Close
        </button>
      </form>
    </dialog>
  );
}
