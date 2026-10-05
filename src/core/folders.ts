import { db } from './db';
import { newId, now } from './ids';
import { ROOT_ID, type Folder } from './models';
import { sortItems, type SortOptions } from './sort';

export async function getFolder(id: string): Promise<Folder | undefined> {
  return db.folders.get(id);
}

async function assertLiveParent(parentId: string): Promise<void> {
  if (parentId === ROOT_ID) return;
  const parent = await db.folders.get(parentId);
  if (!parent || parent.deletedAt !== null) throw new Error('Destination folder does not exist');
}

export async function createFolder(name: string, parentId: string = ROOT_ID): Promise<Folder> {
  await assertLiveParent(parentId);
  const t = now();
  const folder: Folder = {
    id: newId(),
    name: name.trim() || 'Untitled folder',
    parentId,
    favorite: false,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Name cannot be empty');
  await db.folders.update(id, { name: clean, updatedAt: now() });
}

export async function setFolderFavorite(id: string, favorite: boolean): Promise<void> {
  await db.folders.update(id, { favorite });
}

/** Ids of every folder below `id` (any depth), deleted or not. Excludes `id` itself. */
export async function descendantFolderIds(id: string): Promise<string[]> {
  const out: string[] = [];
  let level = [id];
  while (level.length) {
    const children = await db.folders.where('parentId').anyOf(level).primaryKeys();
    out.push(...children);
    level = children;
  }
  return out;
}

export async function moveFolder(id: string, parentId: string): Promise<void> {
  if (id === parentId) throw new Error('Cannot move a folder into itself');
  if ((await descendantFolderIds(id)).includes(parentId)) {
    throw new Error('Cannot move a folder into one of its own subfolders');
  }
  await assertLiveParent(parentId);
  await db.folders.update(id, { parentId, updatedAt: now() });
}

export async function listSubfolders(parentId: string, sort: SortOptions): Promise<Folder[]> {
  const rows = await db.folders.where('parentId').equals(parentId).toArray();
  return sortItems(
    rows.filter((f) => f.deletedAt === null),
    (f) => f,
    sort,
  );
}

export async function listAllFolders(): Promise<Folder[]> {
  const rows = await db.folders.toArray();
  return rows.filter((f) => f.deletedAt === null);
}

/** Folders from the top level down to and including `id`. Empty for the root. */
export async function getFolderPath(id: string): Promise<Folder[]> {
  const path: Folder[] = [];
  let cur = id;
  const seen = new Set<string>();
  while (cur !== ROOT_ID && !seen.has(cur)) {
    seen.add(cur);
    const f = await db.folders.get(cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parentId;
  }
  return path;
}

export async function listFavoriteFolders(sort: SortOptions): Promise<Folder[]> {
  const rows = await db.folders.toArray();
  return sortItems(
    rows.filter((f) => f.favorite && f.deletedAt === null),
    (f) => f,
    sort,
  );
}
