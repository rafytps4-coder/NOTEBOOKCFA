# Prompt 01: Storage & Library

## Goal
Reliable local persistence and a usable library: folders and notebooks that survive closing the browser.

## Do
1. Dexie database with versioned schema and tables: `folders`, `documents` (kind: notebook | pdf | quickNote), `pages` (stub), `assets` (blobs), `settings`. Use stable string IDs (UUIDs), timestamps, `parentId` for folders, `favorite`, `deletedAt` for trash.
2. On startup call `navigator.storage.persist()` and show a calm, dismissible notice if persistence isn't granted (explain why backups matter; link target arrives in prompt 06).
3. Repository layer in `core/` with typed functions (create, rename, duplicate, move, soft-delete, restore, permanently delete, favorite, list by folder, sort by name/modified/created). Unit-test it with `fake-indexeddb`.
4. Library UI: grid and list views, breadcrumb navigation, subfolders, create folder / notebook / quick note, rename, duplicate, move (folder picker), favorite, sort, trash with restore and "Delete forever" (confirmation required). Context menu and long-press menu. Empty states for every view.
5. Recent view: last-opened documents.
6. Document cards show a title and a placeholder thumbnail (real thumbnails arrive with the editor).
7. Permanent delete removes the document's pages and assets too, and nothing else. Test this.
8. No limits on counts anywhere. Add a test that creates 1,000 documents and lists them without UI jank.

## Do not
Build the editor, PDF import, or search.

## Done when
Create nested folders and notebooks, rename/move/duplicate/favorite/trash/restore them, reload the page and everything is still there. Tests pass.

Finish with the required report and STOP.
