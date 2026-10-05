import { db } from './db';
import type { PageObject, SearchTextRow } from './models';

/** Plain text of a page's typed text boxes, in reading order (top to bottom). */
export function textOfObjects(objects: PageObject[]): string {
  return objects
    .filter((o): o is Extract<PageObject, { type: 'text' }> => o.type === 'text')
    .sort((a, b) => a.cy - a.h / 2 - (b.cy - b.h / 2) || a.cx - b.cx)
    .map((o) => o.text.trim())
    .filter(Boolean)
    .join('\n');
}

export const typedKey = (pageId: string) => `typed:${pageId}`;
export const pdfKey = (pageId: string) => `pdf:${pageId}`;

/** Keep the typed-text search row for a page in step with its objects (call inside a page save). */
export async function syncTypedText(
  pageId: string,
  documentId: string,
  objects: PageObject[],
): Promise<void> {
  const text = textOfObjects(objects);
  if (!text) await db.searchText.delete(typedKey(pageId));
  else
    await db.searchText.put({ key: typedKey(pageId), documentId, pageId, source: 'typed', text });
}

export async function setPdfText(pageId: string, documentId: string, text: string): Promise<void> {
  await db.searchText.put({ key: pdfKey(pageId), documentId, pageId, source: 'pdf', text });
}

export async function deleteSearchTextForPages(pageIds: string[]): Promise<void> {
  await db.searchText.bulkDelete(pageIds.flatMap((id) => [typedKey(id), pdfKey(id)]));
}

export async function deleteSearchTextForDocuments(documentIds: string[]): Promise<void> {
  await db.searchText.where('documentId').anyOf(documentIds).delete();
}

export function listSearchText(documentId: string): Promise<SearchTextRow[]> {
  return db.searchText.where('documentId').equals(documentId).toArray();
}

/** Rebuild every typed-text row from page content (used by "Rebuild search index" and after restore). */
export async function rebuildTypedText(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const stale = (await db.searchText.toArray())
    .filter((r) => r.source === 'typed')
    .map((r) => r.key);
  await db.searchText.bulkDelete(stale);
  const pages = await db.pages.toArray();
  let done = 0;
  for (const p of pages) {
    if (p.deletedAt === null) {
      const c = await db.pageContent.get(p.id);
      await syncTypedText(p.id, p.documentId, c?.objects ?? []);
    }
    onProgress?.(++done, pages.length);
    if (done % 50 === 0) await new Promise((r) => setTimeout(r));
  }
}
