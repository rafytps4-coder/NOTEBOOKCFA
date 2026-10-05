import { db } from './db';
import { newId, now } from './ids';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_TEMPLATE,
  type Page,
  type PageContent,
  type PageObject,
  type PageSizeName,
  type PageTemplate,
  type Stroke,
} from './models';

/** A4 at 96 dpi. */
export const A4 = { width: 794, height: 1123 };

/** Visual/size properties a new page can inherit. */
export interface PageStyle {
  width: number;
  height: number;
  sizeName: PageSizeName;
  template: PageTemplate;
  background: string;
}

export const DEFAULT_STYLE: PageStyle = {
  ...A4,
  sizeName: 'A4',
  template: DEFAULT_TEMPLATE,
  background: DEFAULT_BACKGROUND,
};

export const styleOf = (p: Page): PageStyle => ({
  width: p.width,
  height: p.height,
  sizeName: p.sizeName,
  template: p.template,
  background: p.background,
});

/** Live (not soft-deleted) pages of a document in order. Metadata only: no strokes. */
export async function listPages(documentId: string): Promise<Page[]> {
  const rows = await db.pages.where('documentId').equals(documentId).toArray();
  return rows.filter((p) => p.deletedAt === null).sort((a, b) => a.order - b.order);
}

function makePage(documentId: string, order: number, style: PageStyle): Page {
  const t = now();
  return {
    id: newId(),
    documentId,
    order,
    ...style,
    bookmarked: false,
    deletedAt: null,
    createdAt: t,
    updatedAt: t,
  };
}

/** Make live pages' `order` equal their position, writing only rows that changed. */
async function renumber(documentId: string): Promise<void> {
  await applyOrder(await listPages(documentId));
}

/** Set `order` to the array position for rows that differ, in one bulk write. */
async function applyOrder(pages: Page[]): Promise<void> {
  const changes = pages.flatMap((p, i) =>
    p.order !== i ? [{ key: p.id, changes: { order: i } }] : [],
  );
  if (changes.length) await db.pages.bulkUpdate(changes);
}

/** Shift pages from `fromIndex` down by one to open a gap. */
async function openGap(pages: Page[], fromIndex: number): Promise<void> {
  const changes = pages
    .slice(fromIndex)
    .map((p) => ({ key: p.id, changes: { order: p.order + 1 } }));
  if (changes.length) await db.pages.bulkUpdate(changes);
}

export async function createPage(
  documentId: string,
  order: number,
  style: PageStyle = DEFAULT_STYLE,
): Promise<Page> {
  const page = makePage(documentId, order, style);
  await db.transaction('rw', db.pages, db.pageContent, async () => {
    await db.pages.add(page);
    await db.pageContent.put({ pageId: page.id, strokes: [] });
  });
  return page;
}

/** First page of a document; creates one if the document has none yet. */
export async function ensureFirstPage(documentId: string): Promise<Page> {
  return db.transaction('rw', db.pages, db.pageContent, async () => {
    const pages = await listPages(documentId);
    return pages[0] ?? createPage(documentId, 0);
  });
}

/** Insert a new empty page at `index` (0 = first), shifting later pages down. */
export async function insertPage(
  documentId: string,
  index: number,
  style: PageStyle = DEFAULT_STYLE,
): Promise<Page> {
  return db.transaction('rw', db.pages, db.pageContent, async () => {
    const pages = await listPages(documentId);
    const at = Math.max(0, Math.min(index, pages.length));
    await openGap(pages, at);
    return createPage(documentId, at, style);
  });
}

export async function duplicatePage(pageId: string): Promise<Page> {
  return db.transaction('rw', db.pages, db.pageContent, async () => {
    const src = await db.pages.get(pageId);
    if (!src) throw new Error('Page not found');
    const content = await db.pageContent.get(pageId);
    const copy = await insertPage(src.documentId, src.order + 1, styleOf(src));
    await db.pages.update(copy.id, {
      bookmarked: src.bookmarked,
      ...(src.pdf ? { pdf: src.pdf } : {}),
    });
    await db.pageContent.put({
      pageId: copy.id,
      strokes: content?.strokes ?? [],
      objects: content?.objects ?? [],
    });
    return copy;
  });
}

/** Hide a page (recoverable). Later pages move up. */
export async function softDeletePage(pageId: string): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const p = await db.pages.get(pageId);
    if (!p) return;
    await db.pages.update(pageId, { deletedAt: now() });
    await renumber(p.documentId);
  });
}

/** Bring a hidden page back at `index`. */
export async function restorePage(pageId: string, index: number): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const p = await db.pages.get(pageId);
    if (!p) return;
    const pages = await listPages(p.documentId);
    const at = Math.max(0, Math.min(index, pages.length));
    await openGap(pages, at);
    await db.pages.update(pageId, { deletedAt: null, order: at });
  });
}

/** Move a page to `toIndex` (its position after the move). */
export async function movePage(pageId: string, toIndex: number): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const p = await db.pages.get(pageId);
    if (!p) return;
    const pages = await listPages(p.documentId);
    const from = pages.findIndex((x) => x.id === pageId);
    if (from < 0) return;
    const [moved] = pages.splice(from, 1);
    pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, moved!);
    await applyOrder(pages);
  });
}

export async function updatePage(
  pageId: string,
  patch: Partial<
    Pick<Page, 'template' | 'background' | 'bookmarked' | 'width' | 'height' | 'sizeName'>
  >,
): Promise<void> {
  await db.pages.update(pageId, { ...patch, updatedAt: now() });
}

/** Permanently remove soft-deleted pages (and their ink). Run when a document is opened/closed. */
export async function purgeDeletedPages(documentId: string): Promise<number> {
  return db.transaction('rw', db.pages, db.pageContent, db.assets, async () => {
    const rows = await db.pages.where('documentId').equals(documentId).toArray();
    const dead = rows.filter((p) => p.deletedAt !== null).map((p) => p.id);
    if (!dead.length) return 0;
    await db.pageContent.bulkDelete(dead);
    await db.pages.bulkDelete(dead);
    await db.assets.bulkDelete(dead.map(pageThumbId));
    return dead.length;
  });
}

export const pageThumbId = (pageId: string) => `pagethumb:${pageId}`;

export async function getPageContent(pageId: string): Promise<Required<PageContent>> {
  const c = await db.pageContent.get(pageId);
  return { pageId, strokes: c?.strokes ?? [], objects: c?.objects ?? [] };
}

export interface PageInk {
  strokes: Stroke[];
  objects: PageObject[];
}

export async function savePageContent(pageId: string, content: PageInk): Promise<void> {
  const t = now();
  await db.transaction('rw', db.pages, db.pageContent, db.documents, async () => {
    const page = await db.pages.get(pageId);
    if (!page) return; // page was purged while a save was pending
    await db.pageContent.put({ pageId, strokes: content.strokes, objects: content.objects });
    await db.pages.update(pageId, { updatedAt: t });
    await db.documents.update(page.documentId, { updatedAt: t });
  });
}

/** Ink-only convenience used by older call sites and tests; keeps existing objects. */
export async function savePageStrokes(pageId: string, strokes: Stroke[]): Promise<void> {
  const existing = await getPageContent(pageId);
  await savePageContent(pageId, { strokes, objects: existing.objects });
}
