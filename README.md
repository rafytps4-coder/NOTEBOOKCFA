# Notebook

A free, private handwriting notebook for tablets (iPad Safari + Apple Pencil first) and desktop browsers. Everything stays on your device: no accounts, no analytics, no ads. Works offline once loaded.

Standing rules for contributors (and for the AI assistant that builds this) are in [CLAUDE.md](CLAUDE.md). The design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the honest status of the core app is in [docs/CORE-MVP-CHECKLIST.md](docs/CORE-MVP-CHECKLIST.md). Build prompts live in [prompts/](prompts/).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run lint && npm run typecheck && npm test && npm run build
```

## End-to-end tests

```bash
npm run test:e2e                      # builds, serves `vite preview`, runs Playwright
# Where WebKit is not installed (e.g. some CI/containers) run the iPad-sized Chromium project:
PW_CHROMIUM_PATH=/path/to/chromium npx playwright test --project=ipad-chromium
```

The `ipad-webkit` project is the real target (iPad Safari engine). Pen _feel_ and latency can only be judged on a physical iPad with an Apple Pencil.

## Regenerating generated files

- `node scripts/make-icons.mjs` rewrites the PNG icons in `public/`.
- `node scripts/gen-licenses.mjs` rewrites `src/generated/licenses.json` (runs automatically before `npm run build`).
