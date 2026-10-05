import { cleanupOrphanAssets } from './assets';
import { db } from './db';
import { deleteSearchTextForDocuments } from './searchText';
import { copyDocumentRows } from './documents';
import { descendantFolderIds } from './folders';
import { newId, now } from './ids';
import { ROOT_ID, type Folder, type NotebookDocument } from './models';

/** Soft-delete a document. It stays recoverable until "Delete forever". */
export async function softDeleteDocument(id: string): Promise<void> {
  await db.documents.update(id, { deletedAt: now() });
}

/** Soft-delete a folder together with everything inside it (same timestamp). */
export async function softDeleteFolder(id: string): Promise<void> {
  const t = now();
  await db.transaction('rw', db.folders, db.documents, async () => {
    const ids = [id, ...(await descendantFolderIds(id))];
    for (const fid of ids) {
      const f = await db.folders.get(fid);
      if (f && f.deletedAt === null) await db.folders.update(fid, { deletedAt: t });
    }
    const docs = await db.documents.where('folderId').anyOf(ids).toArray();
    for (const d of docs)
      if (d.deletedAt === null) await db.documents.update(d.id, { deletedAt: t });
  });
}

async function parentIsLive(parentId: string): Promise<boolean> {
  if (parentId === ROOT_ID) return true;
  const p = await db.folders.get(parentId);
  return !!p && p.deletedAt === null;
}

/** Restore to the original folder, or to the top level if that folder is gone/trashed. */
export async function restoreDocument(id: string): Promise<void> {
  const d = await db.documents.get(id);
  if (!d) return;
  const folderId = (await parentIsLive(d.folderId)) ? d.folderId : ROOT_ID;
  await db.documents.update(id, { deletedAt: null, folderId, updatedAt: now() });
}

/** Restores the folder and the items that were deleted together with it. */
export async function restoreFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.documents, async () => {
    const f = await db.folders.get(id);
    if (!f || f.deletedAt === null) return;
    const batch = f.deletedAt;
    const parentId = (await parentIsLive(f.parentId)) ? f.parentId : ROOT_ID;
    await db.folders.update(id, { deletedAt: null, parentId, updatedAt: now() });
    const ids = await descendantFolderIds(id);
    for (const fid of ids) {
      const sub = await db.folders.get(fid);
      if (sub && sub.deletedAt === batch) await db.folders.update(fid, { deletedAt: null });
    }
    const docs = await db.documents
      .where('folderId')
      .anyOf([id, ...ids])
      .toArray();
    for (const d of docs)
      if (d.deletedAt === batch) await db.documents.update(d.id, { deletedAt: null });
  });
}

export interface TrashContents {
  folders: Folder[];
  documents: NotebookDocument[];
}

/** Top-level trashed items only: things whose parent folder is not itself in the trash. */
export async function listTrash(): Promise<TrashContents> {
  const allFolders = await db.folders.toArray();
  const trashed = new Set(allFolders.filter((f) => f.deletedAt !== null).map((f) => f.id));
  const folders = allFolders.filter((f) => f.deletedAt !== null && !trashed.has(f.parentId));
  const docs = (await db.documents.toArray()).filter(
    (d) => d.deletedAt !== null && !trashed.has(d.folderId),
  );
  return { folders, documents: docs };
}

/** Removes the document, its pages and its assets. Nothing else is touched. */
export async function permanentDeleteDocument(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.documents,
    db.pages,
    db.pageContent,
    db.assets,
    db.searchText,
    async () => {
      await deleteSearchTextForDocuments([id]);
      const pageIds = await db.pages.where('documentId').equals(id).primaryKeys();
      await db.pageContent.bulkDelete(pageIds);
      await db.pages.where('documentId').equals(id).delete();
      await db.assets.where('documentId').equals(id).delete();
      await db.documents.delete(id);
    },
  );
}

/** Removes the folder, all subfolders, and every document inside them (with pages/assets). */
export async function permanentDeleteFolder(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.folders, db.documents, db.pages, db.pageContent, db.assets, db.searchText],
    async () => {
      const ids = [id, ...(await descendantFolderIds(id))];
      const docIds = await db.documents.where('folderId').anyOf(ids).primaryKeys();
      await deleteSearchTextForDocuments(docIds);
      const pageIds = await db.pages.where('documentId').anyOf(docIds).primaryKeys();
      await db.pageContent.bulkDelete(pageIds);
      await db.pages.where('documentId').anyOf(docIds).delete();
      await db.assets.where('documentId').anyOf(docIds).delete();
      await db.documents.bulkDelete(docIds);
      await db.folders.bulkDelete(ids);
    },
  );
}

export async function emptyTrash(): Promise<void> {
  const { folders, documents } = await listTrash();
  for (const f of folders) await permanentDeleteFolder(f.id);
  for (const d of documents) await permanentDeleteDocument(d.id);
  await cleanupOrphanAssets(); // safe point: the user chose to empty the trash
}

/** Deep copy of a folder subtree (folders, documents, pages, assets). Returns the new root. */
export async function duplicateFolder(id: string): Promise<Folder> {
  return db.transaction(
    'rw',
    [db.folders, db.documents, db.pages, db.pageContent, db.assets, db.searchText],
    async () => {
      const src = await db.folders.get(id);
      if (!src) throw new Error('Folder not found');
      const t = now();
      const copyTree = async (folder: Folder, parentId: string, name: string): Promise<Folder> => {
        const copy: Folder = {
          ...folder,
          id: newId(),
          name,
          parentId,
          favorite: false,
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
        };
        await db.folders.add(copy);
        const docs = await db.documents.where('folderId').equals(folder.id).toArray();
        for (const d of docs) if (d.deletedAt === null) await copyDocumentRows(d, copy.id, d.title);
        const subs = await db.folders.where('parentId').equals(folder.id).toArray();
        for (const s of subs) if (s.deletedAt === null) await copyTree(s, copy.id, s.name);
        return copy;
      };
      return copyTree(src, src.parentId, `${src.name} copy`);
    },
  );
}
