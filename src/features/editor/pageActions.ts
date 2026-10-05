import {
  duplicatePage,
  insertPage,
  listPages,
  movePage,
  restorePage,
  softDeletePage,
  styleOf,
  updatePage,
  type Page,
  type PageStyle,
} from '@/core';
import type { PageHistory } from './pageHistory';
import { flushPage } from './pageRegistry';

type StylePatch = Partial<Pick<Page, 'template' | 'background' | 'width' | 'height' | 'sizeName'>>;

/** Page-structure commands for one document. Each registers itself for undo. */
export class PageActions {
  constructor(
    private docId: string,
    private history: PageHistory,
    private defaults: () => PageStyle,
  ) {}

  /** New pages inherit the style of the page before them (or after, when inserting first). */
  private inherit(pages: Page[], index: number): PageStyle {
    const ref = pages[index - 1] ?? pages[index];
    return ref ? styleOf(ref) : this.defaults();
  }

  async insertAt(index: number): Promise<Page> {
    const pages = await listPages(this.docId);
    const page = await insertPage(this.docId, index, this.inherit(pages, index));
    this.history.push({
      label: 'add page',
      undo: () => softDeletePage(page.id),
      redo: () => restorePage(page.id, index),
    });
    return page;
  }

  addAfter(index: number) {
    return this.insertAt(index + 1);
  }

  async duplicate(pageId: string): Promise<Page> {
    await flushPage(pageId); // the copy reads ink from the database, so save pending ink first
    const pages = await listPages(this.docId);
    const idx = pages.findIndex((p) => p.id === pageId);
    const copy = await duplicatePage(pageId);
    this.history.push({
      label: 'duplicate page',
      undo: () => softDeletePage(copy.id),
      redo: () => restorePage(copy.id, idx + 1),
    });
    return copy;
  }

  /** Returns false if it is the last page (a notebook always keeps one). */
  async remove(pageId: string): Promise<boolean> {
    const pages = await listPages(this.docId);
    if (pages.length <= 1) return false;
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return false;
    await softDeletePage(pageId);
    this.history.push({
      label: 'delete page',
      undo: () => restorePage(pageId, idx),
      redo: () => softDeletePage(pageId),
    });
    return true;
  }

  async move(pageId: string, toIndex: number): Promise<void> {
    const pages = await listPages(this.docId);
    const from = pages.findIndex((p) => p.id === pageId);
    if (from < 0 || from === toIndex) return;
    await movePage(pageId, toIndex);
    this.history.push({
      label: 'move page',
      undo: () => movePage(pageId, from),
      redo: () => movePage(pageId, toIndex),
    });
  }

  async setStyle(pageIds: string[], patch: StylePatch): Promise<void> {
    const pages = (await listPages(this.docId)).filter((p) => pageIds.includes(p.id));
    const before = pages.map((p) => ({
      id: p.id,
      patch: Object.fromEntries(
        Object.keys(patch).map((k) => [k, p[k as keyof Page]]),
      ) as StylePatch,
    }));
    for (const p of pages) await updatePage(p.id, patch);
    this.history.push({
      label: 'change page style',
      undo: async () => {
        for (const b of before) await updatePage(b.id, b.patch);
      },
      redo: async () => {
        for (const p of pages) await updatePage(p.id, patch);
      },
    });
  }

  async toggleBookmark(page: Page): Promise<void> {
    const next = !page.bookmarked;
    await updatePage(page.id, { bookmarked: next });
    this.history.push({
      label: 'bookmark',
      undo: () => updatePage(page.id, { bookmarked: !next }),
      redo: () => updatePage(page.id, { bookmarked: next }),
    });
  }
}
