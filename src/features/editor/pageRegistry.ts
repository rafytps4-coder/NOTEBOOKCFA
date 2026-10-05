import { getPageContent, type PageInk } from '@/core';
import type { CanvasController } from './CanvasController';
import { useEditorStore } from './editorStore';
import type { PageSaver, SaveState } from './PageSaver';

/**
 * Latest in-memory ink per page. Pages are unmounted when scrolled far away; the saver flushes
 * asynchronously, so a quick remount must not read stale data from the database.
 */
const inkCache = new Map<string, PageInk>();

export function cacheInk(pageId: string, content: PageInk): void {
  inkCache.set(pageId, content);
}

export async function loadInk(pageId: string): Promise<PageInk> {
  const c = await getPageContent(pageId);
  return inkCache.get(pageId) ?? { strokes: c.strokes, objects: c.objects };
}

export function clearInkCache(): void {
  inkCache.clear();
}

/** Controllers of currently mounted pages. Toolbar actions target the active one. */
const controllers = new Map<string, CanvasController>();

export function registerController(pageId: string, c: CanvasController): void {
  controllers.set(pageId, c);
}

export function unregisterController(pageId: string): void {
  controllers.delete(pageId);
  const s = useEditorStore.getState();
  if (s.activePageId === pageId) {
    s.patch({ activePageId: null, canUndo: false, canRedo: false, hasSelection: false });
  }
}

export function activeController(): CanvasController | undefined {
  const id = useEditorStore.getState().activePageId;
  return id ? controllers.get(id) : undefined;
}

export function activate(pageId: string): void {
  const c = controllers.get(pageId);
  if (!c) return;
  useEditorStore.getState().patch({ activePageId: pageId, ...c.uiState() });
}

export function hasActive(): boolean {
  const id = useEditorStore.getState().activePageId;
  return id !== null && controllers.has(id);
}

/** Savers of mounted pages, so operations that read ink from the database can flush first. */
const savers = new Map<string, PageSaver>();

export function registerSaver(pageId: string, s: PageSaver | null): void {
  if (s) savers.set(pageId, s);
  else savers.delete(pageId);
}

/** Write any pending ink for the page to the database now. */
export async function flushPage(pageId: string): Promise<void> {
  await savers.get(pageId)?.flush();
}

/** Write pending ink for every mounted page (before export, duplicate-document, etc.). */
export async function flushAllPages(): Promise<void> {
  await Promise.all([...savers.values()].map((s) => s.flush()));
}

/** Aggregate autosave state across all mounted pages for the toolbar indicator. */
const saveStates = new Map<string, SaveState>();

export function reportSave(pageId: string, state: SaveState | null): void {
  if (state === null) saveStates.delete(pageId);
  else saveStates.set(pageId, state);
  const all = [...saveStates.values()];
  const agg: SaveState = all.includes('error')
    ? 'error'
    : all.includes('saving')
      ? 'saving'
      : all.includes('unsaved')
        ? 'unsaved'
        : 'saved';
  useEditorStore.getState().patch({ saveState: agg });
}
