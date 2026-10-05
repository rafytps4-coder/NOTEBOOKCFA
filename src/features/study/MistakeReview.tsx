import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  db,
  finishSession,
  setMistakeReviewed,
  startSession,
  type Mistake,
  type StudySession,
} from '@/core';
import { categoryLabel } from '@/engines/study';

/** Go through unreviewed mistakes one by one; each is marked reviewed when you move on. */
export function MistakeReview() {
  const [items, setItems] = useState<Mistake[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const session = useRef<StudySession | null>(null);

  useEffect(() => {
    void (async () => {
      const list = (await db.mistakes.toArray())
        .filter((m) => !m.reviewed)
        .sort((a, b) => a.createdAt - b.createdAt);
      setItems(list);
      if (list.length) session.current = await startSession('mistakes', null);
    })();
  }, []);

  if (!items) return null;
  if (!items.length)
    return (
      <p className="empty">
        No mistakes waiting for review. <Link to="/study/mistakes">Back to mistakes</Link>
      </p>
    );
  const m = items[i];
  if (!m)
    return (
      <div className="review">
        <h2>All reviewed</h2>
        <p>
          You went through {items.length} mistake{items.length === 1 ? '' : 's'}.
        </p>
        <Link className="btn primary" to="/study/mistakes">
          Back to mistakes
        </Link>
      </div>
    );
  async function next() {
    await setMistakeReviewed(m!.id, true);
    setShown(false);
    setI(i + 1);
    if (i + 1 >= items!.length && session.current)
      await finishSession(session.current.id, items!.length, items!.length);
  }
  return (
    <div className="review">
      <p className="crumbs">
        <Link to="/study/mistakes">Mistakes</Link> · {i + 1} of {items.length}
      </p>
      <div className="review-card">
        <div>{m.questionText}</div>
        <span className="tag">{categoryLabel(m.category)}</span>
        {shown && (
          <>
            <hr />
            <div>Your answer: {m.userAnswer || '—'}</div>
            <div>Correct answer: {m.correctAnswer || '—'}</div>
            {m.notes && <div className="muted">{m.notes}</div>}
          </>
        )}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        {!shown ? (
          <button className="btn primary" onClick={() => setShown(true)}>
            Show answer
          </button>
        ) : (
          <button className="btn primary" autoFocus onClick={() => void next()}>
            Mark reviewed &amp; next
          </button>
        )}
      </div>
    </div>
  );
}
