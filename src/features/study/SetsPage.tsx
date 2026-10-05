import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSet, db, type Flashcard, type StudySet } from '@/core';
import { countDue } from '@/engines/study';
import { PromptDialog } from '@/ui/Dialogs';
import { useLive } from '@/ui/useLive';

interface Row {
  set: StudySet;
  due: number;
  fresh: number;
  total: number;
}

export async function loadSetRows(now = Date.now()): Promise<Row[]> {
  const sets = await db.studySets.orderBy('updatedAt').reverse().toArray();
  const cards = await db.flashcards.toArray();
  const by = new Map<string, Flashcard[]>();
  for (const c of cards) by.set(c.setId, [...(by.get(c.setId) ?? []), c]);
  return sets.map((set) => {
    const n = countDue(by.get(set.id) ?? [], now);
    return { set, due: n.due, fresh: n.new, total: n.total };
  });
}

export function SetsPage() {
  const rows = useLive(() => loadSetRows(), [], null as Row[] | null);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setCreating(true)}>
          New set
        </button>
      </div>
      {rows === null ? null : rows.length === 0 ? (
        <p className="empty">
          No flashcard sets yet. Create a set, add cards, and study them with spaced repetition:
          cards you know come back less often, cards you miss come back soon.
        </p>
      ) : (
        <ul className="study-grid">
          {rows.map((r) => (
            <li key={r.set.id}>
              <Link className="study-card" to={`/study/set/${r.set.id}`}>
                <h3>{r.set.name}</h3>
                {r.set.description && <span className="muted">{r.set.description}</span>}
                <span className="counts">
                  <span className="badge">
                    <strong>{r.due}</strong> due
                  </span>
                  <span className="badge">
                    <strong>{r.fresh}</strong> new
                  </span>
                  <span className="badge">
                    <strong>{r.total}</strong> cards
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <PromptDialog
          title="New set"
          label="Name"
          confirmLabel="Create"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const s = await createSet(name);
            setCreating(false);
            nav(`/study/set/${s.id}`);
          }}
        />
      )}
    </>
  );
}
