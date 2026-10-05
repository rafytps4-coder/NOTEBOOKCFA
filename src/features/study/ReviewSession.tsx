import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  db,
  finishSession,
  reviewCard,
  startSession,
  type Flashcard,
  type StudySession,
} from '@/core';
import { buildQueue, sm2, type Rating } from '@/engines/study';
import { CardImage } from './useStudyImage';

const LABEL: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const ORDER: Rating[] = ['again', 'hard', 'good', 'easy'];

/** One card at a time. Space/Enter flips; 1–4 rate. Cards answered "Again" return this session. */
export function ReviewSession() {
  const { id = '' } = useParams();
  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState({
    answered: 0,
    correct: 0,
    ratings: { again: 0, hard: 0, good: 0, easy: 0 },
  });
  const [name, setName] = useState('');
  const session = useRef<StudySession | null>(null);
  const shownAt = useRef(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const set = await db.studySets.get(id);
      const cards = await db.flashcards.where('setId').equals(id).toArray();
      const q = buildQueue(cards, Date.now());
      if (!live) return;
      setName(set?.name ?? '');
      setQueue(q);
      setTotal(q.length);
      if (q.length) session.current = await startSession('cards', id);
      shownAt.current = Date.now();
    })();
    return () => {
      live = false;
    };
  }, [id]);

  const current = queue?.[0];
  const done = queue !== null && queue.length === 0;

  const rate = useCallback(
    async (rating: Rating) => {
      if (!queue?.length || busy.current) return;
      busy.current = true;
      const card = queue[0]!;
      const updated = await reviewCard(card, rating, {
        sessionId: session.current?.id ?? null,
        durationMs: Date.now() - shownAt.current,
      });
      const rest = queue.slice(1);
      // A card you got wrong (or are still learning) comes back at the end of this session.
      const next = updated.sched.phase === 'learning' ? [...rest, updated] : rest;
      const s = {
        answered: stats.answered + 1,
        correct: stats.correct + (rating === 'again' ? 0 : 1),
        ratings: { ...stats.ratings, [rating]: stats.ratings[rating] + 1 },
      };
      setStats(s);
      setQueue(next);
      setShown(false);
      shownAt.current = Date.now();
      if (!next.length && session.current)
        await finishSession(session.current.id, s.answered, s.correct);
      busy.current = false;
    },
    [queue, stats],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,dialog')) return;
      if (!current) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown && '1234'.includes(e.key) && e.key.length === 1)
        void rate(ORDER[Number(e.key) - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, shown, rate]);

  if (queue === null) return null;
  if (total === 0)
    return (
      <div className="review">
        <p className="empty">
          Nothing is due in this set right now. Come back later, or add cards.
        </p>
        <Link className="btn" to={`/study/set/${id}`}>
          Back to set
        </Link>
      </div>
    );
  if (done) {
    const pct = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
    return (
      <div className="review">
        <h2>Session complete</h2>
        <dl className="stats">
          <div>
            <dt>Answers</dt>
            <dd>{stats.answered}</dd>
          </div>
          <div>
            <dt>Remembered</dt>
            <dd>{pct}%</dd>
          </div>
          <div>
            <dt>Again</dt>
            <dd>{stats.ratings.again}</dd>
          </div>
          <div>
            <dt>Hard</dt>
            <dd>{stats.ratings.hard}</dd>
          </div>
          <div>
            <dt>Good</dt>
            <dd>{stats.ratings.good}</dd>
          </div>
          <div>
            <dt>Easy</dt>
            <dd>{stats.ratings.easy}</dd>
          </div>
        </dl>
        <Link className="btn primary" to={`/study/set/${id}`}>
          Back to {name || 'set'}
        </Link>
      </div>
    );
  }
  const preview = sm2.preview(current!.sched, Date.now());
  const answered = Math.max(0, total - new Set(queue.map((c) => c.id)).size);
  return (
    <div className="review">
      <p className="crumbs">
        <Link to={`/study/set/${id}`}>{name}</Link> · {queue.length} left
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label="Session progress"
      >
        <div style={{ width: `${(answered / total) * 100}%` }} />
      </div>
      <div className="review-card" aria-live="polite">
        <div>{current!.front.text}</div>
        <CardImage id={current!.front.imageId} alt="Front of card" />
        {shown && (
          <>
            <hr />
            <div>{current!.back.text}</div>
            <CardImage id={current!.back.imageId} alt="Back of card" />
          </>
        )}
      </div>
      {!shown ? (
        <button
          className="btn primary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => setShown(true)}
        >
          Show answer (Space)
        </button>
      ) : (
        <div className="rating-row" role="group" aria-label="How well did you remember?">
          {ORDER.map((r, i) => (
            <button key={r} className="btn" onClick={() => void rate(r)}>
              {LABEL[r]} ({i + 1})<small>{preview[r]}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
