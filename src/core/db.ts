import Dexie, { type Table } from 'dexie';
import type { Asset, Folder, NotebookDocument, Page, PageContent, SettingRow } from './models';

export class NotebookDB extends Dexie {
  folders!: Table<Folder, string>;
  documents!: Table<NotebookDocument, string>;
  pages!: Table<Page, string>;
  pageContent!: Table<PageContent, string>;
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
    // v2: ink moves out of `pages` into `pageContent`; pages gain template/size/bookmark fields.
    // The upgrade copies every page's strokes across before removing them from the page row.
    this.version(2)
      .stores({ pageContent: 'pageId' })
      .upgrade(async (tx) => {
        const pages = tx.table('pages');
        const content = tx.table('pageContent');
        await pages.toCollection().modify((p: Record<string, unknown>) => {
          void content.put({ pageId: p.id, strokes: (p.strokes as unknown[] | undefined) ?? [] });
          delete p.strokes;
          p.sizeName ??= 'A4';
          p.template ??= { kind: 'blank', spacing: 28, color: '#c5cfdc' };
          p.background ??= '#ffffff';
          p.bookmarked ??= false;
          p.deletedAt ??= null;
        });
      });
  }
}

export const db = new NotebookDB();
