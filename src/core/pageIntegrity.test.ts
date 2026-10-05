// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  createPage,
  db,
  loadPageSafely,
  sanitizeContent,
  savePageContent,
  type Stroke,
} from './index';

const stroke = (id: string): Stroke => ({
  id,
  tool: 'pen',
  color: '#000',
  width: 2,
  opacity: 1,
  points: [{ x: 1, y: 2, pressure: 0.5, t: 0 }],
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('sanitizeContent', () => {
  it('keeps valid items and counts the broken ones', () => {
    const r = sanitizeContent({
      strokes: [
        stroke('ok'),
        { id: 'bad', points: 'nope' },
        null,
        { ...stroke('nan'), points: [{ x: NaN, y: 1, pressure: 1, t: 0 }] },
      ],
      objects: [
        { id: 'o', type: 'shape', shape: 'rect', cx: 1, cy: 1, w: 2, h: 2, rot: 0 },
        { id: 'x', type: 'unknown' },
      ],
    });
    expect(r.data.strokes.map((s) => s.id)).toEqual(['ok']);
    expect(r.data.objects).toHaveLength(1);
    expect(r.dropped).toBe(4);
    expect(r.malformed).toBe(false);
  });
  it('flags non-array content as malformed without throwing', () => {
    expect(sanitizeContent({ strokes: 'garbage' }).malformed).toBe(true);
    expect(sanitizeContent(null).malformed).toBe(true);
    expect(sanitizeContent(undefined).data).toEqual({ strokes: [], objects: [] });
  });
});

describe('loadPageSafely', () => {
  it('returns clean content untouched and a missing row as an empty page', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await savePageContent(p.id, { strokes: [stroke('a')], objects: [] });
    expect((await loadPageSafely(p.id)).repair).toBeNull();
    expect((await loadPageSafely(p.id)).data.strokes).toHaveLength(1);
    expect(await loadPageSafely('does-not-exist')).toEqual({
      data: { strokes: [], objects: [] },
      repair: null,
    });
  });

  it('partly damaged: keeps the good strokes, reports the loss, keeps the raw data aside', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await db.pageContent.put({
      pageId: p.id,
      strokes: [stroke('good'), { id: 'broken' }] as never,
      objects: [],
    });
    const r = await loadPageSafely(p.id);
    expect(r.data.strokes.map((s) => s.id)).toEqual(['good']);
    expect(r.repair).toEqual({ dropped: 1, restoredFromBackup: false });
    const kept = await db.pageBackup.get(`corrupt:${p.id}`);
    expect((kept!.strokes as unknown[]).length).toBe(2); // nothing thrown away
  });

  it('entirely damaged: falls back to the last good copy', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await savePageContent(p.id, { strokes: [stroke('one')], objects: [] });
    // second save snapshots the first as the "previous" good copy (rate limit allows the first one)
    await savePageContent(p.id, { strokes: [stroke('one'), stroke('two')], objects: [] });
    expect(await db.pageBackup.get(`previous:${p.id}`)).toBeDefined();
    await db.pageContent.put({ pageId: p.id, strokes: 'corrupted!' as never, objects: [] });
    const r = await loadPageSafely(p.id);
    expect(r.repair).toMatchObject({ restoredFromBackup: true });
    expect(r.data.strokes.map((s) => s.id)).toEqual(['one']);
  });

  it('never backs up damaged or empty content as a "good" copy', async () => {
    const d = await createDocument({ kind: 'notebook', title: 'D' });
    const p = await createPage(d.id, 0);
    await savePageContent(p.id, { strokes: [], objects: [] }); // empty -> nothing to protect
    await savePageContent(p.id, { strokes: [stroke('x')], objects: [] });
    expect(await db.pageBackup.get(`previous:${p.id}`)).toBeUndefined();
  });
});
