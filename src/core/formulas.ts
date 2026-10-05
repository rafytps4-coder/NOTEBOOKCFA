import { db } from './db';
import { newId, now } from './ids';
import { getSetting, setSetting } from './settings';
import type { FormulaPack, PackFormula } from '@/engines/formula/types';
import type { FormulaRow, InstalledPack } from './studyModels';

const PACKS_KEY = 'formulas.installedPacks';

export const isUserFormula = (f: Pick<FormulaRow, 'origin'>) => f.origin === 'user';

export async function listInstalledPacks(): Promise<InstalledPack[]> {
  return getSetting<InstalledPack[]>(PACKS_KEY, []);
}

/**
 * Install or update a validated pack. Only that pack's own formula rows are replaced; user
 * formulas, notes (`formulaProgress`), flashcards, questions and history are never touched. A
 * formula that disappeared from the pack is removed from the library but its notes and history
 * are kept (they are keyed by id, so they reattach if it comes back).
 */
export async function installFormulaPack(
  pack: FormulaPack,
): Promise<{ added: number; updated: number; removed: number }> {
  const t = now();
  const rows: FormulaRow[] = pack.formulas.map((f) => ({
    ...f,
    source: 'original',
    origin: 'pack',
    packId: pack.packId,
    updatedAt: t,
  }));
  return db.transaction('rw', [db.formulas, db.settings], async () => {
    const existing = await db.formulas.where('packId').equals(pack.packId).primaryKeys();
    const have = new Set(existing);
    const next = new Set(rows.map((r) => r.id));
    // A pack must not take over an id that belongs to a different pack or to the user.
    for (const r of rows) {
      const other = await db.formulas.get(r.id);
      if (other && other.packId !== pack.packId)
        throw new Error(
          `Formula “${r.id}” already exists in another pack, so this pack was not installed.`,
        );
    }
    const removed = existing.filter((id) => !next.has(id));
    await db.formulas.bulkDelete(removed);
    await db.formulas.bulkPut(rows);
    const info: InstalledPack = {
      packId: pack.packId,
      title: pack.title,
      contentVersion: pack.contentVersion,
      curriculumVersion: pack.curriculumVersion,
      disclaimer: pack.disclaimer,
      count: rows.length,
      installedAt: t,
    };
    const packs = (await listInstalledPacks()).filter((p) => p.packId !== pack.packId);
    await setSetting(PACKS_KEY, [...packs, info]);
    return {
      added: rows.filter((r) => !have.has(r.id)).length,
      updated: rows.filter((r) => have.has(r.id)).length,
      removed: removed.length,
    };
  });
}

type UserFormulaInput = Omit<PackFormula, 'id' | 'source' | 'topicId'> & { topicId?: string };

export async function createUserFormula(input: UserFormulaInput): Promise<FormulaRow> {
  const row: FormulaRow = {
    ...input,
    id: `user:${newId()}`,
    topicId: input.topicId ?? 'user',
    source: 'user',
    origin: 'user',
    packId: null,
    updatedAt: now(),
  };
  await db.formulas.add(row);
  return row;
}

export async function updateUserFormula(id: string, input: UserFormulaInput): Promise<void> {
  const cur = await db.formulas.get(id);
  if (!cur || cur.origin !== 'user') return; // pack formulas are read-only
  await db.formulas.put({
    ...cur,
    ...input,
    id,
    source: 'user',
    origin: 'user',
    packId: null,
    updatedAt: now(),
  });
}

/** Removes a user formula and its notes. Cards, questions and mistakes keep their text but lose the link. */
export async function deleteUserFormula(id: string): Promise<void> {
  const cur = await db.formulas.get(id);
  if (!cur || cur.origin !== 'user') return;
  await db.transaction(
    'rw',
    [db.formulas, db.formulaProgress, db.flashcards, db.questions, db.mistakes],
    async () => {
      await db.flashcards.where('formulaId').equals(id).modify({ formulaId: null });
      await db.questions.where('formulaId').equals(id).modify({ formulaId: null });
      await db.mistakes.where('formulaId').equals(id).modify({ formulaId: null });
      await db.formulaProgress.delete(id);
      await db.formulas.delete(id);
    },
  );
}

export async function saveFormulaNotes(formulaId: string, notes: string): Promise<void> {
  await db.formulaProgress.put({ formulaId, notes, updatedAt: now() });
}
