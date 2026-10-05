import Ajv from 'ajv';

/** Highest archive format this build understands. */
export const ARCHIVE_FORMAT = 'notebook-archive';
export const ARCHIVE_VERSION = 1;

const ajv = new Ajv({ allErrors: false, strict: false });

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const bool = { type: 'boolean' } as const;
const nullableNum = { type: ['number', 'null'] } as const;

const manifestSchema = {
  type: 'object',
  required: ['format', 'version', 'scope', 'createdAt', 'dbVersion', 'tables', 'summary'],
  properties: {
    format: { const: ARCHIVE_FORMAT },
    version: { type: 'integer', minimum: 1 },
    scope: { enum: ['library', 'document'] },
    createdAt: num,
    dbVersion: { type: 'integer', minimum: 1 },
    app: { type: 'object' },
    tables: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['files', 'count'],
        properties: {
          files: { type: 'array', items: str },
          count: { type: 'integer', minimum: 0 },
        },
      },
    },
    blobs: { type: 'object' },
    summary: {
      type: 'object',
      required: ['folders', 'documents', 'pages', 'assets', 'bytes'],
      properties: {
        folders: num,
        documents: num,
        pages: num,
        assets: num,
        bytes: num,
        titles: { type: 'array', items: str },
      },
    },
  },
};

/** Minimal row shapes: enough to refuse garbage without being brittle across versions. */
const rowSchemas: Record<string, object> = {
  folders: {
    type: 'object',
    required: ['id', 'name', 'parentId'],
    properties: { id: str, name: str, parentId: str, deletedAt: nullableNum },
  },
  documents: {
    type: 'object',
    required: ['id', 'kind', 'title', 'folderId'],
    properties: {
      id: str,
      kind: { enum: ['notebook', 'pdf', 'quickNote'] },
      title: str,
      folderId: str,
      deletedAt: nullableNum,
    },
  },
  pages: {
    type: 'object',
    required: ['id', 'documentId', 'order'],
    properties: {
      id: str,
      documentId: str,
      order: num,
      width: num,
      height: num,
      deletedAt: nullableNum,
    },
  },
  pageContent: {
    type: 'object',
    required: ['pageId', 'strokes'],
    properties: { pageId: str, strokes: { type: 'array' }, objects: { type: 'array' } },
  },
  assets: {
    type: 'object',
    required: ['id', 'documentId', 'kind', 'file'],
    properties: {
      id: str,
      documentId: str,
      kind: { enum: ['pdf', 'image', 'thumbnail'] },
      mime: str,
      size: num,
      file: str,
    },
  },
  settings: { type: 'object', required: ['key'], properties: { key: str } },
  studySets: { type: 'object', required: ['id', 'name'], properties: { id: str, name: str } },
  flashcards: {
    type: 'object',
    required: ['id', 'setId', 'front', 'back', 'sched'],
    properties: {
      id: str,
      setId: str,
      front: { type: 'object' },
      back: { type: 'object' },
      sched: { type: 'object' },
    },
  },
  reviewLogs: {
    type: 'object',
    required: ['id', 'cardId', 'rating'],
    properties: { id: str, cardId: str, rating: { enum: ['again', 'hard', 'good', 'easy'] } },
  },
  studySessions: { type: 'object', required: ['id', 'kind'], properties: { id: str, kind: str } },
  questions: {
    type: 'object',
    required: ['id', 'kind', 'prompt'],
    properties: { id: str, kind: str, prompt: str },
  },
  quizResults: {
    type: 'object',
    required: ['id', 'questionId'],
    properties: { id: str, questionId: str, correct: bool },
  },
  mistakes: {
    type: 'object',
    required: ['id', 'questionText'],
    properties: { id: str, questionText: str },
  },
  tags: { type: 'object', required: ['name'], properties: { name: str } },
  formulas: {
    type: 'object',
    required: ['id', 'name', 'equation', 'origin'],
    properties: {
      id: str,
      name: str,
      equation: { type: 'object' },
      origin: { enum: ['pack', 'user'] },
    },
  },
  helperInstances: {
    type: 'object',
    required: ['id', 'enabled'],
    properties: { id: str, enabled: bool },
  },
  formulaProgress: {
    type: 'object',
    required: ['formulaId'],
    properties: { formulaId: str, notes: str },
  },
  studyAssets: {
    type: 'object',
    required: ['id', 'file'],
    properties: { id: str, file: str, mime: str },
  },
};

export const validateManifest = ajv.compile(manifestSchema);
const compiled = Object.fromEntries(
  Object.entries(rowSchemas).map(([k, v]) => [k, ajv.compile(v)]),
);

/** Returns an error description for the first invalid row of a table, or null. */
export function firstRowError(table: string, rows: unknown[]): string | null {
  const validate = compiled[table];
  if (!validate) return null; // tables we don't know are handled (or refused) elsewhere
  for (let i = 0; i < rows.length; i++) {
    if (!validate(rows[i])) {
      const e = validate.errors?.[0];
      return `${table} row ${i + 1}: ${e?.instancePath || 'value'} ${e?.message ?? 'is invalid'}`;
    }
  }
  return null;
}

export { bool };
