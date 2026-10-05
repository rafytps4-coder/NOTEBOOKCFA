import { getPdfAsset } from '@/core';
import { getPdfjs, type PdfDoc } from './pdfjs';

/** Open PDF documents by notebook-document id. A document is loaded once and reused. */
const open = new Map<string, Promise<PdfDoc>>();

export function openPdf(documentId: string): Promise<PdfDoc> {
  let p = open.get(documentId);
  if (!p) {
    p = (async () => {
      const asset = await getPdfAsset(documentId);
      if (!asset) throw new Error('This document has no PDF file.');
      const pdfjs = await getPdfjs();
      const data = new Uint8Array(await asset.blob.arrayBuffer());
      return pdfjs.getDocument({ data }).promise;
    })();
    open.set(documentId, p);
    p.catch(() => open.delete(documentId));
  }
  return p;
}

/** Release a document's parsed data (called when the editor closes). */
export async function closePdf(documentId: string): Promise<void> {
  const p = open.get(documentId);
  open.delete(documentId);
  if (p) await p.then((d) => d.loadingTask.destroy()).catch(() => undefined);
}

export interface OutlineItem {
  title: string;
  /** 0-based page index in the original PDF, if it could be resolved. */
  pageIndex: number | null;
  items: OutlineItem[];
}

type RawOutline = { title: string; dest: string | unknown[] | null; items: RawOutline[] };

/** The PDF's table of contents with destinations resolved to page indexes. */
export async function loadOutline(documentId: string): Promise<OutlineItem[]> {
  const pdf = await openPdf(documentId);
  const raw = (await pdf.getOutline()) as RawOutline[] | null;
  if (!raw) return [];
  const resolve = async (dest: RawOutline['dest']): Promise<number | null> => {
    try {
      const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      const ref = d?.[0];
      if (ref && typeof ref === 'object') return await pdf.getPageIndex(ref as never);
      if (typeof ref === 'number') return ref;
    } catch {
      /* unresolved destination */
    }
    return null;
  };
  const walk = async (items: RawOutline[]): Promise<OutlineItem[]> =>
    Promise.all(
      items.map(async (i) => ({
        title: i.title || '(untitled)',
        pageIndex: await resolve(i.dest),
        items: await walk(i.items ?? []),
      })),
    );
  return walk(raw);
}
