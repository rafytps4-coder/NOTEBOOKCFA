import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, type FormulaRow } from '@/core';
import { MASTERY_LABEL, MASTERY_STATES } from '@/engines/formula';
import { useLive } from '@/ui/useLive';
import { FormulaEditor } from './FormulaEditor';
import { MasteryBadge } from './MasteryBadge';
import { PackLoader } from './PackLoader';
import { loadStatuses, recommendations, type FormulaStatus } from './masteryData';

interface Data {
  formulas: FormulaRow[];
  statuses: Map<string, FormulaStatus>;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FormulasPage() {
  const data = useLive(
    async (): Promise<Data> => {
      const formulas = await db.formulas.toArray();
      return { formulas, statuses: await loadStatuses(formulas) };
    },
    [],
    null as Data | null,
  );
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [mastery, setMastery] = useState('');
  const [creating, setCreating] = useState(false);
  const [packs, setPacks] = useState<boolean | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const needle = fold(q.trim());
    const shown = data.formulas
      .filter((f) => !category || f.category === category)
      .filter((f) => !tag || (f.tags ?? []).includes(tag))
      .filter((f) => !mastery || data.statuses.get(f.id)?.mastery.state === mastery)
      .filter(
        (f) =>
          !needle ||
          fold(
            [f.name, f.category, f.equation.plain, f.purpose, ...(f.tags ?? [])].join(' '),
          ).includes(needle),
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return {
      shown,
      categories: [...new Set(data.formulas.map((f) => f.category))].sort(),
      tags: [...new Set(data.formulas.flatMap((f) => f.tags ?? []))].sort(),
      recs: recommendations(data.formulas, data.statuses),
    };
  }, [data, q, category, tag, mastery]);
  if (!data || !view) return null;
  const showPacks = packs ?? data.formulas.length === 0;

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          className="search-box"
          style={{ flex: 1, minWidth: '12rem' }}
          placeholder="Search formulas"
          aria-label="Search formulas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn primary" onClick={() => setCreating(true)}>
          New formula
        </button>
        <button className="btn" aria-pressed={showPacks} onClick={() => setPacks(!showPacks)}>
          Packs
        </button>
      </div>
      {showPacks && <PackLoader onDone={() => setPacks(true)} />}

      {view.recs.length > 0 && (
        <section aria-label="Recommended for review">
          <h2>Recommended for review</h2>
          <ul className="row-list">
            {view.recs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link className="grow" to={`/study/formulas/${r.id}`}>
                  <strong>{r.name}</strong>
                  <div className="muted">{r.reason}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.formulas.length > 0 && (
        <div className="toolbar" style={{ marginTop: 16 }}>
          <label className="inline-field">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {view.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {view.tags.length > 0 && (
            <label className="inline-field">
              Tag
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All</option>
                {view.tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-field">
            Mastery
            <select value={mastery} onChange={(e) => setMastery(e.target.value)}>
              <option value="">All</option>
              {MASTERY_STATES.map((m) => (
                <option key={m} value={m}>
                  {MASTERY_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {data.formulas.length === 0 ? (
        <p className="empty">
          No formulas yet. Write your own with “New formula”, install a pack file (Packs), or turn
          on a Helper that comes with one.
        </p>
      ) : view.shown.length === 0 ? (
        <p className="empty">No formulas match.</p>
      ) : (
        <ul className="row-list" aria-label="Formulas">
          {view.shown.map((f) => (
            <li key={f.id}>
              <Link className="grow" to={`/study/formulas/${f.id}`}>
                <strong>{f.name}</strong>
                <div className="muted clip">
                  {f.category}
                  {f.origin === 'user' ? ' · yours' : ''} — {f.equation.plain}
                </div>
              </Link>
              <MasteryBadge state={data.statuses.get(f.id)?.mastery.state ?? 'not-studied'} />
            </li>
          ))}
        </ul>
      )}
      {creating && <FormulaEditor onClose={() => setCreating(false)} />}
    </>
  );
}
