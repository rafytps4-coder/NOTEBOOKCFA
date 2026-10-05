import { db, getPageContent, listPages, savePageContent, type PageInk } from '@/core';

export type AnnotationSnapshot = Map<string, PageInk>;

/** Current ink and objects of every live page. */
export async function snapshotAnnotations(documentId: string): Promise<AnnotationSnapshot> {
  const snap: AnnotationSnapshot = new Map();
  for (const p of await listPages(documentId)) {
    const c = await getPageContent(p.id);
    snap.set(p.id, { strokes: c.strokes, objects: c.objects });
  }
  return snap;
}

export function hasAnnotations(snap: AnnotationSnapshot): boolean {
  for (const c of snap.values()) if (c.strokes.length || c.objects.length) return true;
  return false;
}

/**
 * Empty every page's annotation layer. Only `pageContent` rows are written: the original PDF
 * asset is never touched (it is the page background, not part of the annotations).
 */
export async function clearAnnotations(snap: AnnotationSnapshot): Promise<void> {
  await db.transaction('rw', db.pageContent, db.pages, async () => {
    for (const id of snap.keys())
      await db.pageContent.put({ pageId: id, strokes: [], objects: [] });
  });
}

/** Put a snapshot back (undo). */
export async function restoreAnnotations(snap: AnnotationSnapshot): Promise<void> {
  for (const [id, ink] of snap) await savePageContent(id, ink);
}
