import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  QuestionImportError,
  db,
  exportQuestionsJson,
  importQuestionsJson,
  type Question,
} from '@/core';
import { saveBlob } from '@/ui/saveFile';
import { useLive } from '@/ui/useLive';
import { QuestionEditor } from './QuestionEditor';

export function QuestionsPage() {
  const questions = useLive(
    () => db.questions.orderBy('updatedAt').reverse().toArray(),
    [],
    null as Question[] | null,
  );
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  const [tag, setTag] = useState('');
  const [diff, setDiff] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!questions) return null;
  const tags = [...new Set(questions.flatMap((q) => q.tags))].sort();
  const shown = questions.filter(
    (q) => (!tag || q.tags.includes(tag)) && (!diff || q.difficulty === diff),
  );
  const qs = new URLSearchParams();
  if (tag) qs.set('tag', tag);
  if (diff) qs.set('difficulty', diff);

  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setEditing('new')}>
          New question
        </button>
        <Link
          className={`btn${shown.length ? '' : ' disabled'}`}
          aria-disabled={!shown.length}
          to={`/study/quiz?${qs}`}
          onClick={(e) => !shown.length && e.preventDefault()}
        >
          Start quiz ({shown.length})
        </Link>
        <button
          className="btn"
          disabled={!questions.length}
          onClick={async () =>
            saveBlob(
              new Blob([await exportQuestionsJson()], { type: 'application/json' }),
              'notebook-questions.json',
            )
          }
        >
          Export JSON
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          Import JSON
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Choose a question file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const n = await importQuestionsJson(await f.text());
              setMsg({ text: `Imported ${n} question${n === 1 ? '' : 's'}.` });
            } catch (err) {
              setMsg({
                text:
                  err instanceof QuestionImportError
                    ? err.message
                    : 'That file could not be read. Nothing was added.',
                error: true,
              });
            }
          }}
        />
      </div>
      {msg && (
        <p role="status" className={msg.error ? 'error' : 'muted'}>
          {msg.text}
        </p>
      )}
      {questions.length > 0 && (
        <div className="toolbar">
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
            Difficulty
            <select value={diff} onChange={(e) => setDiff(e.target.value)}>
              <option value="">All</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>
      )}
      {questions.length === 0 ? (
        <p className="empty">
          No questions yet. Write your own multiple-choice or short-answer questions, then quiz
          yourself. Wrong answers can be added to your mistake log.
        </p>
      ) : (
        <ul className="row-list" aria-label="Questions">
          {shown.map((q) => (
            <li key={q.id}>
              <div className="grow">
                <div className="clip">{q.prompt}</div>
                <span className="tag">
                  {q.kind === 'multiple-choice' ? 'multiple choice' : 'short answer'}
                </span>
                <span className="tag">{q.difficulty}</span>
                {q.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
              <button className="btn" onClick={() => setEditing(q)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <QuestionEditor
          question={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
