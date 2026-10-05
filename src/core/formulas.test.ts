// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import starter from '../../content-packs/cfa-l1-2027/formulas.starter.json';
import {
  addCard,
  createSet,
  createUserFormula,
  db,
  deleteUserFormula,
  emptySide,
  installFormulaPack,
  listInstalledPacks,
  saveFormulaNotes,
  saveQuestion,
  updateUserFormula,
} from './index';
import { validateFormulaPack } from '@/engines/formula';

beforeEach(() => Promise.all(db.tables.map((t) => t.clear())));

const pack = () => {
  const r = validateFormulaPack(structuredClone(starter));
  if (!r.ok) throw new Error(r.errors.join());
  return r.pack;
};
const user = {
  name: 'My formula',
  category: 'Mine',
  equation: { latex: 'x=y', plain: 'x = y' },
  variables: [{ symbol: 'x', name: 'x' }],
  purpose: 'p',
  whenToUse: 'w',
  workedExample: { problem: 'p', steps: ['s'], answer: 'a' },
  commonMistakes: ['m'],
  difficulty: 'foundational' as const,
};

describe('installing packs', () => {
  it('installs the starter pack and records it', async () => {
    const r = await installFormulaPack(pack());
    expect(r).toEqual({ added: 8, updated: 0, removed: 0 });
    expect(await db.formulas.count()).toBe(8);
    expect(await listInstalledPacks()).toMatchObject([
      { packId: 'cfa-l1-2027', contentVersion: '0.1.0', count: 8 },
    ]);
    const f = (await db.formulas.get('quant.future-value'))!;
    expect(f).toMatchObject({ origin: 'pack', packId: 'cfa-l1-2027', source: 'original' });
  });

  it('updating a pack never touches user formulas, notes, cards or history', async () => {
    await installFormulaPack(pack());
    const mine = await createUserFormula(user);
    await saveFormulaNotes('quant.npv', 'my own note');
    const set = await createSet('S');
    await addCard({ setId: set.id, front: emptySide(), back: emptySide(), formulaId: 'quant.npv' });

    const v2 = pack();
    v2.contentVersion = '0.2.0';
    v2.formulas = v2.formulas.filter((f) => f.id !== 'pm.sharpe-ratio'); // one removed
    v2.formulas[0]!.name = 'Renamed in v2';
    const r = await installFormulaPack(v2);
    expect(r).toEqual({ added: 0, updated: 7, removed: 1 });

    expect((await db.formulas.get(v2.formulas[0]!.id))!.name).toBe('Renamed in v2');
    expect(await db.formulas.get(mine.id)).toBeTruthy();
    expect((await db.formulaProgress.get('quant.npv'))!.notes).toBe('my own note');
    expect((await db.flashcards.toArray())[0]!.formulaId).toBe('quant.npv');
    expect((await listInstalledPacks())[0]).toMatchObject({ contentVersion: '0.2.0' });
    expect(await listInstalledPacks()).toHaveLength(1);
  });

  it('a pack cannot take over a user formula id or another pack’s formula', async () => {
    await installFormulaPack(pack());
    const other = pack();
    other.packId = 'another-pack';
    await expect(installFormulaPack(other)).rejects.toThrow(/already exists in another pack/);
    expect(await db.formulas.where('packId').equals('another-pack').count()).toBe(0);
    expect(await db.formulas.count()).toBe(8); // nothing changed
  });
});

describe('user formulas', () => {
  it('create, edit, delete — pack formulas are read-only', async () => {
    await installFormulaPack(pack());
    const f = await createUserFormula(user);
    expect(f.id).toMatch(/^user:/);
    await updateUserFormula(f.id, { ...user, name: 'Edited' });
    expect((await db.formulas.get(f.id))!.name).toBe('Edited');
    await updateUserFormula('quant.npv', { ...user, name: 'Hacked' });
    expect((await db.formulas.get('quant.npv'))!.name).not.toBe('Hacked');
    await deleteUserFormula('quant.npv');
    expect(await db.formulas.get('quant.npv')).toBeTruthy();
  });

  it('deleting one removes its notes and unlinks (not deletes) its cards and questions', async () => {
    const f = await createUserFormula(user);
    await saveFormulaNotes(f.id, 'n');
    const set = await createSet('S');
    const c = await addCard({
      setId: set.id,
      front: { text: 'keep me', imageId: null },
      back: emptySide(),
      formulaId: f.id,
    });
    const q = await saveQuestion({
      kind: 'short-answer',
      prompt: 'q',
      choices: [],
      correctIndex: null,
      answer: 'a',
      explanation: '',
      tags: [],
      difficulty: 'easy',
      formulaId: f.id,
    });
    await deleteUserFormula(f.id);
    expect(await db.formulaProgress.count()).toBe(0);
    expect(await db.flashcards.get(c.id)).toMatchObject({ formulaId: null });
    expect(await db.questions.get(q.id)).toMatchObject({ formulaId: null });
  });
});
