# Prompt 00: Setup & architecture

## Goal
Create the project skeleton, tooling, and a written architecture. No product features yet.

## Do
1. Inspect the repo and report what exists (it may contain only `CLAUDE.md` and `content-packs/`).
2. Scaffold a Vite + React + TypeScript (strict) app with the folder layout from CLAUDE.md. Install only the pre-approved tooling needed now (Vite, React, TS, router, Zustand, Dexie, Vitest, Playwright, ESLint, Prettier, vite-plugin-pwa). Add the rest of the pre-approved libraries in the prompt that uses them.
3. Add scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e`.
4. Create an app shell with a minimal, original design: a sidebar/tab bar with **Library, Recent, Search, Helpers, Settings**. Pages that don't exist yet show a clear "Planned" state, not fake content.
5. Add a theme system: light/dark via `prefers-color-scheme` plus a manual override, using CSS variables. Layout must work in portrait, landscape and narrow split-view widths.
6. Set up Playwright with a WebKit iPad-sized project and one smoke test that loads the shell.
7. Write `docs/ARCHITECTURE.md` covering: module layout and dependency direction, data model (Folder, Document, Page, Asset, Settings, plus planned Study/Formula/Helper tables), storage plan (metadata vs blobs, persistence request), drawing approach (stroke JSON, two-canvas rendering, pointer events), PDF approach, search approach, Helper plugin interface, content-pack loading, test strategy, known risks (Safari storage eviction, pen latency, memory with large PDFs), open decisions.
8. Add a CI workflow (GitHub Actions) running lint, typecheck, unit tests, build.

## Do not
Build library, editor, or any real feature yet.

## Done when
- `npm run dev` shows the shell; all five sections are navigable.
- lint, typecheck, unit tests, build and the Playwright smoke test pass (real output reported).
- `docs/ARCHITECTURE.md` exists and matches what you built.

Finish with the required report and STOP.
