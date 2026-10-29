import { PARTY_BY_ID } from '../data/parties';

export interface CardData {
  playerId: string;
  won: boolean;
  lostToRival: boolean;
  lostToCaucus?: boolean;
  hintUsed?: boolean;
  partners: string[];
  seats: number;
  majority: number;
  score: number;
  scenarioLabel: string;
}

/** Draws a 1200 x 630 result image and downloads it. The disclaimer is part of the image. */
export function downloadResultCard(data: CardData): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const player = PARTY_BY_ID[data.playerId]!;
  const partners = data.partners.map((id) => PARTY_BY_ID[id]!).filter(Boolean);

  ctx.fillStyle = '#f7f6f2';
  ctx.fillRect(0, 0, 1200, 630);
  // A band of the government's party colours.
  const band = [player, ...partners];
  band.forEach((p, i) => {
    ctx.fillStyle = p.colour;
    ctx.fillRect((1200 / band.length) * i, 0, 1200 / band.length, 16);
  });

  ctx.fillStyle = '#1d1d1b';
  ctx.font = '600 44px system-ui, sans-serif';
  ctx.fillText('FormaGovt', 64, 100);
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillStyle = '#6b6a65';
  ctx.fillText(`Playing as ${player.name} · ${data.scenarioLabel}`, 64, 150);

  ctx.fillStyle = '#1d1d1b';
  ctx.font = '600 56px system-ui, sans-serif';
  ctx.fillText(data.won ? 'Government formed' : 'No government formed', 64, 260);
  ctx.font = '32px system-ui, sans-serif';
  const line = data.won
    ? `${player.name}${partners.length ? ` with ${partners.map((p) => p.name).join(', ')}` : ' alone'}: ${data.seats} seats (needed ${data.majority})`
    : data.lostToRival
      ? 'The rival bloc reached a majority first'
      : data.lostToCaucus
        ? 'Replaced as leader by the caucus before a government was formed'
      : 'Nobody reached a majority: a snap election would follow';
  wrap(ctx, line, 64, 320, 1072, 42);

  if (data.won) {
    ctx.font = '600 96px system-ui, sans-serif';
    ctx.fillText(`${data.score}`, 64, 500);
    const scoreWidth = ctx.measureText(`${data.score}`).width;
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillStyle = '#6b6a65';
    ctx.fillText(data.hintUsed ? "/ 100 game score · negotiator's hint used" : '/ 100 game score', 64 + scoreWidth + 20, 500);
  }

  ctx.fillStyle = '#6b6a65';
  ctx.font = '22px system-ui, sans-serif';
  wrap(
    ctx,
    'A game, not a prediction. Policies and processes are simplified and may not match reality. Not affiliated with or endorsed by any party.',
    64,
    570,
    1072,
    28,
  );

  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `formagovt-${data.playerId}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number) {
  let lineText = '';
  for (const word of text.split(' ')) {
    const next = lineText ? `${lineText} ${word}` : word;
    if (ctx.measureText(next).width > width && lineText) {
      ctx.fillText(lineText, x, y);
      lineText = word;
      y += lineHeight;
    } else {
      lineText = next;
    }
  }
  if (lineText) ctx.fillText(lineText, x, y);
}
