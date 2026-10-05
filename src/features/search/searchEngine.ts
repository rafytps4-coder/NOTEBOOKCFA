import type { NotebookDB } from '@/core/db';
import type { Folder, NotebookDocument, Page, SearchTextRow } from '@/core/models';
import { SearchIndex, type IndexItem, type SearchHit } from './searchIndex';

export interface EngineProgress {
  done: number;
  total: number;
}

const docItem = (d: NotebookDocument): IndexItem => ({
  id: `doc:${d.id}`,
  kind: 'document',
  documentId: d.id,
  folderId: d.folderId,
  pageId: null,
  pageNumber: null,
  title: d.title,
  text: '',
  deleted: d.deletedAt !== null,
});

const folderItem = (f: Folder): IndexItem => ({
  id: `folder:${f.id}`,
  kind: 'folder',
  documentId: null,
  folderId: f.id,
  pageId: null,
  pageNumber: null,
  title: f.name,
  text: '',
  deleted: f.deletedAt !== null,
});

/**
 * Reads source data from IndexedDB and keeps a SearchIndex in step with it. Runs inside a Web
 * Worker in the app (so indexing never blocks the UI) and directly in tests. It only ever reads
 * the database: the index is a cache and can be thrown away and rebuilt at any time.
 */
export class SearchEngine {
  readonly index = new SearchIndex();
  /** documentId -> deleted? (page items inherit their document's state) */
  private docs = new Map<string, NotebookDocument>();
  private folderDeleted = new Map<string, boolean>();

  constructor(private db: NotebookDB) {}

  private pageDeleted(docId: string): boolean {
    const d = this.docs.get(docId);
    if (!d) return true;
    if (d.deletedAt !== null) return true;
    // A document inside a trashed folder is hidden too.
    return this.folderDeleted.get(d.folderId) === true;
  }

  private async pageItems(documentId: string, pages: Page[]): Promise<IndexItem[]> {
    const live = new Map(pages.filter((p) => p.deletedAt === null).map((p) => [p.id, p]));
    const rows = await this.db.searchText.where('documentId').equals(documentId).toArray();
    const deleted = this.pageDeleted(documentId);
    const doc = this.docs.get(documentId);
    return rows.flatMap((r: SearchTextRow) => {
      const page = live.get(r.pageId);
      if (!page || !r.text) return [];
      return [
        {
          id: `pg:${r.key}`,
          kind: 'page' as const,
          documentId,
          folderId: doc?.folderId ?? null,
          pageId: r.pageId,
          pageNumber: page.order + 1,
          title: doc?.title ?? '',
          text: r.text,
          deleted,
        },
      ];
    });
  }

  /** (Re)index one document: its title and the searchable text of its pages. */
  async syncDocument(id: string): Promise<void> {
    const doc = await this.db.documents.get(id);
    this.index.removeDocument(id);
    if (!doc) {
      this.docs.delete(id);
      return;
    }
    this.docs.set(id, doc);
    this.index.upsert(docItem(doc));
    const pages = await this.db.pages.where('documentId').equals(id).toArray();
    for (const item of await this.pageItems(id, pages)) this.index.upsert(item);
  }

  async syncFolder(id: string): Promise<void> {
    const f = await this.db.folders.get(id);
    if (!f) {
      this.index.remove(`folder:${id}`);
      this.folderDeleted.delete(id);
      return;
    }
    this.folderDeleted.set(id, f.deletedAt !== null);
    this.index.upsert(folderItem(f));
    // Documents in this folder may have become hidden/visible.
    const docs = await this.db.documents.where('folderId').equals(id).primaryKeys();
    for (const d of docs) await this.syncDocument(d);
  }

  /** Rebuild the whole index from the database, reporting progress. */
  async rebuild(onProgress?: (p: EngineProgress) => void): Promise<void> {
    this.index.clear();
    this.docs.clear();
    this.folderDeleted.clear();
    const folders = await this.db.folders.toArray();
    const docs = await this.db.documents.toArray();
    for (const f of folders) {
      this.folderDeleted.set(f.id, f.deletedAt !== null);
      this.index.upsert(folderItem(f));
    }
    for (const d of docs) this.docs.set(d.id, d);
    let done = 0;
    const total = docs.length;
    for (const d of docs) {
      this.index.upsert(docItem(d));
      const pages = await this.db.pages.where('documentId').equals(d.id).toArray();
      for (const item of await this.pageItems(d.id, pages)) this.index.upsert(item);
      onProgress?.({ done: ++done, total });
      if (done % 20 === 0) await new Promise((r) => setTimeout(r));
    }
    onProgress?.({ done: total, total });
  }

  search(query: string, limit?: number): SearchHit[] {
    return this.index.search(query, limit);
  }
}
