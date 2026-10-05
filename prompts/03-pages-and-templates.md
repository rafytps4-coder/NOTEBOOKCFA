# Prompt 03: Pages & templates

## Goal
Unlimited multi-page notebooks with page templates and page management.

## Do
1. Multi-page document: vertical scrolling list of pages (continuous mode) plus a single-page mode toggle. Lazy-render: only visible pages (and neighbours) have live canvases; others show their thumbnail. Release canvases for off-screen pages to control memory.
2. Page model: template, size, orientation, background color, bookmark flag, order index. Page sizes: A4, Letter, A5, custom width/height. Portrait and landscape.
3. Templates drawn as vector background (not baked into strokes): blank, ruled, grid, dotted, Cornell, with adjustable line spacing/color. Template changes affect only the background, never the ink.
4. Page sidebar with thumbnails: select, drag to reorder, add page after, insert page before, duplicate, delete (confirmation), move to another position, bookmark toggle, and a "Bookmarks" filter.
5. Default template and page size in Settings. New pages inherit from the previous page.
6. Reorder/duplicate/delete must be undoable where practical, and must never lose strokes.
7. Performance test: a notebook with 500 pages stays responsive (scrolling, sidebar). Report actual numbers.
8. Keyboard shortcuts: next/previous page, new page.

## Do not
Add text, shapes, images, or PDF.

## Done when
Create a 100+ page notebook, reorder/duplicate/delete pages, change templates, reload and all pages/ink/bookmarks persist. Tests pass.

Finish with the required report and STOP.
