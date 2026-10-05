import { db } from '@/core/db';
import { newId } from '@/core/ids';
import type { Flashcard, StudyAsset } from '@/core/studyModels';
import type { ZipReader, ZipWriter } from './zip';

/**
 * Data from later milestones (study system, formulas, Helpers) that belongs in a full-library
 * backup. Each table says which id space it lives in and which fields point into other id spaces,
 * so a merge can give colliding rows new ids without breaking the links between them.
 */
interface Spec {
  table: string;
  /** Primary key field. */
  key: 'id' | 'name' | 'formulaId';
  /** Id space this table's ids belong to (null: ids are natural keys and are never remapped). */
  ns: string | null;
  /** field → id space it refers to. */
  refs?: Record<string, string>;
  /** Natural keys: a merge only adds rows that don't exist yet (never overwrites yours). */
  keepExisting?: boolean;
}

export const EXTRA_SPECS: Spec[] = [
  { table: 'studySets', key: 'id', ns: 'set' },
  { table: 'flashcards', key: 'id', ns: 'card', refs: { setId: 'set' } },
  {
    table: 'reviewLogs',
    key: 'id',
    ns: 'log',
    refs: { cardId: 'card', setId: 'set', sessionId: 'session' },
  },
  { table: 'studySessions', key: 'id', ns: 'session', refs: { setId: 'set' } },
  { table: 'questions', key: 'id', ns: 'question' },
  {
    table: 'quizResults',
    key: 'id',
    ns: 'result',
    refs: { questionId: 'question', sessionId: 'session' },
  },
  { table: 'mistakes', key: 'id', ns: 'mistake', refs: { questionId: 'question' } },
  { table: 'tags', key: 'name', ns: null },
  // Formulas keep their ids (cards and questions refer to them by id); notes belong to a formula.
  { table: 'formulas', key: 'id', ns: null, keepExisting: true },
  { table: 'formulaProgress', key: 'formulaId', ns: null, keepExisting: true },
];

export const EXTRA_TABLE_NAMES = [...EXTRA_SPECS.map((s) => s.table), 'studyAssets'];

type Row = Record<string, unknown>;
export type ExtraRows = Record<string, Row[]>;
export type StudyAssetRow = Omit<StudyAsset, 'blob'> & { file: string };

type AddTable = (name: string, rows: unknown[]) => Promise<void>;

/** Writes every extra table (library backups only). Returns the number of blob bytes written. */
export async function writeExtraTables(zip: ZipWriter, addTable: AddTable): Promise<number> {
  for (const s of EXTRA_SPECS) await addTable(s.table, await db.table(s.table).toArray());
  let bytes = 0;
  const meta: StudyAssetRow[] = [];
  for (const a of await db.studyAssets.toArray()) {
    const { blob, ...rest } = a;
    const file = `blobs/study-${a.id}`;
    await zip.add(file, blob);
    meta.push({ ...rest, file });
    bytes += blob.size;
  }
  await addTable('studyAssets', meta);
  return bytes;
}

export interface ReadExtra {
  rows: ExtraRows;
  assets: StudyAssetRow[];
  blobs: Map<string, Blob>;
}

export async function readExtraTables(
  readTable: <T>(name: string) => Promise<T[]>,
  zip: ZipReader,
  has: (name: string) => boolean,
): Promise<ReadExtra> {
  const rows: ExtraRows = {};
  for (const s of EXTRA_SPECS) rows[s.table] = has(s.table) ? await readTable<Row>(s.table) : [];
  const assets = has('studyAssets') ? await readTable<StudyAssetRow>('studyAssets') : [];
  const blobs = new Map<string, Blob>();
  for (const a of assets) {
    if (!zip.has(a.file)) throw new Error(`a file is missing: ${a.file}`);
    await zip.verify(a.file);
    blobs.set(a.id, await zip.readBlob(a.file, a.mime));
  }
  return { rows, assets, blobs };
}

export interface OuterMaps {
  doc: Map<string, string>;
  page: Map<string, string>;
}

export interface PreparedExtra {
  rows: ExtraRows;
  assets: StudyAsset[];
  /** Tables the backup actually contained: only these are cleared by "Replace". */
  present: Set<string>;
  remapped: number;
}

/** Decide ids (merge) and rewrite links between rows. Reads the database but writes nothing. */
export async function prepareExtra(
  data: ReadExtra,
  mode: 'merge' | 'replace',
  outer: OuterMaps,
  present: Set<string>,
): Promise<PreparedExtra> {
  const maps = new Map<string, Map<string, string>>();
  let remapped = 0;
  const allocate = async (ns: string, table: string, ids: string[]) => {
    const m = new Map<string, string>();
    for (const id of ids) {
      const clash = mode === 'merge' && !!(await db.table(table).get(id));
      m.set(id, clash ? newId() : id);
      if (clash) remapped++;
    }
    maps.set(ns, m);
  };
  for (const s of EXTRA_SPECS)
    if (s.ns)
      await allocate(
        s.ns,
        s.table,
        data.rows[s.table]!.map((r) => r[s.key] as string),
      );
  await allocate(
    'image',
    'studyAssets',
    data.assets.map((a) => a.id),
  );

  const to = (ns: string, id: unknown) =>
    typeof id === 'string' ? (maps.get(ns)?.get(id) ?? id) : id;

  const rows: ExtraRows = {};
  for (const s of EXTRA_SPECS) {
    rows[s.table] = data.rows[s.table]!.map((r) => {
      const out: Row = { ...r };
      if (s.ns) out[s.key] = to(s.ns, r[s.key]);
      for (const [field, ns] of Object.entries(s.refs ?? {}))
        if (field in out) out[field] = to(ns, out[field]);
      return out;
    });
  }
  // Cards also point at notebook pages and at images.
  rows.flashcards = (rows.flashcards as unknown as Flashcard[]).map((c) => ({
    ...c,
    front: { ...c.front, imageId: to('image', c.front.imageId) as string | null },
    back: { ...c.back, imageId: to('image', c.back.imageId) as string | null },
    sourceRef: c.sourceRef
      ? {
          documentId: outer.doc.get(c.sourceRef.documentId) ?? c.sourceRef.documentId,
          pageId: outer.page.get(c.sourceRef.pageId) ?? c.sourceRef.pageId,
        }
      : null,
  })) as unknown as Row[];

  const assets = data.assets.map(({ file: _f, ...a }) => {
    void _f;
    return { ...a, id: to('image', a.id) as string, blob: data.blobs.get(a.id)! };
  });
  return { rows, assets, present, remapped };
}

export const extraTablesForTransaction = () => [
  ...EXTRA_SPECS.map((s) => db.table(s.table)),
  db.studyAssets,
];

/** Inside the import transaction. */
export async function applyExtra(p: PreparedExtra, mode: 'merge' | 'replace'): Promise<void> {
  if (mode === 'replace') {
    for (const t of [...p.present]) await db.table(t).clear();
  }
  for (const s of EXTRA_SPECS) {
    let rows = p.rows[s.table]!;
    if (mode === 'merge' && s.keepExisting && rows.length) {
      const have = new Set(await db.table(s.table).toCollection().primaryKeys());
      rows = rows.filter((r) => !have.has(r[s.key] as string));
    }
    if (rows.length) await db.table(s.table).bulkPut(rows);
  }
  if (p.assets.length) await db.studyAssets.bulkPut(p.assets);
}
