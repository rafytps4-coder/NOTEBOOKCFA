# Prompt 06: Search, backup & restore

## Goal
Find anything quickly, and make losing data very unlikely.

## Install
`minisearch`.

## Do
### Search (no handwriting OCR yet)
1. Build a local index over: document titles, folder names, typed text in text boxes, and extracted PDF text (extract with pdf.js in a background worker, store text per page, index incrementally).
2. Search page: instant results as you type, grouped by document, with highlighted snippets; tapping a result opens the right page. Fuzzy/prefix matching, case- and accent-insensitive.
3. Index is a derived cache: it must be rebuildable from source data. Add "Rebuild search index" in Settings. Update incrementally when content changes. Never block the UI during indexing; show progress for large imports.

### Backup & restore
4. **Export everything**: one-click export of the whole library (all documents, pages, assets, settings, study data tables that exist) as a single `.notebook` archive (zip with a versioned `manifest.json` plus blobs). Use the File System Access API where available, otherwise a download. Stream or chunk so large libraries don't crash Safari.
5. **Import / restore**: validate the manifest and schema version first, show what it contains, then import. Offer "Merge" (new IDs on conflict) and "Replace" (with a clear warning and an automatic pre-restore backup suggestion). A corrupt archive must fail safely, changing nothing.
6. Export a single notebook as a `.notebook` file and as a PDF (reusing prompt 05's exporter).
7. Backup reminders: a gentle, dismissible reminder if the last backup is older than N days (configurable; off by default is acceptable). Show storage used and whether persistence is granted in Settings > Storage.
8. Unit tests for archive round-trip (export then import into an empty DB gives identical data) and for corrupt/old-version archives.

## Do not
Add OCR, cloud sync, or accounts.

## Done when
Search finds typed text and PDF text across documents; a full export → wipe → import restores everything byte-for-byte for assets. Tests pass.

Finish with the required report and STOP.
