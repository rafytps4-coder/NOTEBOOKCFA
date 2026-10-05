import Ajv2020 from 'ajv/dist/2020';
import formulasSchema from '../../../content-packs/schemas/formulas.schema.json';
import type { FormulaPack } from './types';

/** Highest pack schema major version this build understands. */
export const SUPPORTED_SCHEMA_MAJOR = 1;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(formulasSchema);

export type PackResult =
  { ok: true; pack: FormulaPack; warnings: string[] } | { ok: false; errors: string[] };

function readable(err: {
  instancePath: string;
  message?: string;
  params: Record<string, unknown>;
}) {
  const where = err.instancePath
    .split('/')
    .filter(Boolean)
    .map((p, i, a) =>
      /^\d+$/.test(p) ? `#${Number(p) + 1}` : i === 0 || /^\d+$/.test(a[i - 1]!) ? p : `.${p}`,
    )
    .join(' ')
    .trim();
  const extra =
    err.params.missingProperty !== undefined
      ? ` “${String(err.params.missingProperty)}”`
      : err.params.additionalProperty !== undefined
        ? ` “${String(err.params.additionalProperty)}”`
        : '';
  return `${where || 'The file'}: ${err.message ?? 'is invalid'}${extra}`;
}

/**
 * Validate a formula pack. Pure: it never touches the database, so an invalid pack can't harm
 * anything. `topicIds` (from the topics pack, when known) enables the cross-reference check.
 */
export function validateFormulaPack(
  data: unknown,
  opts: { topicIds?: Set<string> } = {},
): PackResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { ok: false, errors: ['This is not a formula pack (expected a JSON object).'] };
  const head = data as { kind?: unknown; schemaVersion?: unknown };
  if (head.kind !== 'formulas')
    return {
      ok: false,
      errors: [
        `This is not a formula pack (its kind is “${String(head.kind ?? 'missing')}”, expected “formulas”).`,
      ],
    };
  const version =
    typeof head.schemaVersion === 'string' ? /^(\d+)\.\d+\.\d+$/.exec(head.schemaVersion) : null;
  if (!version)
    return { ok: false, errors: ['The pack has no valid schemaVersion (expected e.g. “1.0.0”).'] };
  const major = Number(version[1]);
  if (major > SUPPORTED_SCHEMA_MAJOR)
    return {
      ok: false,
      errors: [
        `This pack uses format version ${head.schemaVersion as string}, which is newer than this app understands. Update the app, then try again.`,
      ],
    };
  if (major < SUPPORTED_SCHEMA_MAJOR)
    return {
      ok: false,
      errors: [
        `This pack uses an old format (${head.schemaVersion as string}) that is no longer supported.`,
      ],
    };

  if (!validateSchema(data)) {
    const errors = [...new Set((validateSchema.errors ?? []).slice(0, 8).map(readable))];
    return { ok: false, errors };
  }
  const pack = data as unknown as FormulaPack;
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const f of pack.formulas) {
    if (seen.has(f.id)) errors.push(`Formula id “${f.id}” appears more than once.`);
    seen.add(f.id);
  }
  for (const f of pack.formulas) {
    if (opts.topicIds && !opts.topicIds.has(f.topicId))
      errors.push(`Formula “${f.id}” refers to an unknown topic “${f.topicId}”.`);
    for (const r of f.relatedFormulaIds ?? [])
      if (!seen.has(r))
        warnings.push(`Formula “${f.id}” links to “${r}”, which is not in this pack.`);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  return { ok: true, pack, warnings };
}

/** Parse JSON text and validate it; a syntax error becomes a readable message too. */
export function parseFormulaPack(text: string, opts?: { topicIds?: Set<string> }): PackResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  return validateFormulaPack(data, opts);
}
