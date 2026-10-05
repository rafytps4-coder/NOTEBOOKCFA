import { createPdfDocument, ROOT_ID, type NotebookDocument, type PdfPageDims } from '@/core';
import { explainPdfError, getPdfjs } from './pdfjs';

/** An error whose message is safe to show to the user as-is. */
export class ImportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ImportError';
  }
}

export interface ImportProgress {
  done: number;
  total: number;
}

/** True for files that are (probably) PDFs, judged by type or extension. */
export function looksLikePdf(f: { name: string; type: string }): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/** Read the %PDF- header; cheap check before handing the file to pdf.js. */
async function hasPdfHeader(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder('latin1').decode(head);
  return text.includes('%PDF-');
}

/**
 * Import a PDF as a new document. The original bytes are stored exactly as given; pdf.js is used
 * only to read page sizes (with /Rotate applied). Throws an Error with a user-friendly message and
 * leaves nothing behind on failure.
 */
export async function importPdfFile(
  file: File,
  folderId: string = ROOT_ID,
  onProgress?: (p: ImportProgress) => void,
): Promise<NotebookDocument> {
  if (!(await hasPdfHeader(file))) {
    throw new ImportError(`“${file.name}” doesn’t look like a PDF file.`);
  }
  const pdfjs = await getPdfjs();
  let loading: ReturnType<typeof pdfjs.getDocument> | null = null;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    loading = pdfjs.getDocument({ data });
    const pdf = await loading.promise;
    const dims: PdfPageDims[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const v = page.getViewport({ scale: 1 });
      dims.push({ width: v.width, height: v.height });
      page.cleanup();
      onProgress?.({ done: i, total: pdf.numPages });
    }
    if (dims.length === 0) throw new ImportError('This PDF has no pages.');
    const title = file.name.replace(/\.pdf$/i, '');
    return await createPdfDocument({ title, folderId, blob: file, pages: dims });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if ((e as { name?: string } | null)?.name === 'QuotaExceededError') {
      throw new ImportError('Not enough storage space to import this PDF.', e);
    }
    throw new ImportError(explainPdfError(e), e);
  } finally {
    await loading?.destroy().catch(() => undefined);
  }
}
