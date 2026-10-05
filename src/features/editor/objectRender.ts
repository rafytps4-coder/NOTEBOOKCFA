import {
  LINE_HEIGHT,
  TEXT_PAD,
  fontString,
  handlePositions,
  textHeight,
  wrapLines,
  type HandleId,
  type ImageObject,
  type PageObject,
  type ShapeObject,
  type TextObject,
} from '@/engines/drawing';
import { getImage } from './imageCache';

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(o: Pick<TextObject, 'fontSize' | 'bold' | 'italic'>) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return (s: string) => s.length * o.fontSize * 0.55;
  measureCtx.font = fontString(o);
  const ctx = measureCtx;
  return (s: string) => ctx.measureText(s).width;
}

/** Wrapped lines of a text box at its current width. */
export function textLines(o: TextObject): string[] {
  return wrapLines(o.text, Math.max(10, o.w - TEXT_PAD * 2), measurer(o));
}

/** Height a text box needs to show all its text. */
export function neededTextHeight(o: TextObject): number {
  return textHeight(textLines(o).length, o.fontSize);
}

function shapePath(ctx: CanvasRenderingContext2D, o: ShapeObject) {
  const hw = o.w / 2;
  const hh = o.h / 2;
  ctx.beginPath();
  switch (o.shape) {
    case 'rect':
      ctx.rect(-hw, -hh, o.w, o.h);
      break;
    case 'ellipse':
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      break;
    case 'line':
    case 'arrow': {
      const [x1, y1, x2, y2] = o.ends ?? [0, 0, 1, 1];
      ctx.moveTo(-hw + x1 * o.w, -hh + y1 * o.h);
      ctx.lineTo(-hw + x2 * o.w, -hh + y2 * o.h);
      break;
    }
  }
}

function drawShape(ctx: CanvasRenderingContext2D, o: ShapeObject) {
  ctx.lineWidth = o.strokeWidth;
  ctx.strokeStyle = o.stroke;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  shapePath(ctx, o);
  if (o.fill && o.shape !== 'line' && o.shape !== 'arrow') {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  ctx.stroke();
  if (o.shape === 'arrow') {
    const [x1, y1, x2, y2] = o.ends ?? [0, 0, 1, 1];
    const ax = -o.w / 2 + x1 * o.w;
    const ay = -o.h / 2 + y1 * o.h;
    const bx = -o.w / 2 + x2 * o.w;
    const by = -o.h / 2 + y2 * o.h;
    const ang = Math.atan2(by - ay, bx - ax);
    const head = Math.max(10, o.strokeWidth * 4);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - head * Math.cos(ang - Math.PI / 7), by - head * Math.sin(ang - Math.PI / 7));
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - head * Math.cos(ang + Math.PI / 7), by - head * Math.sin(ang + Math.PI / 7));
    ctx.stroke();
  }
}

function drawText(ctx: CanvasRenderingContext2D, o: TextObject) {
  ctx.font = fontString(o);
  ctx.fillStyle = o.color;
  ctx.textBaseline = 'top';
  const lines = wrapLines(
    o.text,
    Math.max(10, o.w - TEXT_PAD * 2),
    (s) => ctx.measureText(s).width,
  );
  const lh = o.fontSize * LINE_HEIGHT;
  lines.forEach((l, i) => ctx.fillText(l, -o.w / 2 + TEXT_PAD, -o.h / 2 + TEXT_PAD + i * lh));
}

function drawImageObject(ctx: CanvasRenderingContext2D, o: ImageObject) {
  const img = getImage(o.assetId);
  if (!img) {
    // Placeholder while decoding (or if the file is missing).
    ctx.fillStyle = 'rgba(128,128,128,0.15)';
    ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
    return;
  }
  const { l, t, r, b } = o.crop;
  const sw = img.width * (1 - l - r);
  const sh = img.height * (1 - t - b);
  ctx.drawImage(img, img.width * l, img.height * t, sw, sh, -o.w / 2, -o.h / 2, o.w, o.h);
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: PageObject,
  opts: { hideText?: boolean } = {},
): void {
  ctx.save();
  ctx.translate(o.cx, o.cy);
  ctx.rotate(o.rot);
  if (o.type === 'shape') drawShape(ctx, o);
  else if (o.type === 'image') drawImageObject(ctx, o);
  else if (!opts.hideText) drawText(ctx, o);
  ctx.restore();
}

/** Draw objects bottom-to-top. `skip` ids are not drawn (selected-and-moving, being edited…). */
export function drawObjects(
  ctx: CanvasRenderingContext2D,
  objects: PageObject[],
  skip?: Set<string>,
): void {
  const sorted = [...objects].sort((a, b) => a.z - b.z);
  for (const o of sorted) if (!skip?.has(o.id)) drawObject(ctx, o);
}

const SELECT_COLOR = '#1a5fd0';
export const HANDLE_PX = 9; // visual half-size of a handle square, in screen px
export const HANDLE_HIT_PX = 20; // touch/pencil friendly hit radius, in screen px
export const ROTATE_GAP_PX = 28;

/** Selection chrome for one object: outline, 8 resize handles and a rotate handle. */
export function drawHandles(ctx: CanvasRenderingContext2D, o: PageObject, scale: number) {
  const px = 1 / scale;
  const pos = handlePositions(o, ROTATE_GAP_PX * px);
  ctx.save();
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = SELECT_COLOR;
  ctx.fillStyle = '#fff';
  ctx.translate(o.cx, o.cy);
  ctx.rotate(o.rot);
  ctx.setLineDash([6 * px, 4 * px]);
  ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, -o.h / 2);
  ctx.lineTo(0, -o.h / 2 - ROTATE_GAP_PX * px);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = SELECT_COLOR;
  ctx.fillStyle = '#fff';
  for (const id of Object.keys(pos) as HandleId[]) {
    const p = pos[id];
    ctx.beginPath();
    if (id === 'rotate') ctx.arc(p.x, p.y, HANDLE_PX * px, 0, Math.PI * 2);
    else
      ctx.rect(
        p.x - (HANDLE_PX * px) / 2,
        p.y - (HANDLE_PX * px) / 2,
        HANDLE_PX * px,
        HANDLE_PX * px,
      );
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
