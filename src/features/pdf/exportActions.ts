import { safeFilename, saveBlob } from '@/ui/saveFile';
import type { ExportMode, ExportProgress } from './exportPdf';

export type PdfExportKind = ExportMode | 'original';

/**
 * Build and hand over a PDF of a document (works for notebooks and PDF documents alike). The PDF
 * writer is loaded on demand so it doesn't weigh down the first load of the app.
 */
export async function exportDocumentAsPdf(
  documentId: string,
  title: string,
  kind: PdfExportKind,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const { exportOriginal, exportPdf } = await import('./exportPdf');
  const blob =
    kind === 'original'
      ? await exportOriginal(documentId)
      : await exportPdf(documentId, {
          mode: kind,
          rasterizer: (await import('./rasterizer')).browserRasterizer,
          onProgress,
        });
  const suffix =
    kind === 'annotated' ? '-annotated' : kind === 'annotationsOnly' ? '-annotations' : '';
  await saveBlob(blob, `${safeFilename(title)}${suffix}.pdf`);
}
