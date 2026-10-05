import {
  duplicateDocument,
  duplicateFolder,
  moveDocument,
  moveFolder,
  permanentDeleteDocument,
  permanentDeleteFolder,
  renameDocument,
  renameFolder,
  restoreDocument,
  restoreFolder,
  setDocumentFavorite,
  setFolderFavorite,
  softDeleteDocument,
  softDeleteFolder,
  type Folder,
  type NotebookDocument,
} from '@/core';

export type LibItem =
  { type: 'folder'; folder: Folder } | { type: 'document'; doc: NotebookDocument };

export const itemId = (i: LibItem) => (i.type === 'folder' ? i.folder.id : i.doc.id);
export const itemName = (i: LibItem) => (i.type === 'folder' ? i.folder.name : i.doc.title);
export const itemFavorite = (i: LibItem) =>
  i.type === 'folder' ? i.folder.favorite : i.doc.favorite;
export const itemParent = (i: LibItem) =>
  i.type === 'folder' ? i.folder.parentId : i.doc.folderId;
export const itemUpdated = (i: LibItem) =>
  i.type === 'folder' ? i.folder.updatedAt : i.doc.updatedAt;

export const rename = (i: LibItem, name: string) =>
  i.type === 'folder' ? renameFolder(i.folder.id, name) : renameDocument(i.doc.id, name);
export const duplicate = async (i: LibItem) => {
  if (i.type === 'folder') await duplicateFolder(i.folder.id);
  else await duplicateDocument(i.doc.id);
};
export const move = (i: LibItem, to: string) =>
  i.type === 'folder' ? moveFolder(i.folder.id, to) : moveDocument(i.doc.id, to);
export const toggleFavorite = (i: LibItem) =>
  i.type === 'folder'
    ? setFolderFavorite(i.folder.id, !i.folder.favorite)
    : setDocumentFavorite(i.doc.id, !i.doc.favorite);
export const trash = (i: LibItem) =>
  i.type === 'folder' ? softDeleteFolder(i.folder.id) : softDeleteDocument(i.doc.id);
export const restore = (i: LibItem) =>
  i.type === 'folder' ? restoreFolder(i.folder.id) : restoreDocument(i.doc.id);
export const deleteForever = (i: LibItem) =>
  i.type === 'folder' ? permanentDeleteFolder(i.folder.id) : permanentDeleteDocument(i.doc.id);
