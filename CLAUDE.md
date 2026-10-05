# Notebook: free, private handwriting notebook (web/PWA) with optional study Helpers

Standing rules for every session. Each task arrives as a separate prompt in `prompts/`. Do only the current prompt.

## Product
- **Core Notebook**: free, general-purpose handwriting notebook for tablets (iPad Safari + Apple Pencil first, also desktop browsers). Useful to anyone, with no Helper enabled.
- **Helpers**: optional subject modules on top. First one: **CFA Helper (Level I)**. The core must never depend on it.
- Principle: *The notebook belongs to everyone. Helpers make it smarter for specific subjects.*

## Non-negotiables
- **No limits or monetization**: no caps on notebooks/pages/imports, no watermarks, no upsells, no ads, no accounts, no analytics/tracking.
- **Privacy**: everything stays on the device. No network calls with user data. Anything cloud/AI later must be opt-in behind an interface.
- **Honesty**: no fake buttons, fake AI, fake results. Unfinished features are hidden or labelled "Planned". Never claim a build/test/browser check passed unless you actually ran it. Say clearly what you could not verify (e.g. real Apple Pencil feel).
- **Data safety**: user notes are irreplaceable. Autosave, never overwrite without a way back, never delete data without explicit user action, migrations must preserve data.
- **Legal**: don't copy any other app's code, branding, icons or UI. Never include CFA Institute curriculum text, learning-outcome statements, or questions. Don't use their logos or imply endorsement. Content packs use `"source": "original"` only. This disclaimer must be visible in the CFA Helper and Settings > About: *"Independent study tool. Not affiliated with or endorsed by CFA Institute. CFA® and Chartered Financial Analyst® are trademarks owned by CFA Institute."*

## Stack (pre-approved; ask before adding anything else)
TypeScript (strict), React, Vite, vite-plugin-pwa, Dexie (IndexedDB), Zustand, react-router, perfect-freehand, pdfjs-dist, pdf-lib, MiniSearch, KaTeX, Ajv, Vitest, Playwright (WebKit + iPad viewport), ESLint + Prettier. No other runtime dependencies without asking.

## Layout
```
src/
  core/        models, db (Dexie), storage, utils
  features/    library, editor, pdf, search, settings, backup
  engines/     drawing, study, formula
  helpers/     registry, types, cfa/
  ui/          shared components, theme
content-packs/ schemas + cfa-l1-2027 (authoritative; extend, don't reinvent)
docs/          ARCHITECTURE.md, decisions
```
Dependency direction: `helpers` and `features` may use `core`/`engines`/`ui`. `core` and `engines` must never import from `helpers`. Deleting `src/helpers/cfa` must leave the app compiling and working.

## Engineering rules
- Small focused files (aim under ~300 lines). Simple code over clever abstractions; add an interface only when a second implementation is realistically planned (Helper registry, SmartService, storage).
- Pen input is performance-critical: no heavy work on the pointer-event path or main thread; use workers for PDF/OCR/indexing when needed.
- Store large things (PDF/image blobs) as Blobs in IndexedDB tables separate from metadata. Request persistent storage (`navigator.storage.persist()`).
- Unit tests for logic (Vitest); e2e for key flows (Playwright). Keep `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` green.
- Commit small and often with clear messages.

## Working agreement
1. Read this file, `docs/ARCHITECTURE.md` (once it exists), and the current prompt first.
2. Inspect existing code before changing it.
3. Implement only what the current prompt asks. No extra features, no future milestones.
4. Ask me before: new dependency, changing the data model in a way that needs migration, anything cloud/analytics/monetization, legal doubt.
5. Finish by running lint, typecheck, tests and build, and report real output.

## Required final report (then STOP and wait)
**Completed** / **Not completed** / **Tests run + real results** / **Build result** / **How I verified in a browser** / **Known issues** / **Architecture changes** / **Suggested next step**
