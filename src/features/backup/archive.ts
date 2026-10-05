import { db } from '@/core/db';
import { newId } from '@/core/ids';
import { pageThumbId } from '@/core/pages';
import type {
  Asset,
  Folder,
  NotebookDocument,
  Page,
  PageContent,
  PageObject,
  SettingRow,
} from '@/core/models';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, firstRowError, validateManifest } from './archiveSchemas';
import { ZipReader, ZipWriter, ZipError } from './zip';

/** The schema version of the database these archives are made from (see core/db.ts). */
export const DB_VERSION = 4;
const APP = { name: 'Notebook', version: '0.1.0' };

/**
 * Tables included in a backup. Derived caches (`searchText`) are left out on purpose. Study and
 * helper tables added by later milestones must be added here so backups stay complete.
 */
export const BACKUP_TABLES = ['folders', 'documents', 'pages', 'pageContent', 'settings'] as const;
type TableName = (typeof BACKUP_TABLES)[number];

export class ArchiveError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ArchiveError';
  }
}

export interface ExportProgress {
  phase: string;
  done: number;
  total: number;
}

export interface ArchiveInfo {
  scope: 'library' | 'document';
  createdAt: number;
  appVersion: string;
  dbVersion: number;
  counts: { folders: number; documents: number; pages: number; assets: number; bytes: number };
  titles: string[];
}

const json = (v: unknown) => JSON.stringify(v);
const PAGES_PER_CHUNK = 200;

/** Everything needed to write an archive, for the whole library or for one document. */
interface Selection {
  scope: 'library' | 'document';
  folders: Folder[];
  documents: NotebookDocument[];
  pages: Page[];
  settings: SettingRow[];
  assets: Asset[];
}

async function selectLibrary(): Promise<Selection> {
  return {
    scope: 'library',
    folders: await db.folders.toArray(),
    documents: await db.documents.toArray(),
    pages: (await db.pages.toArray()).filter((p) => p.deletedAt === null),
    settings: await db.settings.toArray(),
    assets: (await db.assets.toArray()).filter((a) => a.name !== 'page-thumbnail'),
  };
}

async function selectDocument(documentId: string): Promise<Selection> {
  const doc = await db.documents.get(documentId);
  if (!doc) throw new ArchiveError('That notebook no longer exists.');
  return {
    scope: 'document',
    folders: [],
    documents: [{ ...doc, folderId: 'root', deletedAt: null, favorite: false }],
    pages: (await db.pages.where('documentId').equals(documentId).toArray()).filter(
      (p) => p.deletedAt === null,
    ),
    settings: [],
    assets: (await db.assets.where('documentId').equals(documentId).toArray()).filter(
      (a) => a.name !== 'page-thumbnail',
    ),
  };
}

export interface ExportOptions {
  /** Receives parts as they are produced (e.g. a file on disk); otherwise they are collected. */
  sink?: (part: Uint8Array | Blob) => void | Promise<void>;
  onProgress?: (p: ExportProgress) => void;
}

async function writeArchive(sel: Selection, opts: ExportOptions): Promise<ZipWriter> {
  const zip = new ZipWriter(opts.sink);
  const progress = (phase: string, done: number, total: number) =>
    opts.onProgress?.({ phase, done, total });
  const tables: Record<string, { files: string[]; count: number }> = {};

  const addTable = async (name: string, rows: unknown[]) => {
    await zip.addText(`data/${name}.json`, json(rows));
    tables[name] = { files: [`data/${name}.json`], count: rows.length };
  };

  await addTable('folders', sel.folders);
  await addTable('documents', sel.documents);
  await addTable('pages', sel.pages);
  await addTable('settings', sel.settings);

  // Ink and objects: chunked so no single JSON file (or in-memory string) gets huge.
  const files: string[] = [];
  let count = 0;
  for (let i = 0; i < sel.pages.length; i += PAGES_PER_CHUNK) {
    const ids = sel.pages.slice(i, i + PAGES_PER_CHUNK).map((p) => p.id);
    const rows = (await db.pageContent.bulkGet(ids)).filter((c): c is PageContent => !!c);
    const name = `data/pageContent-${String(files.length + 1).padStart(4, '0')}.json`;
    await zip.addText(name, json(rows));
    files.push(name);
    count += rows.length;
    progress('Pages', Math.min(i + PAGES_PER_CHUNK, sel.pages.length), sel.pages.length);
  }
  tables.pageContent = { files, count };

  // Blobs are added as references; they are never loaded into one big buffer.
  let bytes = 0;
  const assetMeta = [];
  let n = 0;
  for (const a of sel.assets) {
    const { blob, ...meta } = a;
    const file = `blobs/${a.id}`;
    await zip.add(file, blob);
    assetMeta.push({ ...meta, file });
    bytes += blob.size;
    progress('Files', ++n, sel.assets.length);
    if (n % 20 === 0) await new Promise((r) => setTimeout(r));
  }
  await addTable('assets', assetMeta);

  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    scope: sel.scope,
    createdAt: Date.now(),
    dbVersion: DB_VERSION,
    app: APP,
    tables,
    blobs: { count: sel.assets.length, bytes },
    summary: {
      folders: sel.folders.length,
      documents: sel.documents.length,
      pages: sel.pages.length,
      assets: sel.assets.length,
      bytes,
      titles: sel.documents.slice(0, 5).map((d) => d.title),
    },
  };
  await zip.addText('manifest.json', json(manifest));
  zip.finish();
  await zip.flush();
  return zip;
}

/** Export the whole library. Returns a Blob unless a `sink` was given (then streams, returns null). */
export async function exportLibrary(opts: ExportOptions = {}): Promise<Blob | null> {
  const zip = await writeArchive(await selectLibrary(), opts);
  return opts.sink ? null : new Blob(zip.parts, { type: 'application/x-notebook' });
}

export async function exportDocument(
  documentId: string,
  opts: ExportOptions = {},
): Promise<Blob | null> {
  const zip = await writeArchive(await selectDocument(documentId), opts);
  return opts.sink ? null : new Blob(zip.parts, { type: 'application/x-notebook' });
}

// ---- reading -----------------------------------------------------------------------------

type Manifest = {
  format: string;
  version: number;
  scope: 'library' | 'document';
  createdAt: number;
  dbVersion: number;
  app?: { version?: string };
  tables: Record<string, { files: string[]; count: number }>;
  summary: ArchiveInfo['counts'] & { titles?: string[] };
};

async function openArchive(file: Blob): Promise<{ zip: ZipReader; manifest: Manifest }> {
  let zip: ZipReader;
  try {
    zip = await ZipReader.open(file);
  } catch (e) {
    throw new ArchiveError(
      e instanceof ZipError ? e.message : 'This file could not be read as a Notebook backup.',
      e,
    );
  }
  if (!zip.has('manifest.json'))
    throw new ArchiveError('This is not a Notebook backup (no manifest found).');
  let manifest: unknown;
  try {
    manifest = JSON.parse(await zip.readText('manifest.json'));
  } catch (e) {
    throw new ArchiveError('The backup’s manifest is damaged.', e);
  }
  if (!validateManifest(manifest)) {
    throw new ArchiveError('This is not a valid Notebook backup (the manifest is malformed).');
  }
  const m = manifest as Manifest;
  if (m.version > ARCHIVE_VERSION) {
    throw new ArchiveError(
      'This backup was made by a newer version of Notebook. Update the app, then try again.',
    );
  }
  if (m.dbVersion > DB_VERSION) {
    throw new ArchiveError(
      'This backup uses a newer data format than this version of Notebook understands.',
    );
  }
  const known = new Set<string>([...BACKUP_TABLES, 'assets']);
  for (const t of Object.keys(m.tables)) {
    if (!known.has(t))
      throw new ArchiveError(`This backup contains data (“${t}”) this version can’t restore.`);
  }
  return { zip, manifest: m };
}

/** Read just enough to tell the user what a backup contains. Changes nothing. */
export async function inspectArchive(file: Blob): Promise<ArchiveInfo> {
  const { manifest } = await openArchive(file);
  return {
    scope: manifest.scope,
    createdAt: manifest.createdAt,
    appVersion: manifest.app?.version ?? 'unknown',
    dbVersion: manifest.dbVersion,
    counts: manifest.summary,
    titles: manifest.summary.titles ?? [],
  };
}

async function readTable<T>(zip: ZipReader, manifest: Manifest, table: string): Promise<T[]> {
  const entry = manifest.tables[table];
  if (!entry) return [];
  const rows: T[] = [];
  for (const f of entry.files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await zip.readText(f));
    } catch (e) {
      throw new ArchiveError(`The backup is damaged (“${f}” can’t be read).`, e);
    }
    if (!Array.isArray(parsed))
      throw new ArchiveError(`The backup is damaged (“${f}” has the wrong shape).`);
    const problem = firstRowError(table, parsed);
    if (problem) throw new ArchiveError(`The backup is damaged (${problem}).`);
    rows.push(...(parsed as T[]));
  }
  return rows;
}

// ---- importing ------------------------------------------------------------------------------

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  folders: number;
  documents: number;
  pages: number;
  assets: number;
  /** Items that got a new id because the same id already existed (merge mode). */
  remapped: number;
}

type AssetRow = Omit<Asset, 'blob'> & { file: string };
type OldPage = Page & { strokes?: unknown[] };

/** Bring rows from older data formats up to the current one. */
function upgradeRows(dbVersion: number, pages: OldPage[], content: PageContent[]) {
  if (dbVersion >= 2) return;
  // v1 stored ink inside the page row; v2 moved it to pageContent.
  const have = new Set(content.map((c) => c.pageId));
  for (const p of pages) {
    if (!have.has(p.id))
      content.push({
        pageId: p.id,
        strokes: (p.strokes as PageContent['strokes']) ?? [],
        objects: [],
      });
    delete p.strokes;
    p.sizeName ??= 'A4';
    p.template ??= { kind: 'blank', spacing: 28, color: '#c5cfdc' };
    p.background ??= '#ffffff';
    p.bookmarked ??= false;
    p.deletedAt ??= null;
  }
}

export async function importArchive(
  file: Blob,
  mode: ImportMode,
  onProgress?: (p: ExportProgress) => void,
): Promise<ImportResult> {
  const { zip, manifest } = await openArchive(file);
  if (mode === 'replace' && manifest.scope === 'document') {
    throw new ArchiveError(
      'A single-notebook file can only be added to your library, not used to replace it.',
    );
  }
  const progress = (phase: string, done: number, total: number) =>
    onProgress?.({ phase, done, total });

  // 1. Read and validate everything up front. Nothing is written until all of it checks out.
  progress('Checking backup', 0, 1);
  const folders = await readTable<Folder>(zip, manifest, 'folders');
  const documents = await readTable<NotebookDocument>(zip, manifest, 'documents');
  const pages = await readTable<OldPage>(zip, manifest, 'pages');
  const settings = await readTable<SettingRow>(zip, manifest, 'settings');
  const content = await readTable<PageContent>(zip, manifest, 'pageContent');
  const assetRows = await readTable<AssetRow>(zip, manifest, 'assets');
  upgradeRows(manifest.dbVersion, pages, content);

  let n = 0;
  for (const a of assetRows) {
    if (!zip.has(a.file))
      throw new ArchiveError(`The backup is damaged (a file is missing: ${a.file}).`);
    try {
      await zip.verify(a.file);
    } catch (e) {
      throw new ArchiveError(
        e instanceof ZipError ? `The backup is damaged: ${e.message}` : 'The backup is damaged.',
        e,
      );
    }
    progress('Verifying files', ++n, assetRows.length);
    if (n % 20 === 0) await new Promise((r) => setTimeout(r));
  }
  const blobs = new Map<string, Blob>();
  for (const a of assetRows) blobs.set(a.id, await zip.readBlob(a.file, a.mime));

  // 2. Decide ids. Replace keeps them; merge gives new ids only to things that already exist.
  const remap = (existing: (id: string) => Promise<boolean>) => async (ids: string[]) => {
    const map = new Map<string, string>();
    for (const id of ids) map.set(id, mode === 'merge' && (await existing(id)) ? newId() : id);
    return map;
  };
  const folderMap = await remap(async (id) => !!(await db.folders.get(id)))(
    folders.map((f) => f.id),
  );
  const docMap = await remap(async (id) => !!(await db.documents.get(id)))(
    documents.map((d) => d.id),
  );
  const pageMap = await remap(async (id) => !!(await db.pages.get(id)))(pages.map((p) => p.id));
  const assetMap = await remap(async (id) => !!(await db.assets.get(id)))(
    assetRows.map((a) => (a.id.startsWith('pagethumb:') ? '' : a.id)).filter(Boolean),
  );
  let remapped = 0;
  for (const m of [folderMap, docMap, pageMap, assetMap])
    for (const [a, b] of m) if (a !== b) remapped++;

  const mapOr = (m: Map<string, string>, id: string, fallback = id) => m.get(id) ?? fallback;
  const objectsOf = (c: PageContent): PageObject[] =>
    (c.objects ?? []).map((o) =>
      o.type === 'image' ? { ...o, assetId: mapOr(assetMap, o.assetId) } : o,
    );

  const newFolders = folders.map((f) => ({
    ...f,
    id: mapOr(folderMap, f.id),
    parentId: mapOr(folderMap, f.parentId),
  }));
  const newDocs = documents.map((d) => ({
    ...d,
    id: mapOr(docMap, d.id),
    // Documents whose folder isn't in the archive (single-notebook files) land at the top level.
    folderId:
      d.folderId === 'root' || !folderMap.has(d.folderId) ? 'root' : mapOr(folderMap, d.folderId),
  }));
  const newPages = pages.map((p) => ({
    ...p,
    id: mapOr(pageMap, p.id),
    documentId: mapOr(docMap, p.documentId),
  }));
  const newContent = content
    .filter((c) => pageMap.has(c.pageId))
    .map((c) => ({ pageId: mapOr(pageMap, c.pageId), strokes: c.strokes, objects: objectsOf(c) }));
  const newAssets: Asset[] = assetRows.map(({ file: _file, ...a }) => {
    void _file;
    const pageThumb = a.id.startsWith('pagethumb:');
    const id = pageThumb
      ? pageThumbId(mapOr(pageMap, a.id.slice('pagethumb:'.length)))
      : mapOr(assetMap, a.id);
    return { ...a, id, documentId: mapOr(docMap, a.documentId), blob: blobs.get(a.id)! };
  });

  // 3. One transaction: either all of it lands or none of it does.
  progress('Restoring', 0, 1);
  const tables = [
    db.folders,
    db.documents,
    db.pages,
    db.pageContent,
    db.assets,
    db.settings,
    db.searchText,
  ];
  try {
    await db.transaction('rw', tables, async () => {
      if (mode === 'replace') {
        await Promise.all(tables.map((t) => t.clear()));
      }
      await db.folders.bulkPut(newFolders);
      await db.documents.bulkPut(newDocs);
      await db.pages.bulkPut(newPages);
      await db.pageContent.bulkPut(newContent);
      await db.assets.bulkPut(newAssets);
      // Merge keeps the settings you already have and only fills in missing ones.
      const have = new Set(mode === 'merge' ? await db.settings.toCollection().primaryKeys() : []);
      await db.settings.bulkPut(settings.filter((s) => !have.has(s.key)));
    });
  } catch (e) {
    throw new ArchiveError(
      (e as { name?: string } | null)?.name === 'QuotaExceededError'
        ? 'There isn’t enough storage space to restore this backup. Nothing was changed.'
        : 'The backup could not be restored. Nothing was changed.',
      e,
    );
  }
  progress('Restoring', 1, 1);
  return {
    folders: newFolders.length,
    documents: newDocs.length,
    pages: newPages.length,
    assets: newAssets.length,
    remapped,
  };
}

export function isTableName(n: string): n is TableName {
  return (BACKUP_TABLES as readonly string[]).includes(n);
}
