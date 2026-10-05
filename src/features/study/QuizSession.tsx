import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  correctAnswerText,
  db,
  finishSession,
  isCorrectAnswer,
  recordQuizResult,
  startSession,
  type Question,
  type StudySession,
} from '@/core';
import { MistakeEditor } from './MistakeEditor';

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

interface Answered {
  q: Question;
  given: string;
  correct: boolean;
}

export function QuizSession() {
  const [params] = useSearchParams();
  const tag = params.get('tag');
  const difficulty = params.get('difficulty');
  const [items, setItems] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Answered | null>(null);
  const [results, setResults] = useState<Answered[]>([]);
  const [logging, setLogging] = useState<Answered | null>(null);
  const session = useRef<StudySession | null>(null);

  useEffect(() => {
    void (async () => {
      let qs = await db.questions.toArray();
      if (tag) qs = qs.filter((q) => q.tags.includes(tag));
      if (difficulty) qs = qs.filter((q) => q.difficulty === difficulty);
      qs = shuffle(qs);
      setItems(qs);
      if (qs.length) session.current = await startSession('quiz', null);
    })();
  }, [tag, difficulty]);

  if (!items) return null;
  if (!items.length)
    return (
      <p className="empty">
        No questions match. <Link to="/study/questions">Back to questions</Link>
      </p>
    );

  const q = items[i];
  if (!q) {
    const right = results.filter((r) => r.correct).length;
    return (
      <div className="review">
        <h2>Quiz complete</h2>
        <dl className="stats">
          <div>
            <dt>Questions</dt>
            <dd>{results.length}</dd>
          </div>
          <div>
            <dt>Correct</dt>
            <dd>{right}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{results.length ? Math.round((right / results.length) * 100) : 0}%</dd>
          </div>
        </dl>
        <Link className="btn primary" to="/study/questions">
          Back to questions
        </Link>
      </div>
    );
  }

  async function submit() {
    if (!q || feedback) return;
    const given = q.kind === 'multiple-choice' ? (q.choices[choice ?? -1] ?? '') : text;
    const correct = isCorrectAnswer(q, q.kind === 'multiple-choice' ? (choice ?? -1) : text);
    await recordQuizResult(q, given, correct, session.current?.id ?? null);
    const a = { q, given, correct };
    setResults([...results, a]);
    setFeedback(a);
  }

  async function next() {
    setFeedback(null);
    setChoice(null);
    setText('');
    const ni = i + 1;
    setI(ni);
    if (ni >= items!.length && session.current) {
      await finishSession(
        session.current.id,
        results.length,
        results.filter((r) => r.correct).length,
      );
    }
  }

  return (
    <div className="review">
      <p className="crumbs">
        <Link to="/study/questions">Questions</Link> · {i + 1} of {items.length}
      </p>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${(i / items.length) * 100}%` }} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="review-card" style={{ minHeight: 0 }}>
          <div>{q.prompt}</div>
        </div>
        {q.kind === 'multiple-choice' ? (
          <fieldset disabled={!!feedback} style={{ border: 0, padding: 0 }}>
            <legend className="sr-only">Choices</legend>
            {q.choices.map((c, idx) => (
              <label
                key={idx}
                className={`choice${feedback ? (idx === q.correctIndex ? ' right' : idx === choice ? ' wrong' : '') : ''}`}
              >
                <input
                  type="radio"
                  name="choice"
                  checked={choice === idx}
                  onChange={() => setChoice(idx)}
                />
                {c}
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="field" style={{ marginTop: 12 }}>
            Your answer
            <input
              value={text}
              disabled={!!feedback}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </label>
        )}
        {!feedback ? (
          <button
            className="btn primary"
            type="submit"
            style={{ marginTop: 12 }}
            disabled={q.kind === 'multiple-choice' ? choice === null : !text.trim()}
          >
            Check answer
          </button>
        ) : (
          <div role="status" style={{ marginTop: 12 }}>
            <p>
              <strong>{feedback.correct ? 'Correct.' : 'Not quite.'}</strong>{' '}
              {!feedback.correct && <>The answer is: {correctAnswerText(q)}</>}
            </p>
            {q.explanation && <p className="muted">{q.explanation}</p>}
            <div className="btn-row">
              {!feedback.correct && (
                <button type="button" className="btn" onClick={() => setLogging(feedback)}>
                  Log this mistake
                </button>
              )}
              <button type="button" className="btn primary" autoFocus onClick={() => void next()}>
                {i + 1 >= items.length ? 'Finish' : 'Next question'}
              </button>
            </div>
          </div>
        )}
      </form>
      {logging && (
        <MistakeEditor
          seed={{
            questionId: logging.q.id,
            questionText: logging.q.prompt,
            userAnswer: logging.given,
            correctAnswer: correctAnswerText(logging.q),
            tags: logging.q.tags,
            formulaId: logging.q.formulaId,
          }}
          onClose={() => setLogging(null)}
        />
      )}
    </div>
  );
}
