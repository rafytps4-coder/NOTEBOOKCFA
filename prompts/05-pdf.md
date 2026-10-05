# Prompt 05: PDF import, annotate & export

## Goal
Import PDFs, annotate them non-destructively, and export a flattened annotated copy.

## Install
`pdfjs-dist`, `pdf-lib`.

## Do
1. Import PDFs from the file picker, drag-and-drop, and the Web Share Target / "Open in" where the PWA supports it (be honest about what iPad Safari allows; document limits). Store the original PDF Blob in `assets` and never modify it. A PDF becomes a document of kind `pdf`.
2. Rendering with pdf.js in a worker: render visible pages lazily at screen resolution, cache bitmaps with a size-bounded LRU, release off-screen pages. Show page thumbnails in the sidebar.
3. Each PDF page has a separate **annotation layer** reusing the page object model (strokes, highlighter, text, shapes, images) from prompts 02 and 04. Coordinates are stored in PDF page space so annotations stay aligned at every zoom and rotation.
4. All editor tools work on PDF pages. Add a text-selection highlight mode only if it can be done reliably with pdf.js text layer; otherwise state clearly that highlight is freehand-only for now.
5. Bookmarks and page navigation (jump to page, outline/table of contents if the PDF has one).
6. "Remove all annotations" (confirmation, undoable via soft state for the session) must leave the original PDF untouched. Test by comparing blob hashes before and after.
7. Export: build a flattened annotated PDF with pdf-lib, drawing strokes as vector paths (preserve color, width, opacity), plus text and images. Also allow "Export original" and "Export annotations only" if simple. Large PDFs must not freeze the UI (use a worker or chunked async work and show progress).
8. Option to add blank/template pages into a PDF document (stored in the annotation layer model, included in export).
9. Test with: a 1-page PDF, a 200-page PDF, a PDF with rotated pages, and a scanned (image-only) PDF. Report memory/time observations honestly.

## Do not
Add OCR or search of PDF text (prompt 06).

## Done when
Import, annotate, close, reopen, export; the exported file opens in another PDF viewer with annotations in place, and the original blob is unchanged. Tests pass.

Finish with the required report and STOP.
