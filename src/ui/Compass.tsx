import { PARTIES } from '../data/parties';
import type { Party, Policy } from '../data/schema';
import { COMFORT_RADIUS, compassPoint, drift } from '../engine/compass';

const SIZE = 280;
const PAD = 32;
const scale = (v: number) => PAD + ((v + 2) / 4) * (SIZE - 2 * PAD);

/**
 * Where the party campaigned and where its deal landed, on two game axes.
 * The ring is the zone the party's voters are comfortable with.
 */
export function DriftCompass({ player, programme }: { player: Party; programme: Policy[] }) {
  const from = compassPoint(player.policies);
  const to = compassPoint(programme.length ? programme : player.policies);
  const distance = drift(from, to);
  const r = (COMFORT_RADIUS / 4) * (SIZE - 2 * PAD);
  // Social: conservative at the top.
  const px = (p: { economic: number }) => scale(p.economic);
  const py = (p: { social: number }) => scale(-p.social);
  return (
    <figure className="compass">
      <h3>Policy drift</h3>
      <figcaption>
        Policy drift: the deal sits {distance < 0.05 ? 'where you campaigned' : `${distance.toFixed(2)} from where you campaigned`}
        {distance > COMFORT_RADIUS ? ', outside your voters’ comfort zone' : ', inside your voters’ comfort zone'}.
      </figcaption>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Drift compass">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect className="frame" x={PAD} y={PAD} width={SIZE - 2 * PAD} height={SIZE - 2 * PAD} />
        <line className="axis-line" x1={scale(0)} x2={scale(0)} y1={PAD} y2={SIZE - PAD} />
        <line className="axis-line" x1={PAD} x2={SIZE - PAD} y1={scale(0)} y2={scale(0)} />
        <text className="axis" x={PAD} y={SIZE - PAD + 14}>
          ← Economic left
        </text>
        <text className="axis" x={SIZE - PAD} y={SIZE - PAD + 14} textAnchor="end">
          right →
        </text>
        <text className="axis" x={SIZE / 2} y={PAD - 6} textAnchor="middle">
          Socially conservative ↑
        </text>
        <text className="axis" x={SIZE / 2} y={SIZE - PAD + 26} textAnchor="middle">
          ↓ Socially progressive
        </text>
        {PARTIES.filter((p) => p.id !== player.id).map((p) => {
          const pt = compassPoint(p.policies);
          return (
            <g key={p.id}>
              <circle cx={px(pt)} cy={py(pt)} r={4} fill={p.colour} opacity={0.5} />
              <text className="axis" x={px(pt) + 6} y={py(pt) + 3}>
                {p.shortName}
              </text>
            </g>
          );
        })}
        <circle className="comfort" cx={px(from)} cy={py(from)} r={r} stroke={player.colour} />
        {distance >= 0.05 && (
          <line className="drift" x1={px(from)} y1={py(from)} x2={px(to)} y2={py(to)} markerEnd="url(#arrow)" />
        )}
        <circle cx={px(from)} cy={py(from)} r={5} fill={player.colour} />
        <text className="label" x={px(from) + 7} y={py(from) - 6}>
          Campaign
        </text>
        {distance >= 0.05 && (
          <text className="label" x={px(to) + 7} y={py(to) + 12}>
            Deal
          </text>
        )}
      </svg>
      <p className="muted small">
        Positions are the game's own ratings of each party's policies in this game, not an official measure.
      </p>
    </figure>
  );
}
