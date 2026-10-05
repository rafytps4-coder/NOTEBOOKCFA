import { db } from './db';
import type { PageObject, Stroke } from './models';

export interface PageInkData {
  strokes: Stroke[];
  objects: PageObject[];
}

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function validStroke(s: unknown): s is Stroke {
  const x = s as Partial<Stroke> | null;
  return (
    !!x &&
    typeof x.id === 'string' &&
    Array.isArray(x.points) &&
    x.points.every((p) => !!p && num(p.x) && num(p.y) && num(p.pressure)) &&
    num(x.width) &&
    typeof x.color === 'string' &&
    num(x.opacity)
  );
}

function validObject(o: unknown): o is PageObject {
  const x = o as Partial<PageObject> | null;
  if (
    !x ||
    typeof x.id !== 'string' ||
    !num(x.cx) ||
    !num(x.cy) ||
    !num(x.w) ||
    !num(x.h) ||
    !num(x.rot)
  )
    return false;
  if (x.type === 'text') return typeof (x as { text?: unknown }).text === 'string';
  if (x.type === 'shape') return typeof (x as { shape?: unknown }).shape === 'string';
  if (x.type === 'image') return typeof (x as { assetId?: unknown }).assetId === 'string';
  return false;
}

export interface Sanitized {
  data: PageInkData;
  /** How many strokes/objects were unusable and left out. */
  dropped: number;
  /** The stored value was not even shaped like page content. */
  malformed: boolean;
}

/** Keep every valid stroke/object; report (not throw on) anything unusable. */
export function sanitizeContent(
  raw: { strokes?: unknown; objects?: unknown } | null | undefined,
): Sanitized {
  if (!raw || typeof raw !== 'object')
    return { data: { strokes: [], objects: [] }, dropped: 0, malformed: true };
  const strokesRaw = raw.strokes;
  const objectsRaw = raw.objects ?? [];
  const malformed = !Array.isArray(strokesRaw) || !Array.isArray(objectsRaw);
  const sArr = Array.isArray(strokesRaw) ? strokesRaw : [];
  const oArr = Array.isArray(objectsRaw) ? objectsRaw : [];
  const strokes = sArr.filter(validStroke);
  const objects = oArr.filter(validObject);
  return {
    data: { strokes, objects },
    dropped: sArr.length - strokes.length + (oArr.length - objects.length),
    malformed,
  };
}

export interface LoadedPage {
  data: PageInkData;
  /** Set when the stored data had to be repaired; explains what happened (for a notice). */
  repair: null | { dropped: number; restoredFromBackup: boolean };
}

const PREVIOUS_EVERY_MS = 10_000;
const lastPrevious = new Map<string, number>();

/** Before a save overwrites a page, keep the old version as a last-good copy (rate-limited). */
export async function backupPreviousContent(pageId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastPrevious.get(pageId) ?? 0) < PREVIOUS_EVERY_MS) return;
  const prev = await db.pageContent.get(pageId);
  if (!prev) return;
  const s = sanitizeContent(prev);
  if (s.malformed || s.dropped > 0 || (!s.data.strokes.length && !s.data.objects.length)) return; // only keep good, non-empty copies
  lastPrevious.set(pageId, now);
  await db.pageBackup.put({
    key: `previous:${pageId}`,
    pageId,
    kind: 'previous',
    savedAt: now,
    strokes: prev.strokes,
    objects: prev.objects ?? [],
  });
}

/**
 * Read a page's content defensively. A damaged row never prevents a page from opening: valid
 * items are kept, the damaged raw data is stored as a `corrupt` copy, and if nothing usable is
 * left the last good copy is used.
 */
export async function loadPageSafely(pageId: string): Promise<LoadedPage> {
  const row = await db.pageContent.get(pageId);
  if (!row) return { data: { strokes: [], objects: [] }, repair: null };
  const s = sanitizeContent(row);
  if (!s.malformed && s.dropped === 0) return { data: s.data, repair: null };

  await db.pageBackup.put({
    key: `corrupt:${pageId}`,
    pageId,
    kind: 'corrupt',
    savedAt: Date.now(),
    strokes: row.strokes,
    objects: row.objects ?? [],
  });
  const empty = !s.data.strokes.length && !s.data.objects.length;
  if (empty) {
    const prev = await db.pageBackup.get(`previous:${pageId}`);
    if (prev) {
      const p = sanitizeContent(prev);
      if (!p.malformed)
        return { data: p.data, repair: { dropped: s.dropped, restoredFromBackup: true } };
    }
  }
  return { data: s.data, repair: { dropped: s.dropped, restoredFromBackup: false } };
}
