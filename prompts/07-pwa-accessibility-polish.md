# Prompt 07: PWA, accessibility & polish (Core MVP gate)

## Goal
Make the core notebook installable, accessible, resilient and pleasant. After this, the Core Notebook MVP is done.

## Do
1. PWA: web manifest (original name/icon), service worker via vite-plugin-pwa, full offline use after first load, safe update flow ("Update available", never force-reload while editing), "Add to Home Screen" guidance for iPad in Settings.
2. Accessibility: semantic HTML, labels on all controls, visible focus, full keyboard navigation and shortcuts (with a shortcuts help sheet), VoiceOver-friendly names for tools and pages, respects `prefers-reduced-motion`, text scaling, sufficient contrast in light and dark. The drawing canvas gets an accessible description and page-level navigation alternatives.
3. Responsive layouts verified at iPad 11" and 13" sizes, portrait/landscape, and narrow Split View widths (about 320-500px).
4. Error handling: friendly recoverable errors for storage-full, blocked IndexedDB, failed PDF import, corrupt page data (fall back to last good version where possible). Add a small autosave "last good copy" per page so one bad write can't destroy a page.
5. Settings: appearance, default template/size, Pencil-only mode, backup, storage, shortcuts, About (version, licenses of dependencies, privacy statement: "Nothing leaves your device").
6. A short, skippable first-run guide (3-4 screens max) explaining Pencil, creating a notebook, and backups. No accounts, no prompts to pay.
7. Remove or hide anything half-built; confirm every visible control works.
8. Run the Core MVP checklist in Playwright where possible: create folder → notebook → many pages → draw (simulated pointer events) → type text → insert image → import PDF → annotate → export → search → reload → data intact → dark mode → portrait/landscape.
9. Write `docs/CORE-MVP-CHECKLIST.md` with each item marked **Verified (automated)**, **Verified (manually in browser)**, or **Needs physical iPad/Pencil**. Be strictly honest.

## Do not
Add Helpers or study features.

## Done when
The app installs, works offline, passes the checklist honestly, and a stranger can use it without instructions. Tests pass.

Finish with the required report and STOP. Then use the app for real for a few days before starting prompt 08.
