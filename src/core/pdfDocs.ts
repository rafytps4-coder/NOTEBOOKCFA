import { db } from './db';
import { newId, now } from './ids';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_TEMPLATE,
  ROOT_ID,
  type Asset,
  type NotebookDocument,
  type Page,
} from './models';

export interface PdfPageDims {
  /** Page size in PDF points (1/72 in) as displayed, i.e. with /Rotate applied. */
  width: number;
  height: number;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a `pdf` document: the original file is stored untouched as an asset, and every PDF page
 * becomes a page whose background is rendered from that file. One transaction: all or nothing.
 */
export async function createPdfDocument(input: {
  title: string;
  folderId?: string;
  blob: Blob;
  pages: PdfPageDims[];
}): Promise<NotebookDocument> {
  const t = now();
  const doc: NotebookDocument = {
    id: newId(),
    kind: 'pdf',
    title: input.title.trim() || 'Untitled PDF',
    folderId: input.folderId ?? ROOT_ID,
    favorite: false,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: null,
    deletedAt: null,
  };
  const asset: Asset = {
    id: newId(),
    documentId: doc.id,
    kind: 'pdf',
    mime: 'application/pdf',
    name: `${doc.title}.pdf`,
    size: input.blob.size,
    sha256: await sha256Hex(input.blob),
    blob: input.blob,
    createdAt: t,
  };
  const pages: Page[] = input.pages.map((d, i) => ({
    id: newId(),
    documentId: doc.id,
    order: i,
    width: Math.round(d.width * 100) / 100,
    height: Math.round(d.height * 100) / 100,
    sizeName: 'custom',
    template: DEFAULT_TEMPLATE,
    background: DEFAULT_BACKGROUND,
    bookmarked: false,
    pdf: { index: i },
    deletedAt: null,
    createdAt: t,
    updatedAt: t,
  }));
  await db.transaction('rw', db.documents, db.assets, db.pages, db.pageContent, async () => {
    await db.documents.add(doc);
    await db.assets.add(asset);
    await db.pages.bulkAdd(pages);
    await db.pageContent.bulkAdd(pages.map((p) => ({ pageId: p.id, strokes: [], objects: [] })));
  });
  return doc;
}

/** The original PDF asset of a document, if it has one. */
export async function getPdfAsset(documentId: string): Promise<Asset | undefined> {
  const rows = await db.assets.where('documentId').equals(documentId).toArray();
  return rows.find((a) => a.kind === 'pdf');
}
