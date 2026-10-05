/** 2D affine in PDF order: x' = a·x + c·y + e,  y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `mul(m, n)` applies `n` first, then `m`. */
export function mul(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scaleM = (sx: number, sy = sx): Matrix => [sx, 0, 0, sy, 0, 0];
/** Rotation in a y-down frame (matches canvas `rotate`). */
export const rotateM = (rad: number): Matrix => [
  Math.cos(rad),
  Math.sin(rad),
  -Math.sin(rad),
  Math.cos(rad),
  0,
  0,
];
export const FLIP_Y: Matrix = [1, 0, 0, -1, 0, 0];

export function apply(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export interface PageBox {
  /** Crop box origin and size in PDF user units (unrotated page). */
  x0: number;
  y0: number;
  W: number;
  H: number;
  /** The page's /Rotate (0, 90, 180, 270). */
  rotate: number;
}

/**
 * Display space (what the user sees and annotates: origin top-left, y down, /Rotate applied,
 * 1 unit = 1 viewer point) → PDF user space of the unrotated page (origin bottom-left, y up).
 * `k` converts annotation units to user units if the sizes differ slightly.
 */
export function displayToUser(box: PageBox, k = 1): Matrix {
  const { x0, y0, W, H } = box;
  const r = ((box.rotate % 360) + 360) % 360;
  let m: Matrix;
  switch (r) {
    case 90:
      m = [0, 1, 1, 0, x0, y0];
      break;
    case 180:
      m = [-1, 0, 0, 1, x0 + W, y0];
      break;
    case 270:
      m = [0, -1, -1, 0, x0 + W, y0 + H];
      break;
    default:
      m = [1, 0, 0, -1, x0, y0 + H];
  }
  return mul(m, scaleM(k));
}

/** Size of the page as displayed (after /Rotate). */
export function displaySize(box: PageBox): { w: number; h: number } {
  const r = ((box.rotate % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: box.H, h: box.W } : { w: box.W, h: box.H };
}
