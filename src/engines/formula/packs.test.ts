import { describe, expect, it } from 'vitest';
import starter from '../../../content-packs/cfa-l1-2027/formulas.starter.json';
import topics from '../../../content-packs/cfa-l1-2027/topics.json';
import { parseFormulaPack, validateFormulaPack } from './packs';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = () => structuredClone(starter) as unknown as Loose;

describe('formula pack validation', () => {
  it('loads the existing starter pack, with its topics cross-checked', () => {
    const topicIds = new Set(topics.topics.map((t) => t.id));
    const r = validateFormulaPack(starter, { topicIds });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.formulas.length).toBeGreaterThanOrEqual(8);
      expect(r.pack.formulas.every((f) => f.source === 'original')).toBe(true);
      expect(r.pack.disclaimer).toMatch(/not affiliated/i);
    }
  });

  it('accepts a minimal valid pack', () => {
    const p = clone();
    p.formulas = [p.formulas[0]];
    delete p.formulas[0].relatedFormulaIds;
    expect(validateFormulaPack(p).ok).toBe(true);
  });

  it('rejects a missing required field with a readable message', () => {
    const p = clone();
    delete p.formulas[2].purpose;
    const r = validateFormulaPack(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/formulas #3.*purpose/);
  });

  it('rejects wrong types, bad ids, unknown fields and non-original sources', () => {
    for (const mutate of [
      (p: Loose) => (p.formulas[0].difficulty = 'impossible'),
      (p: Loose) => (p.formulas[0].id = 'Has Spaces'),
      (p: Loose) => (p.formulas[0].extra = 1),
      (p: Loose) => (p.formulas[0].source = 'cfa-institute'),
      (p: Loose) => (p.formulas[0].variables = []),
      (p: Loose) => (p.formulas = []),
      (p: Loose) => (p.contentVersion = 'one'),
    ]) {
      const p = clone();
      mutate(p);
      expect(validateFormulaPack(p).ok).toBe(false);
    }
  });

  it('rejects wrong-version packs: newer (update the app) and older (unsupported)', () => {
    const newer = clone();
    newer.schemaVersion = '2.0.0';
    const a = validateFormulaPack(newer);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors[0]).toMatch(/newer than this app/);
    const older = clone();
    older.schemaVersion = '0.9.0';
    const b = validateFormulaPack(older);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors[0]).toMatch(/old format/);
    const none = clone();
    delete none.schemaVersion;
    expect(validateFormulaPack(none).ok).toBe(false);
  });

  it('rejects other pack kinds, non-objects and bad JSON', () => {
    expect(validateFormulaPack(topics).ok).toBe(false);
    expect(validateFormulaPack([]).ok).toBe(false);
    expect(validateFormulaPack(null).ok).toBe(false);
    const r = parseFormulaPack('{nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/not valid JSON/);
  });

  it('rejects duplicate ids and unknown topics; warns about dangling related links', () => {
    const dup = clone();
    dup.formulas.push(structuredClone(dup.formulas[0]));
    const d = validateFormulaPack(dup);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.errors[0]).toMatch(/more than once/);

    const t = clone();
    t.formulas[0].topicId = 'astrology';
    const r = validateFormulaPack(t, { topicIds: new Set(['quant']) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/unknown topic “astrology”/);
    expect(validateFormulaPack(t).ok).toBe(true); // topics unknown: not checked

    const w = clone();
    w.formulas[0].relatedFormulaIds = ['nowhere.formula'];
    const ok = validateFormulaPack(w);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.warnings[0]).toMatch(/nowhere\.formula/);
  });
});
