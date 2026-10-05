# Core MVP checklist

Status of the free core notebook (prompts 00–07). Every line is one of:

- **Verified (automated)**: covered by a test that ran and passed. Browser tests ran in **headless Chromium with an iPad Pro 11" viewport** (WebKit is not installed in the build environment, so `ipad-webkit` could not run). Unit tests ran in Node with `fake-indexeddb`.
- **Verified (manually in browser)**: I looked at screenshots of the real running app (headless Chromium, iPad-sized) and judged them. This is _not_ Safari and _not_ a physical iPad.
- **Needs physical iPad/Pencil**: cannot be judged without the hardware (or Safari itself). **Not verified.**

Nothing here has been run on WebKit/Safari or an Apple Pencil. Treat every "automated" row as "works in Chromium", and see the iPad section at the bottom before relying on the app for real notes.

## Library & storage

| Item                                                                                                                                   | Status                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Nested folders, notebooks, quick notes; rename, move, duplicate, favorite, trash, restore, delete forever (confirmed); survives reload | Verified (automated): `library.spec`, `library.test`                                                               |
| Recent view; sort; grid/list; empty states                                                                                             | Verified (automated)                                                                                               |
| 1,000 documents list/sort in well under a second                                                                                       | Verified (automated, Node + fake-indexeddb)                                                                        |
| Persistent storage requested; calm notice when not granted                                                                             | Verified (automated) that the notice shows when the browser refuses; whether Safari grants it: Needs physical iPad |
| Long-press menu on touch                                                                                                               | Logic implemented; not exercised with a real long-press: Needs physical iPad                                       |

## Drawing

| Item                                                                                               | Status                                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pen, pencil, highlighter (multiply), stroke eraser, lasso select/move/copy/paste/delete            | Verified (automated) with mouse and synthetic pen pointer events                                                             |
| Undo/redo (buttons and keyboard) over draw, erase, move, delete                                    | Verified (automated)                                                                                                         |
| Colour palette + custom colour, size, opacity, saved presets (save/apply/rename/delete, persisted) | Verified (automated)                                                                                                         |
| Palm rejection rule (touch ignored once a pen was seen; "Pencil only / Pencil and finger" setting) | Verified (automated) with synthetic pointer events only                                                                      |
| Zoom/pan: wheel and button reset; pinch/pan maths                                                  | Wheel + maths Verified (automated); **real two-finger pinch and double-tap**: Needs physical iPad                            |
| Crisp ink at any zoom (canvas re-rendered at scale)                                                | Verified (manually in browser)                                                                                               |
| Autosave (debounced + on tab hide), saved indicator, library thumbnails                            | Verified (automated)                                                                                                         |
| **Pen feel, pressure curve, latency, Pencil hover/tilt**                                           | **Needs physical iPad/Pencil** (the dev-only performance overlay, Ctrl/Cmd+Shift+P or `?perf=1`, is there to help tune this) |

## Pages & templates

| Item                                                                                                                                                | Status                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continuous scroll + single-page mode; lazy live canvases (≤ ~10 canvases at any time)                                                               | Verified (automated)                                                                                                                                                              |
| Blank / ruled / grid / dotted / Cornell; spacing, line and paper colour; sizes A4/Letter/A5/custom; orientation; template change never touches ink  | Verified (automated)                                                                                                                                                              |
| Add/insert/duplicate/delete(+undo)/move/reorder (drag handle and "Move to position"), bookmarks + filter, defaults from Settings, new pages inherit | Verified (automated)                                                                                                                                                              |
| 500-page notebook scrolls smoothly                                                                                                                  | Verified (automated, headless Chromium): average 16.8 ms/frame, worst ~50 ms, 0 long tasks while scrolling 300 frames; open in ~0.6 s. **Not a measurement of iPad performance.** |
| Insert-at-front / move across 500 pages                                                                                                             | Unit-tested with fake-indexeddb (~0.4 s there; real IndexedDB is expected to be faster, unmeasured)                                                                               |

## Text, shapes, images

| Item                                                                                                   | Status                                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Text boxes (create, type, edit, format, move/resize/rotate, delete); real text stored and searchable   | Verified (automated); **iPad hardware keyboard / IME / dictation**: Needs physical iPad |
| Shapes (line, arrow, rectangle, ellipse, triangle), outline/fill/width; opt-in hold-to-snap            | Verified (automated)                                                                    |
| Images from the file picker: downscaled to ≤ 2560 px, stored as assets, move/resize/rotate/crop/delete | Verified (automated); **Photos picker on iPad**: Needs physical iPad                    |
| Selection handles with mouse/synthetic pointers; undo/redo of all object operations                    | Verified (automated); **finger/Pencil handle ergonomics**: Needs physical iPad          |
| Orphaned images only removed by _Empty trash_ or _Clean up storage_                                    | Verified (automated)                                                                    |

## PDF

| Item                                                                                                                                                                                                                        | Status                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Import (file picker, drag-and-drop), original stored byte-identical (hash recorded)                                                                                                                                         | Verified (automated)                                                                                      |
| 1-page, 200-page, rotated (/Rotate 90/180/270) and image-only (scanned) PDFs import and render                                                                                                                              | Verified (automated); 200-page import ~1.1 s and 8 live canvases while scrolling (Chromium)               |
| Annotate; export annotated PDF: ink lands where it was drawn (checked by rendering the exported file with pdf.js), incl. on a /Rotate 90 page; annotations-only; original export byte-identical; added blank pages included | Verified (automated)                                                                                      |
| Remove all annotations (original untouched, undoable until you leave)                                                                                                                                                       | Verified (automated, hashes compared)                                                                     |
| Outline/table of contents, jump to page                                                                                                                                                                                     | Verified (automated)                                                                                      |
| **Share Target / "Open in…"**                                                                                                                                                                                               | **Not built**: iPad Safari does not support Web Share Target; import is via the file picker/drag-and-drop |
| **Text-selection highlight**                                                                                                                                                                                                | **Not built** (freehand highlighter only)                                                                 |
| Memory with very large PDFs on iPad Safari                                                                                                                                                                                  | Needs physical iPad (the page-bitmap cache is bounded to 128 MB; unmeasured on device)                    |

## Search

| Item                                                                                                                                                      | Status                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Titles, folder names, typed text, PDF text; instant results; accent/case-insensitive; prefix + typo tolerance; highlighted snippets; opens the right page | Verified (automated)                |
| Index updates incrementally; trashed items disappear; _Rebuild search index_ works; indexing runs in a worker                                             | Verified (automated)                |
| 2,000-page index: build ~80 ms, query ~7 ms                                                                                                               | Verified (automated, Node)          |
| **Handwriting search**                                                                                                                                    | **Not built** (prompt 14, optional) |

## Backup & restore

| Item                                                                                                          | Status                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export everything → wipe → import restores all data; assets byte-for-byte                                     | Verified (automated)                                                                                                                                                                                     |
| Merge (new ids only on conflict, all references rewritten) and Replace (with optional safety backup)          | Verified (automated)                                                                                                                                                                                     |
| Corrupt, truncated, wrong-format, newer-version archives fail before anything is written; v1 archives migrate | Verified (automated)                                                                                                                                                                                     |
| Single-notebook `.notebook` files; notebook → PDF                                                             | Verified (automated)                                                                                                                                                                                     |
| Backup reminder (off by default), storage usage, persistence status                                           | Verified (automated)                                                                                                                                                                                     |
| Streaming to disk via the File System Access API                                                              | Code path implemented; **not exercised** (headless test browsers lack a save dialog; the download fallback is what was tested). Safari has no `showSaveFilePicker`, so on iPad the download path is used |
| Very large libraries (≈ 1 GB of ink) restoring on a low-memory iPad                                           | Needs physical iPad (the import holds page data in memory)                                                                                                                                               |

## PWA, accessibility, polish

| Item                                                                                                                                          | Status                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest, icons, iOS meta tags                                                                                                                | Verified (automated); icon artwork Verified (manually in browser)                                                                      |
| Works offline after first load (reload, create, draw, save; PDF engine and search worker too)                                                 | Verified (automated, Chromium service worker)                                                                                          |
| Update flow: new version waits, "Later"/"Update now", ink flushed first, no surprise reload                                                   | Verified (automated)                                                                                                                   |
| **Installing from Safari ("Add to Home Screen") and iOS service-worker/storage behaviour**                                                    | **Needs physical iPad** (iOS may evict storage for non-installed sites; installed apps and persistence help but cannot be tested here) |
| Every control has an accessible name; landmarks; skip link; no duplicate ids; labelled dialogs (automated audit of every screen)              | Verified (automated)                                                                                                                   |
| Visible focus on every tab stop; full keyboard path for primary actions; shortcuts sheet (`?`)                                                | Verified (automated)                                                                                                                   |
| Colour contrast (light and dark tokens ≥ 4.5:1)                                                                                               | Verified (automated, computed)                                                                                                         |
| Reduced motion; text scaling (4 sizes, controls scale)                                                                                        | Verified (automated)                                                                                                                   |
| **VoiceOver reading order/announcements and Pencil + VoiceOver interplay**                                                                    | **Needs physical iPad** (no screen reader was run)                                                                                     |
| Layouts: iPad 11" and 13", portrait and landscape, Split View widths 500/375/320; no horizontal overflow; every tool reachable; drawing works | Verified (automated, Chromium viewports) + screenshots reviewed (manually in browser)                                                  |
| Safe-area insets, 100vh/Safari toolbar quirks, rotation on a real device                                                                      | Needs physical iPad                                                                                                                    |
| First-run guide (4 short steps, skippable, once, reopenable); About (version, privacy statement, disclaimer, licences)                        | Verified (automated)                                                                                                                   |
| Storage full, blocked IndexedDB, damaged page data (repair + last good copy), failed PDF import, crashed screen                               | Verified (automated); a crashed React screen: unit test only                                                                           |
| No network traffic leaves localhost during the whole journey                                                                                  | Verified (automated)                                                                                                                   |
| Anything half-built hidden: the _Helpers_ section is not shown (prompt 10 adds it)                                                            | Verified (automated)                                                                                                                   |

## Not built yet (labelled as such, or hidden)

Helpers and the study system (prompts 08–13), handwriting search (14), PDF text-selection highlight, Web Share Target, partial/pixel erase (the eraser removes whole strokes), eraser for objects (objects are removed via selection), undo history of a page is dropped when that page scrolls far out of view and is unmounted, password-protected PDFs, ZIP64 (> 4 GB archives).

## The iPad pass (do this before trusting the app)

1. Install from Safari (Share → Add to Home Screen) and confirm it launches full-screen, offline.
2. Write with the Pencil for a few minutes: latency, pressure, palm rejection, two-finger pinch/scroll, double-tap reset, Scribble if you use it.
3. Import a real textbook PDF (100+ pages), annotate, export, open the export in Files/Books.
4. Create a backup, delete the app's data, restore it.
5. Turn on VoiceOver and move through the library, a notebook and Settings.
6. Rotate the iPad and try Split View.
