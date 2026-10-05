# Architecture

Living document. Describes what is built **and** what is planned; planned items are marked _(planned)_.

## 1. Module layout & dependency direction

```
src/
  core/        models, db (Dexie), repositories, storage, utils
  features/    library, editor, pdf, search, settings, backup   (UI + feature logic)
  engines/     drawing, study, formula                          (pure logic, no React where possible)
  helpers/     registry, types, cfa/                            (optional subject modules)
  ui/          shared components, theme
content-packs/ schemas + cfa-l1-2027 (arrives with prompt 11)
docs/          ARCHITECTURE.md, decisions
e2e/           Playwright tests
```

Rules:

- `features` and `helpers` may import `core`, `engines`, `ui`.
- `core` and `engines` **never** import from `helpers` (enforced by an ESLint `no-restricted-imports` rule).
- Deleting `src/helpers/cfa` must leave the app compiling and working.
- Path alias `@/` → `src/`.

## 2. Data model (IndexedDB via Dexie)

| Table                           | Purpose                                                                                                       | Status                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `folders`                       | id, name, parentId, favorite, createdAt, updatedAt, deletedAt                                                 | prompt 01                  |
| `documents`                     | id, kind (`notebook` \| `pdf` \| `quickNote`), title, folderId, favorite, lastOpenedAt, deletedAt, timestamps | prompt 01                  |
| `pages`                         | id, documentId, order, template, size, background, bookmark, strokes, objects                                 | stub in 01, filled 02–04   |
| `assets`                        | id, blob, mime, size, kind (image/pdf) — **blobs live apart from metadata**                                   | prompt 01                  |
| `settings`                      | key → value                                                                                                   | prompt 01                  |
| Study / Formula / Helper tables | flashcards, schedules, formulas, helper state                                                                 | _(planned, prompts 08–10)_ |

IDs are UUID strings. Times are epoch ms. Deletion is soft (`deletedAt`) until the user chooses "Delete forever".
Schema is versioned with Dexie `version().stores()`; migrations must preserve data.

## 3. Storage plan

Built in prompt 01: `src/core/` holds `models`, `db` (Dexie v1), repositories (`folders`, `documents`, `trash`, `settings`), `sort`, and `storage` (persistence request). Items at the top level use `parentId`/`folderId = 'root'` (`ROOT_ID`) so the field stays indexable. Assets carry an owner `documentId`; permanent delete removes a document's pages and assets in one transaction. Deleting a folder soft-deletes its subtree with one shared timestamp; restoring it restores only that batch. UI reads data through `liveQuery` (`ui/useLive.ts`) so views update after any write; view/sort choices are stored in the `settings` table.

- Metadata (small rows) and blobs (PDF/images) are in **separate tables** so listing never loads blobs.
- `navigator.storage.persist()` requested at startup; a dismissible notice is shown if not granted.
- Theme preference is the only thing in `localStorage` (a UI preference, not user data).
- Backup/restore as a `.notebook` zip archive _(planned, prompt 06)_.

## 4. Drawing approach _(planned, prompt 02)_

- Strokes are JSON: points `{x, y, pressure, t}`, tool, color, base width, opacity. Pure TS in `engines/drawing`.
- Two stacked canvases: committed layer + live layer for the stroke in progress.
- Pointer Events with `getCoalescedEvents()`, `touch-action: none`, DPR-aware. No React state on the pointer path.
- `perfect-freehand` for outlines. Palm rejection: once a `pen` pointer is seen, `touch` doesn't draw.

## 5. PDF approach (built in prompt 05)

- **Import** (`features/pdf/importPdf.ts`): file picker or drag-and-drop on the Library. The file is stored byte-for-byte as an `assets` row (`kind: 'pdf'`, SHA-256 recorded) and never modified; pdf.js reads only page sizes. One `Page` per PDF page, sized in PDF points with `/Rotate` already applied (`page.pdf.index` links back to the original page), so annotations live in "as displayed" page space and stay aligned at every zoom and rotation. Pages added later (blank/template) have no `pdf` link.
- **Rendering** (`bitmapCache.ts`): pdf.js (legacy build, for older Safari) parses/decodes in its own Web Worker; painting happens on the main thread, one page at a time. Rendered pages are cached in a size-bounded LRU (128 MB budget, canvases shrunk on eviction) at bucketed scales so zooming reuses bitmaps; only pages near the viewport are rendered (see §3 pages). The canvas controller paints the PDF bitmap in place of paper, then objects, then ink.
- **Annotations**: the same strokes/objects model as notebooks, stored in `pageContent`. "Remove all annotations" only rewrites `pageContent` (snapshot kept in the session for undo); the PDF asset's hash is unchanged (tested).
- **Export** (`exportPdf.ts`, pdf-lib): PDF pages are copied (vector content kept), template pages are drawn from their template, ink is written as filled vector paths (colour, opacity, multiply for highlighter), shapes as vector paths, text with Helvetica (non-Latin text and cropped/odd-format images fall back to canvas rasterisation), images embedded. Display→PDF coordinates go through `displayToUser` (handles `/Rotate`, crop-box origin). Work is chunked per page with a progress callback and a yield to the UI between pages; it runs on the main thread, not in a worker. Also "Export original" (identical bytes) and "Export annotations only".
- **Not built / honest limits**: (1) no Web Share Target / "Open in…": iPad Safari does not support the Web Share Target API for installed web apps, so import is via the file picker (Files app, iCloud Drive) or drag-and-drop from Split View; (2) highlighting is freehand only: there is no text-selection highlight because the pdf.js text layer is not integrated; (3) password-protected PDFs are rejected with a message; (4) text boxes in an exported PDF use a standard Latin font; (5) very large PDFs are held in memory while open (original bytes + parsed document).

## 6. Search approach _(planned, prompt 06)_

- MiniSearch index over titles, typed text and extracted PDF text. Derived cache, rebuildable from source data.
- Indexing incremental and off the main interaction path. No handwriting OCR in the core MVP.

## 7. Helper plugin interface _(planned, prompt 10)_

- A `Helper` registers via `helpers/registry` (id, name, routes, nav entry, optional hooks). Core knows only the registry.
- The Helpers screen lists registered helpers; today none exist and the screen says "Planned".

## 8. Content-pack loading _(planned, prompt 10–13)_

- JSON packs validated with Ajv against schemas in `content-packs/schemas`. `"source": "original"` only.

## 9. Theme & shell (built in prompt 00)

- CSS variables; light/dark through `prefers-color-scheme`, with manual override via `data-theme` on `<html>` (`system` removes the attribute). Choice stored in `localStorage`.
- Shell: sidebar at ≥641px, bottom tab bar at ≤640px (portrait / Split View). Sections: Library, Recent, Search, Helpers, Settings; unbuilt ones render a "Planned" state.
- PWA plugin is registered but only minimally configured; manifest, offline and update flow come in prompt 07.

## 10. Test strategy

- **Vitest** (jsdom + `fake-indexeddb`) for logic: repositories, stroke model, archives, etc.
- **Playwright** at iPad Pro 11 viewport. Two projects: `ipad-webkit` (the real target) and `ipad-chromium` (fallback where WebKit isn't installed; set `PW_CHROMIUM_PATH` if needed).
- Pen feel/latency cannot be judged by emulation; it needs a physical iPad + Apple Pencil.
- CI (GitHub Actions): lint, typecheck, unit tests, build. E2E is run locally for now.

## 11. Known risks

- **Safari storage eviction**: IndexedDB can be evicted for sites without persistence/regular use. Mitigation: `persist()`, notice, backups.
- **Pen latency**: main-thread work on the pointer path. Mitigation: two canvases, coalesced events, no allocations/React updates there.
- **Memory with large PDFs / many pages**: lazy rendering, LRU caches, release off-screen canvases.

## 12. Open decisions

- Whether to adopt a worker for stroke hit-testing/thumbnailing (decide after measuring in prompt 02/03).
- How the Web Share Target behaves on iPad Safari (verify in prompt 05; document limits).
