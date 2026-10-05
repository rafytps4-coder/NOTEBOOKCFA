import { create } from 'zustand';
import { db, listPages, pdfKey, setPdfText } from '@/core';
import { openPdf } from '../pdf/pdfDocs';

interface PdfTextState {
  /** documentId -> progress while its text is being extracted */
  active: Record<string, { done: number; total: number }>;
}
export const usePdfTextStatus = create<PdfTextState>(() => ({ active: {} }));

const running = new Map<string, Promise<void>>();
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

type Item = { str?: string; hasEOL?: boolean };

/** Join pdf.js text items into plain text with sensible spacing. */
export function joinTextItems(items: Item[]): string {
  let out = '';
  for (const it of items) {
    if (it.str === undefined) continue;
    out += it.str;
    out += it.hasEOL ? '\n' : ' ';
  }
  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

/**
 * Extract searchable text for every PDF page of a document that doesn't have it yet. pdf.js reads
 * the pages in its own worker; we go one page at a time and yield to the UI in between, so large
 * imports never block interaction. Safe to call repeatedly: finished pages are skipped, so an
 * interrupted run resumes where it stopped.
 */
export function ensurePdfText(documentId: string): Promise<void> {
  const existing = running.get(documentId);
  if (existing) return existing;
  const job = (async () => {
    const pages = (await listPages(documentId)).filter((p) => p.pdf);
    const have = new Set(
      (await db.searchText.where('documentId').equals(documentId).primaryKeys()) as string[],
    );
    const todo = pages.filter((p) => !have.has(pdfKey(p.id)));
    if (!todo.length) return;
    const set = (done: number) =>
      usePdfTextStatus.setState((s) => ({
        active: { ...s.active, [documentId]: { done, total: todo.length } },
      }));
    set(0);
    let done = 0;
    for (const p of todo) {
      let text = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const pdf = await openPdf(documentId);
          const page = await pdf.getPage(p.pdf!.index + 1);
          text = joinTextItems((await page.getTextContent()).items as Item[]);
          page.cleanup();
          break;
        } catch (e) {
          if (attempt === 1) console.warn('PDF text extraction failed for a page', e);
        }
      }
      await setPdfText(p.id, documentId, text); // '' = looked, found nothing (e.g. a scan)
      set(++done);
      await yieldToUi();
    }
  })()
    .catch((e) => console.error('PDF text extraction failed', e))
    .finally(() => {
      running.delete(documentId);
      usePdfTextStatus.setState((s) => {
        const { [documentId]: _gone, ...rest } = s.active;
        void _gone;
        return { active: rest };
      });
    });
  running.set(documentId, job);
  return job;
}

/** Catch up on every PDF document that still lacks text (after an interrupted import, restore, …). */
export async function ensureAllPdfText(): Promise<void> {
  const docs = (await db.documents.toArray()).filter(
    (d) => d.kind === 'pdf' && d.deletedAt === null,
  );
  for (const d of docs) await ensurePdfText(d.id);
}

/** Forget extracted PDF text and extract it again (used by "Rebuild search index"). */
export async function reextractAllPdfText(): Promise<void> {
  const rows = (await db.searchText.toArray()).filter((r) => r.source === 'pdf').map((r) => r.key);
  await db.searchText.bulkDelete(rows);
  await ensureAllPdfText();
}
