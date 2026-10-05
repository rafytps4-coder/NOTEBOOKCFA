import { db } from './db';
import { newId, now } from './ids';
import { ROOT_ID, type DocumentKind, type NotebookDocument, type PageObject } from './models';
import { sortItems, type SortOptions } from './sort';

export async function getDocument(id: string): Promise<NotebookDocument | undefined> {
  return db.documents.get(id);
}

async function assertLiveFolder(folderId: string): Promise<void> {
  if (folderId === ROOT_ID) return;
  const f = await db.folders.get(folderId);
  if (!f || f.deletedAt !== null) throw new Error('Destination folder does not exist');
}

export interface NewDocument {
  kind: DocumentKind;
  title: string;
  folderId?: string;
}

export async function createDocument(input: NewDocument): Promise<NotebookDocument> {
  const folderId = input.folderId ?? ROOT_ID;
  await assertLiveFolder(folderId);
  const t = now();
  const doc: NotebookDocument = {
    id: newId(),
    kind: input.kind,
    title: input.title.trim() || 'Untitled',
    folderId,
    favorite: false,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: null,
    deletedAt: null,
  };
  await db.documents.add(doc);
  return doc;
}

export function quickNoteTitle(d = new Date()): string {
  return `Quick note ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function createQuickNote(folderId: string = ROOT_ID): Promise<NotebookDocument> {
  return createDocument({ kind: 'quickNote', title: quickNoteTitle(), folderId });
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const clean = title.trim();
  if (!clean) throw new Error('Name cannot be empty');
  await db.documents.update(id, { title: clean, updatedAt: now() });
}

export async function setDocumentFavorite(id: string, favorite: boolean): Promise<void> {
  await db.documents.update(id, { favorite });
}

export async function moveDocument(id: string, folderId: string): Promise<void> {
  await assertLiveFolder(folderId);
  await db.documents.update(id, { folderId, updatedAt: now() });
}

export async function markOpened(id: string): Promise<void> {
  await db.documents.update(id, { lastOpenedAt: now() });
}

/**
 * Copy a document row plus its pages and assets into `folderId`.
 * Must be called inside a transaction that includes documents, pages and assets.
 */
export async function copyDocumentRows(
  src: NotebookDocument,
  folderId: string,
  title: string,
): Promise<NotebookDocument> {
  const t = now();
  const copy: NotebookDocument = {
    ...src,
    id: newId(),
    title,
    folderId,
    favorite: false,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: null,
    deletedAt: null,
  };
  await db.documents.add(copy);
  const pages = (await db.pages.where('documentId').equals(src.id).toArray()).filter(
    (p) => p.deletedAt === null,
  );
  const idMap = new Map(pages.map((p) => [p.id, newId()]));
  await db.pages.bulkAdd(pages.map((p) => ({ ...p, id: idMap.get(p.id)!, documentId: copy.id })));
  // Image assets get new ids in the copy, so rewrite the page objects that point at them.
  const srcAssets = (await db.assets.where('documentId').equals(src.id).toArray()).filter(
    (a) => a.name !== 'page-thumbnail', // page thumbnails are keyed by page id; regenerated lazily
  );
  const assetMap = new Map(srcAssets.map((a) => [a.id, newId()]));
  const remap = (objects: PageObject[] | undefined): PageObject[] =>
    (objects ?? []).map((o) =>
      o.type === 'image' ? { ...o, assetId: assetMap.get(o.assetId) ?? o.assetId } : o,
    );
  const contents = await db.pageContent.bulkGet(pages.map((p) => p.id));
  await db.pageContent.bulkAdd(
    contents.flatMap((c) =>
      c ? [{ ...c, pageId: idMap.get(c.pageId)!, objects: remap(c.objects) }] : [],
    ),
  );
  await db.assets.bulkAdd(
    srcAssets.map((a) => ({ ...a, id: assetMap.get(a.id)!, documentId: copy.id })),
  );
  return copy;
}

export async function duplicateDocument(id: string): Promise<NotebookDocument> {
  return db.transaction('rw', db.documents, db.pages, db.pageContent, db.assets, async () => {
    const src = await db.documents.get(id);
    if (!src) throw new Error('Document not found');
    return copyDocumentRows(src, src.folderId, `${src.title} copy`);
  });
}

export async function listDocuments(
  folderId: string,
  sort: SortOptions,
): Promise<NotebookDocument[]> {
  const rows = await db.documents.where('folderId').equals(folderId).toArray();
  return sortItems(
    rows.filter((d) => d.deletedAt === null),
    (d) => ({ name: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt }),
    sort,
  );
}

export async function listFavoriteDocuments(sort: SortOptions): Promise<NotebookDocument[]> {
  const rows = await db.documents.toArray();
  return sortItems(
    rows.filter((d) => d.favorite && d.deletedAt === null),
    (d) => ({ name: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt }),
    sort,
  );
}

/** Most recently opened first. Rows never opened aren't in the index. */
export async function listRecent(limit = 50): Promise<NotebookDocument[]> {
  const rows = await db.documents.orderBy('lastOpenedAt').reverse().toArray();
  return rows.filter((d) => d.deletedAt === null).slice(0, limit);
}
