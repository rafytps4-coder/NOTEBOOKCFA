import { newId } from '@/core/ids';
import { nextZ, type PageObject, type ShapeObject, type TextObject } from '@/engines/drawing';
import type { ImageObject, ShapeKind } from '@/core';

export interface TextOptions {
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface ShapeOptions {
  kind: ShapeKind;
  stroke: string;
  width: number;
  fill: string | null;
}

export const DEFAULT_TEXT: TextOptions = {
  fontSize: 20,
  color: '#1d1c1a',
  bold: false,
  italic: false,
};
export const DEFAULT_SHAPE: ShapeOptions = {
  kind: 'rect',
  stroke: '#1d1c1a',
  width: 2.5,
  fill: null,
};

export function makeText(x: number, y: number, o: TextOptions, objects: PageObject[]): TextObject {
  const w = 240;
  const h = Math.round(o.fontSize * 1.3 + 12);
  return {
    id: newId(),
    type: 'text',
    text: '',
    ...o,
    cx: x + w / 2,
    cy: y + h / 2,
    w,
    h,
    rot: 0,
    z: nextZ(objects),
  };
}

/** Shape from a drag between two page points. Lines/arrows keep their direction in `ends`. */
export function makeShape(
  a: { x: number; y: number },
  b: { x: number; y: number },
  o: ShapeOptions,
  objects: PageObject[],
): ShapeObject {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const w = Math.max(12, Math.abs(b.x - a.x));
  const h = Math.max(12, Math.abs(b.y - a.y));
  const ends: [number, number, number, number] = [
    a.x <= b.x ? 0 : 1,
    a.y <= b.y ? 0 : 1,
    a.x <= b.x ? 1 : 0,
    a.y <= b.y ? 1 : 0,
  ];
  return {
    id: newId(),
    type: 'shape',
    shape: o.kind,
    stroke: o.stroke,
    strokeWidth: o.width,
    fill: o.fill,
    ends: o.kind === 'line' || o.kind === 'arrow' ? ends : undefined,
    cx: x0 + w / 2,
    cy: y0 + h / 2,
    w,
    h,
    rot: 0,
    z: nextZ(objects),
  };
}

export function makeImage(
  assetId: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  objects: PageObject[],
): ImageObject {
  return {
    id: newId(),
    type: 'image',
    assetId,
    cx,
    cy,
    w,
    h,
    rot: 0,
    z: nextZ(objects),
    crop: { l: 0, t: 0, r: 0, b: 0 },
  };
}
