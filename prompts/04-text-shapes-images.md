# Prompt 04: Text, shapes & images

## Goal
Complete the remaining editor tools with the same data-safety standard as ink.

## Do
1. Introduce a page **object** model alongside strokes: `textBox`, `shape`, `image`, each with id, position, size, rotation, z-order. Persist with the page. Keep strokes as their own list. Add tests.
2. Text boxes: tap to create, type with the keyboard (including iPad hardware keyboard), basic formatting (size, color, bold/italic), move, resize, delete, select. Text must be real searchable text stored in the page data.
3. Shapes: line, arrow, rectangle, ellipse, triangle. Draw by drag with optional shape-snapping when the user holds still at the end of a stroke (setting, default off). Stroke color, width, optional fill.
4. Images: insert from Files and Photos (`<input type="file" accept="image/*">`). Downscale very large images on import (keep a reasonable maximum, e.g. 2560px edge) but never alter the original unless the user chooses. Store blobs in the `assets` table; the page holds only an asset ID. Move, resize, rotate, crop (basic), delete.
5. Selection, move, resize, rotate handles that work with touch and Pencil; lasso from prompt 02 should also select objects.
6. Undo/redo covers all object operations.
7. Orphan cleanup: assets no longer referenced by any page are removed only after the user empties trash or runs "Clean up storage" in Settings (never silently on edit, since undo may need them). Test this.

## Do not
Add PDF.

## Done when
Add typed text, shapes and images to pages, move/resize/delete them, undo/redo, reload and everything persists. Tests pass.

Finish with the required report and STOP.
