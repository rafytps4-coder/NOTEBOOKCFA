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

| Table                                                                                                                   | Purpose                                                                                                       | Status                     |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `folders`                                                                                                               | id, name, parentId, favorite, createdAt, updatedAt, deletedAt                                                 | prompt 01                  |
| `documents`                                                                                                             | id, kind (`notebook` \| `pdf` \| `quickNote`), title, folderId, favorite, lastOpenedAt, deletedAt, timestamps | prompt 01                  |
| `pages`                                                                                                                 | id, documentId, order, template, size, background, bookmark, strokes, objects                                 | stub in 01, filled 02–04   |
| `assets`                                                                                                                | id, blob, mime, size, kind (image/pdf) — **blobs live apart from metadata**                                   | prompt 01                  |
| `settings`                                                                                                              | key → value                                                                                                   | prompt 01                  |
| `studySets`, `flashcards`, `reviewLogs`, `studySessions`, `questions`, `quizResults`, `mistakes`, `tags`, `studyAssets` | generic study system (db v5, additive)                                                                        | prompt 08                  |
| Formula / Helper tables                                                                                                 | formulas, formula progress, helper instances                                                                  | _(planned, prompts 09–10)_ |

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

## 6. Search approach (built in prompt 06)

- **Sources**: document titles, folder names, typed text (text boxes) and extracted PDF text. Handwriting is not searchable yet (no OCR).
- **Derived data** (Dexie v3, purely additive): the `searchText` table holds one row per page per source (`typed:<pageId>` is rewritten inside every page save; `pdf:<pageId>` is filled by background extraction, with `''` meaning "looked, nothing there"). It is a cache: not exported in backups, and rebuildable (Settings → _Rebuild search index_ recomputes typed text from page content and re-extracts PDF text).
- **Index**: MiniSearch (`searchIndex.ts`) with accent/case-insensitive folding, prefix and fuzzy (0.2) matching, AND-then-OR fallback, title boost, and snippet building with highlighted words. A `SearchEngine` reads IndexedDB and keeps the index in step; in the app it lives in a **Web Worker** (`searchWorker.ts`), so indexing never blocks the UI. Table hooks on documents/folders/pages/searchText mark documents dirty; the client syncs them 300 ms later and result lists refresh when the index version changes. If Workers are unavailable the same engine runs inline.
- **PDF text**: extracted page by page via pdf.js (`pdfText.ts`), yielding to the UI between pages, resumable (pages with rows are skipped), triggered after import and at startup; progress shows on the Search page and in Settings.
- **Results**: grouped by document, with page numbers and snippets; tapping opens `/doc/:id?page=<pageId>`.

## 6b. Backup & restore (built in prompt 06)

- **Format**: `.notebook` = a ZIP written by our own small implementation (`backup/zip.ts`; no new dependency): `manifest.json` (format name, format version, DB version, scope, counts, titles), `data/*.json` (folders, documents, pages, settings, assets metadata, `pageContent` in chunks of 200 pages), `blobs/<assetId>` (raw bytes, stored not compressed). JSON is deflated with the browser's `CompressionStream`; every entry has a CRC-32. Limits: ZIP32 (< 4 GB, < 65,535 files).
- **Export**: whole library or one notebook. With the File System Access API the archive is **streamed to disk** part by part (blobs are added by reference and checksummed in chunks); otherwise a Blob is built and downloaded. `BACKUP_TABLES` lists the tables included; tables added by later milestones (study, helpers) must be added there.
- **Import** (`archive.ts`): inspect first (manifest validated with Ajv, format/DB version checked, contents shown), then everything is read and verified (row schemas, every file's checksum) _before_ a single write; the write is one Dexie transaction, so a corrupt or failing import changes nothing. **Merge** gives new ids only to items whose id already exists (and rewrites every reference: parent folders, documents, pages, image assets, page thumbnails); existing settings are kept. **Replace** clears and restores (single-notebook files can only be merged); the UI offers (default on) to save a backup of the current library first. Older formats are upgraded on import (a v1 archive with ink inside page rows is migrated; tested). Known limit: the transaction needs the page data in memory, so extremely large libraries (≈ a GB of ink) may not restore on low-memory devices.
- **Reminders**: optional (off by default); per-day interval; dismissed reminders stay quiet for a day. Settings → _Storage & backup_ shows usage (`navigator.storage.estimate()`), whether persistence was granted, and can re-request it.

## 6c. PWA, accessibility, resilience (built in prompt 07)

- **PWA**: `vite-plugin-pwa` (generateSW, `registerType: 'prompt'`, `skipWaiting: false`). The whole app, including the pdf.js worker and the search worker, is precached, so after the first load it runs fully offline (tested by going offline and reloading, creating and saving). A new version downloads quietly and waits; `UpdatePrompt` offers _Update now_ / _Later_ and flushes pending ink before activating, so an update can never reload the page mid-stroke (tested end-to-end against a static server that releases a second service worker). Icons are generated by `scripts/make-icons.mjs` (original artwork); iOS meta tags and an Add-to-Home-Screen explainer are in place (iPad Safari has no install prompt).
- **Accessibility**: semantic landmarks and a skip link; every control has an accessible name; visible focus rings; shortcuts help sheet (`?`); text-size setting (everything sized in `rem`, scaled from the root); `prefers-reduced-motion` honoured; WCAG-AA contrast of the colour tokens is asserted in a unit test; an automated audit (names, alt text, duplicate ids, labelled dialogs, landmarks, one h1) runs over every screen in Playwright. The canvas is `role="img"` with a description and page-level alternatives (page buttons, Go to page, PageUp/PageDown).
- **Narrow layouts**: below 600 px the editor chrome collapses to two single-row, sideways-scrolling bars and the options panel starts collapsed so the page keeps the room; below 500 px the options panel scrolls internally.
- **Resilience**: `StorageGate` opens IndexedDB before rendering and explains blocked storage; `ErrorBoundary` replaces a crashed screen with a calm message; a full disk (`QuotaExceededError`, matched by name because Dexie wraps it) shows a clear banner, keeps the data in memory and retries on the next change; `pageIntegrity.ts` validates page content on load (keeps valid items, stores the raw damaged data in `pageBackup` as `corrupt:<pageId>`, falls back to a rate-limited `previous:<pageId>` last-good copy written before each save). Dexie v4 added `pageBackup` (additive).
- **Privacy check**: the Core MVP e2e records every network request during the whole journey and asserts none leave localhost.

## 6d. Study system (built in prompt 08)

- **Generic**: nothing in `engines/study`, `core/study*.ts` or `features/study` knows about any subject or Helper. Route `/study` (own nav item); sets → cards → review session, a question bank with quiz mode, and a mistake log.
- **Scheduler** (`engines/study`): `Scheduler` interface with one SM-2-style implementation (`sm2.ts`). Pure functions with the clock passed in (`reviewCard(state, rating, now)`), no random fuzz, so history is reproducible. Rules: new/learning cards → _Again_/_Hard_ return in 10 min, _Good_ graduates to 1 day, _Easy_ to 4 days; review cards → _Good_ = gap × ease (≥ +1 day), _Hard_ = gap × 1.2 and ease −0.15, _Easy_ = gap × ease × 1.3 and ease +0.15, _Again_ = lapse (ease −0.2, back to learning, +1 lapse). Ease is clamped to 1.3–3.2, the gap to 10 years. `queue.ts` builds the study queue (overdue first, then new cards) and due counts (due = by the end of today); `stats.ts` computes statistics from review logs only; `weakAreas.ts` ranks tags by logged mistakes.
- **Data**: a card keeps its schedule state inline (`sched`) and every answer appends a `reviewLogs` row in the same transaction. Card images live in `studyAssets` (separate from notebook `assets`, so notebook clean-up never removes them; an image is deleted when no card uses it). Cards have a nullable `formulaId` (used by prompt 09) and an optional `sourceRef` (document + page) that links back to the notebook page they came from. Tags are a natural-keyed table (`name`) that cards, questions and mistakes refer to by name.
- **Questions**: multiple choice or short answer (case/space-insensitive match), tags, difficulty. Quiz results go to `quizResults`; a wrong answer offers to log a mistake. JSON import/export (`core/questionsIO.ts`) validates the whole file with Ajv before adding anything.
- **From a notebook**: the toolbar's _Flashcard_ button takes the selection (`CanvasController.selectionInfo()`): text from text boxes pre-fills the front, and a PNG snapshot of the selected strokes/objects (no page background) can be attached. Handwriting is never converted to text.
- **Backup**: library backups include all study tables (`backup/extraTables.ts`: per-table id spaces and link fields). Merge gives colliding ids new ids and rewrites every link (card → set/image/notebook page, log → card/set/session, result/mistake → question). Replace only clears tables the backup actually contains, so restoring a backup from before study existed never wipes flashcards. Single-notebook files carry no study data.

## 6e. Formula engine (built in prompt 09)

- **Generic** like the study system: `engines/formula` (pack validation, mastery, evidence, recommendations; pure and tested), `core/formulas.ts` (installing packs, user formulas), `features/formulas` (UI under `/study/formulas`). KaTeX is loaded lazily (`katexLoader.ts`), so it costs nothing until a formula is shown; its CSS/fonts are precached for offline use.
- **Packs**: `validateFormulaPack` checks a pack with Ajv (2020-12) against `content-packs/schemas/formulas.schema.json`, then rejects wrong kinds, newer/older schema majors (supported: 1), duplicate ids, and (when the topics pack is known) unknown topics. It is pure: an invalid pack fails with readable messages and **never touches the database**. `installFormulaPack` replaces only that pack's own rows in one transaction and refuses to take over ids belonging to another pack or the user.
- **User data is separate from pack data**: pack formulas live in `formulas` (`origin: 'pack'`, replaced on update); notes live in `formulaProgress` keyed by formula id; flashcards/questions/mistakes link by `formulaId`. Updating or removing a pack formula therefore never loses notes or history. User formulas have ids starting `user:` and can't collide with pack ids.
- **Mastery** is derived from linked review logs, quiz results and mistakes (rules in `docs/MASTERY.md`); it cannot be edited. `features/formulas/masteryData.ts` gathers the history in bulk.
- **Backup & search**: formulas and notes are in library backups (natural keys: a merge only adds missing rows and never overwrites yours; Replace restores them). The search worker indexes formulas (name, category, plain equation, purpose, when-to-use, variables, tags and your notes) and results open the formula.
- **Pack discovery**: the Packs panel lists packs offered by enabled Helpers (`Helper.packs`) plus "from a file"; the core ships no pack of its own.

## 7. Helper plugin interface (built in prompt 10)

- Full documentation, including a step-by-step "how to add a new Helper", is in **`docs/HELPERS.md`**.
- `src/helpers/types.ts` defines `Helper` (id, name, description, icon, version, `stores`, `Onboarding`, `Dashboard`, optional `selectionActions`, `packs`, `data`, `onEnable`/`onDisable`). `registry.ts` discovers Helpers with `import.meta.glob('./*/index.{ts,tsx}')`, so adding a Helper is adding a folder and removing one is deleting its folder; nothing else names it. Enabled state is the Dexie table `helperInstances` (v7, additive; included in library backups, never overwritten by a merge).
- The **Helpers** nav item and `/helpers` screen exist only when at least one Helper is registered. Disabling hides a Helper and keeps its data; _Delete Helper data_ is a separate, confirmed action that lists what will be removed.
- The notebook toolbar's generic **Helpers ▾** menu appears only when an enabled Helper offers selection actions.
- `helpers/cfa/` is a registered shell: name, Level I, the required disclaimer, "Planned" labels for what is not built, no numbers. It brings the starter formula pack (offered under Study → Formulas → Packs while it is on).
- **Isolation**: ESLint forbids `core`/`engines` from importing `helpers` at all and `features`/`ui` from importing `helpers/cfa`; a unit test proves the rule fires; `npm run check:isolation` builds a copy of the project with `src/helpers/cfa` deleted (and, with `--e2e`, runs the non-Helper e2e tests against it).

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
