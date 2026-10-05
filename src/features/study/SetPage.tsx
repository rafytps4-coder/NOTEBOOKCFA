import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, deleteSet, updateSet, type Flashcard } from '@/core';
import { computeStats, countDue } from '@/engines/study';
import { ConfirmDialog, PromptDialog } from '@/ui/Dialogs';
import { useLive } from '@/ui/useLive';
import { CardEditor } from './CardEditor';

function when(t: number | null): string {
  if (t === null) return '—';
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export function SetPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useLive(
    async () => ({
      set: (await db.studySets.get(id)) ?? null,
      cards: await db.flashcards.where('setId').equals(id).toArray(),
      logs: await db.reviewLogs.where('setId').equals(id).toArray(),
    }),
    [id],
    null,
  );
  const [editing, setEditing] = useState<Flashcard | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tag, setTag] = useState('');
  if (!data) return null;
  if (!data.set)
    return (
      <p className="empty">
        That set no longer exists. <Link to="/study">Back to sets</Link>
      </p>
    );
  const { set, cards, logs } = data;
  const now = Date.now();
  const counts = countDue(cards, now);
  const stats = computeStats(logs, now);
  const allTags = [...new Set(cards.flatMap((c) => c.tags))].sort();
  const shown = (tag ? cards.filter((c) => c.tags.includes(tag)) : cards).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const studyable = counts.due + counts.new;

  return (
    <>
      <p className="crumbs">
        <Link to="/study">Flashcards</Link> / {set.name}
      </p>
      <h2>{set.name}</h2>
      {set.description && <p className="muted">{set.description}</p>}
      <div className="toolbar">
        <Link
          className={`btn primary${studyable ? '' : ' disabled'}`}
          aria-disabled={!studyable}
          to={`/study/set/${id}/review`}
          onClick={(e) => !studyable && e.preventDefault()}
        >
          Study now ({counts.due} due, {counts.new} new)
        </Link>
        <button className="btn" onClick={() => setEditing('new')}>
          Add card
        </button>
        <button className="btn" onClick={() => setRenaming(true)}>
          Rename
        </button>
        <button className="btn danger" onClick={() => setDeleting(true)}>
          Delete set
        </button>
      </div>
      <dl className="stats" aria-label="Set statistics">
        <div>
          <dt>Cards</dt>
          <dd>{cards.length}</dd>
        </div>
        <div>
          <dt>Reviews</dt>
          <dd>{stats.reviews}</dd>
        </div>
        <div>
          <dt>Remembered</dt>
          <dd>{stats.retention === null ? '—' : `${Math.round(stats.retention * 100)}%`}</dd>
        </div>
        <div>
          <dt>Last 7 days</dt>
          <dd>{stats.last7Days}</dd>
        </div>
        <div>
          <dt>Day streak</dt>
          <dd>{stats.streakDays}</dd>
        </div>
        <div>
          <dt>Last studied</dt>
          <dd style={{ fontSize: '1rem' }}>{when(stats.lastStudiedAt)}</dd>
        </div>
      </dl>
      {stats.reviews === 0 && (
        <p className="muted">
          Statistics appear after your first review. Nothing here is estimated.
        </p>
      )}
      {allTags.length > 0 && (
        <label className="inline-field" style={{ margin: '12px 0' }}>
          Filter by tag
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All cards</option>
            {allTags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}
      {cards.length === 0 ? (
        <p className="empty">No cards yet. Add one, or create cards from a notebook selection.</p>
      ) : (
        <ul className="row-list" aria-label="Cards">
          {shown.map((c) => (
            <li key={c.id}>
              <div className="grow">
                <div className="clip">{c.front.text || '(image)'}</div>
                <div className="muted clip">{c.back.text || '(image)'}</div>
                {c.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
              <span className="badge">
                {c.sched.phase === 'new'
                  ? 'new'
                  : c.sched.due <= now
                    ? 'due'
                    : `in ${Math.max(1, Math.round((c.sched.due - now) / 86_400_000))} d`}
              </span>
              {c.sourceRef && (
                <Link
                  className="btn"
                  to={`/doc/${c.sourceRef.documentId}?page=${c.sourceRef.pageId}`}
                  aria-label="Open the notebook page this card came from"
                >
                  Source
                </Link>
              )}
              <button className="btn" onClick={() => setEditing(c)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CardEditor
          setId={id}
          card={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename set"
          label="Name"
          initial={set.name}
          confirmLabel="Rename"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            await updateSet(id, { name });
            setRenaming(false);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${set.name}”?`}
          message={`This removes the set, its ${cards.length} card${cards.length === 1 ? '' : 's'} and ${logs.length} review${logs.length === 1 ? '' : 's'} of history. This can’t be undone. Export a backup first if unsure.`}
          confirmLabel="Delete set"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteSet(id);
            nav('/study');
          }}
        />
      )}
    </>
  );
}
