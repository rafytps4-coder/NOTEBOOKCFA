import { db } from './db';
import { newId, now } from './ids';
import { DEFAULT_PAGE_HEIGHT, DEFAULT_PAGE_WIDTH, type Page, type Stroke } from './models';

export async function listPages(documentId: string): Promise<Page[]> {
  const rows = await db.pages.where('documentId').equals(documentId).toArray();
  return rows.sort((a, b) => a.order - b.order);
}

export async function createPage(documentId: string, order: number): Promise<Page> {
  const t = now();
  const page: Page = {
    id: newId(),
    documentId,
    order,
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
    strokes: [],
    createdAt: t,
    updatedAt: t,
  };
  await db.pages.add(page);
  return page;
}

/** First page of a document; creates one if the document has none yet. */
export async function ensureFirstPage(documentId: string): Promise<Page> {
  return db.transaction('rw', db.pages, async () => {
    const pages = await listPages(documentId);
    return pages[0] ?? createPage(documentId, 0);
  });
}

export async function savePageStrokes(pageId: string, strokes: Stroke[]): Promise<void> {
  const t = now();
  await db.transaction('rw', db.pages, db.documents, async () => {
    const page = await db.pages.get(pageId);
    if (!page) return; // page was deleted while a save was pending
    await db.pages.update(pageId, { strokes, updatedAt: t });
    await db.documents.update(page.documentId, { updatedAt: t });
  });
}
