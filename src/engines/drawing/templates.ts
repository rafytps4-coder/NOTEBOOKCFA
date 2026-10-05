import type { PageSizeName, PageTemplate } from '@/core/models';

/** Standard sizes in px at 96 dpi (portrait). */
export const PAGE_SIZES: Record<
  Exclude<PageSizeName, 'custom'>,
  { width: number; height: number }
> = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 },
  A5: { width: 559, height: 794 },
};

export const MIN_PAGE_PX = 200;
export const MAX_PAGE_PX = 4000;

export function pageDimensions(
  name: PageSizeName,
  orientation: 'portrait' | 'landscape',
  custom = { width: 794, height: 1123 },
): { width: number; height: number } {
  const base = name === 'custom' ? custom : PAGE_SIZES[name];
  const clamp = (n: number) => Math.round(Math.min(MAX_PAGE_PX, Math.max(MIN_PAGE_PX, n)));
  const w = clamp(base.width);
  const h = clamp(base.height);
  const portrait = w <= h ? { width: w, height: h } : { width: h, height: w };
  return orientation === 'portrait' ? portrait : { width: portrait.height, height: portrait.width };
}

export const orientationOf = (p: { width: number; height: number }): 'portrait' | 'landscape' =>
  p.width > p.height ? 'landscape' : 'portrait';

export interface TemplateGeometry {
  /** Horizontal lines: y positions, spanning [x0, x1]. */
  hLines: { y: number; x0: number; x1: number }[];
  /** Vertical lines: x positions, spanning [y0, y1]. */
  vLines: { x: number; y0: number; y1: number }[];
  dots: { x: number; y: number }[];
}

/** Pure geometry for a template so it can be unit-tested and drawn on any 2D context. */
export function templateGeometry(t: PageTemplate, w: number, h: number): TemplateGeometry {
  const g: TemplateGeometry = { hLines: [], vLines: [], dots: [] };
  const s = Math.max(8, t.spacing);
  switch (t.kind) {
    case 'blank':
      break;
    case 'ruled':
      for (let y = s * 1.5; y < h - s * 0.5; y += s) g.hLines.push({ y, x0: 0, x1: w });
      break;
    case 'grid':
      for (let y = s; y < h; y += s) g.hLines.push({ y, x0: 0, x1: w });
      for (let x = s; x < w; x += s) g.vLines.push({ x, y0: 0, y1: h });
      break;
    case 'dotted':
      for (let y = s; y < h; y += s) for (let x = s; x < w; x += s) g.dots.push({ x, y });
      break;
    case 'cornell': {
      const cue = Math.round(w * 0.28);
      const summary = Math.round(h * 0.82);
      const header = Math.round(h * 0.08);
      for (let y = header + s; y < summary - s * 0.5; y += s) g.hLines.push({ y, x0: cue, x1: w });
      g.hLines.push({ y: header, x0: 0, x1: w }, { y: summary, x0: 0, x1: w });
      g.vLines.push({ x: cue, y0: header, y1: summary });
      break;
    }
  }
  return g;
}

/** Draw the paper (background colour + template) in page space. */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  template: PageTemplate,
  background: string,
): void {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  if (template.kind === 'blank') return;
  const g = templateGeometry(template, w, h);
  ctx.save();
  ctx.strokeStyle = template.color;
  ctx.fillStyle = template.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const l of g.hLines) {
    ctx.moveTo(l.x0, l.y + 0.5);
    ctx.lineTo(l.x1, l.y + 0.5);
  }
  for (const l of g.vLines) {
    ctx.moveTo(l.x + 0.5, l.y0);
    ctx.lineTo(l.x + 0.5, l.y1);
  }
  ctx.stroke();
  for (const d of g.dots) ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
  ctx.restore();
}
