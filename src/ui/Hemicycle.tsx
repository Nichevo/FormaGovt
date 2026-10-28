import type { PartySeats } from '../engine/seats';
import { PARTY_BY_ID } from '../data/parties';

interface Props {
  parties: PartySeats[];
  otherSeats: number;
  totalSeats: number;
}

const ROWS = 6;
const INNER = 70;
const OUTER = 190;

/** Places seats on concentric arcs, left to right, coloured by party. */
function seatPositions(total: number): { x: number; y: number; angle: number }[] {
  const radii = Array.from({ length: ROWS }, (_, i) => INNER + ((OUTER - INNER) * i) / (ROWS - 1));
  const radiusSum = radii.reduce((s, r) => s + r, 0);
  const perRow = radii.map((r) => Math.round((total * r) / radiusSum));
  perRow[ROWS - 1]! += total - perRow.reduce((s, n) => s + n, 0);
  const seats: { x: number; y: number; angle: number }[] = [];
  radii.forEach((r, row) => {
    const n = perRow[row]!;
    for (let i = 0; i < n; i++) {
      const angle = Math.PI - (Math.PI * (i + 0.5)) / n;
      seats.push({ x: 200 + r * Math.cos(angle), y: 200 - r * Math.sin(angle), angle });
    }
  });
  // Sort by angle so each party fills a wedge from left to right.
  return seats.sort((a, b) => b.angle - a.angle);
}

export function Hemicycle({ parties, otherSeats, totalSeats }: Props) {
  const colours: string[] = [];
  for (const p of parties) {
    for (let i = 0; i < p.total; i++) colours.push(PARTY_BY_ID[p.partyId]?.colour ?? '#999999');
  }
  for (let i = 0; i < otherSeats; i++) colours.push('#9a9a9a');
  const seats = seatPositions(totalSeats);
  return (
    <svg viewBox="0 0 400 215" className="hemicycle" role="img" aria-label={`Parliament of ${totalSeats} seats`}>
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={5.2} fill={colours[i] ?? '#dddddd'} stroke="#ffffff" strokeWidth={0.6} />
      ))}
      <text x="200" y="200" textAnchor="middle" className="hemicycle-total">
        {totalSeats}
      </text>
    </svg>
  );
}
