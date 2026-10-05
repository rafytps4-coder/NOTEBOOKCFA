type Pdfjs = typeof import('pdfjs-dist');

let loaded: Promise<Pdfjs> | null = null;
let injected: Pdfjs | null = null;

/** Tests inject the Node-compatible build; the app lazy-loads the browser build. */
export function setPdfjsForTests(m: Pdfjs): void {
  injected = m;
}

/**
 * pdf.js is loaded on demand (it is large) and parses/decodes in its own Web Worker, so heavy
 * document work stays off the main thread. Painting onto a canvas is done by pdf.js on the main
 * thread; we render one page at a time and only for pages near the viewport.
 */
export function getPdfjs(): Promise<Pdfjs> {
  if (injected) return Promise.resolve(injected);
  loaded ??= (async () => {
    // The legacy build polyfills newer JS features (e.g. Map.getOrInsertComputed) that older
    // Safari/Chromium versions lack, so it works on more iPads.
    const m = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  })();
  return loaded;
}

export type PdfDoc = import('pdfjs-dist').PDFDocumentProxy;

/** Friendly message for the ways opening a PDF commonly fails. */
export function explainPdfError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'PasswordException') {
    return 'This PDF is password-protected. Password-protected PDFs aren’t supported yet.';
  }
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return 'This file doesn’t look like a valid PDF, or it is damaged.';
  }
  if (name === 'MissingPDFException') return 'The PDF could not be found.';
  return 'The PDF could not be opened. It may be damaged or use features we can’t read.';
}
