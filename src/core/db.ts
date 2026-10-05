import Dexie, { type Table } from 'dexie';
import type { Asset, Folder, NotebookDocument, Page, SettingRow } from './models';

export class NotebookDB extends Dexie {
  folders!: Table<Folder, string>;
  documents!: Table<NotebookDocument, string>;
  pages!: Table<Page, string>;
  assets!: Table<Asset, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'notebook') {
    super(name);
    // Never edit a released version: add a new `version(n)` with an upgrade
    // function so existing user data is migrated, not dropped.
    this.version(1).stores({
      folders: 'id, parentId, favorite, createdAt, updatedAt',
      documents: 'id, folderId, kind, favorite, createdAt, updatedAt, lastOpenedAt',
      pages: 'id, documentId, [documentId+order]',
      assets: 'id, documentId',
      settings: 'key',
    });
  }
}

export const db = new NotebookDB();
