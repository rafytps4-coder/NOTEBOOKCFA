import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MISTAKE_CATEGORIES, db, setMistakeReviewed, type Mistake } from '@/core';
import { categoryLabel, weakAreasByTag } from '@/engines/study';
import { useLive } from '@/ui/useLive';
import { MistakeEditor } from './MistakeEditor';

export function MistakesPage() {
  const all = useLive(
    () => db.mistakes.orderBy('createdAt').reverse().toArray(),
    [],
    null as Mistake[] | null,
  );
  const [editing, setEditing] = useState<Mistake | 'new' | null>(null);
  const [cat, setCat] = useState('');
  const [tag, setTag] = useState('');
  const [state, setState] = useState<'all' | 'unreviewed' | 'reviewed'>('all');
  if (!all) return null;
  const tags = [...new Set(all.flatMap((m) => m.tags))].sort();
  const shown = all.filter(
    (m) =>
      (!cat || m.category === cat) &&
      (!tag || m.tags.includes(tag)) &&
      (state === 'all' || (state === 'reviewed') === m.reviewed),
  );
  const weak = weakAreasByTag(all).slice(0, 5);
  const unreviewed = all.filter((m) => !m.reviewed).length;

  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setEditing('new')}>
          Log a mistake
        </button>
        <Link
          className={`btn${unreviewed ? '' : ' disabled'}`}
          aria-disabled={!unreviewed}
          to="/study/mistakes/review"
          onClick={(e) => !unreviewed && e.preventDefault()}
        >
          Review mistakes ({unreviewed})
        </Link>
      </div>
      {all.length > 0 && (
        <>
          <h2>Weak areas</h2>
          <p className="muted">Counted from the mistakes you logged, by tag.</p>
          <ul className="row-list" aria-label="Weak areas by tag">
            {weak.map((w) => (
              <li key={w.tag}>
                <span className="grow">{w.tag}</span>
                <span className="badge">{w.mistakes} mistakes</span>
                <span className="badge">{w.unreviewed} to review</span>
              </li>
            ))}
          </ul>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <label className="inline-field">
              Reason
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">All</option>
                {MISTAKE_CATEGORIES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              Tag
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              Show
              <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
                <option value="all">All</option>
                <option value="unreviewed">Not reviewed</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </label>
          </div>
        </>
      )}
      {all.length === 0 ? (
        <p className="empty">
          No mistakes logged. Log one here, or from a quiz when you get a question wrong. Over time
          this shows where you slip up most.
        </p>
      ) : (
        <ul className="row-list" aria-label="Mistakes">
          {shown.map((m) => (
            <li key={m.id}>
              <div className="grow">
                <div className="clip">{m.questionText}</div>
                <div className="muted clip">
                  You: {m.userAnswer || '—'} · Correct: {m.correctAnswer || '—'}
                </div>
                <span className="tag">{categoryLabel(m.category)}</span>
                {m.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                <span className="tag">{new Date(m.createdAt).toLocaleDateString()}</span>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={m.reviewed}
                  onChange={(e) => void setMistakeReviewed(m.id, e.target.checked)}
                />
                Reviewed
              </label>
              <button className="btn" onClick={() => setEditing(m)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <MistakeEditor
          mistake={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
