import { useState } from 'react';
import {
  MISTAKE_CATEGORIES,
  deleteMistake,
  parseTags,
  saveMistake,
  type Mistake,
  type MistakeCategory,
} from '@/core';
import { Dialog } from '@/ui/Dialog';

/** Create or edit a mistake. `seed` pre-fills a new one (e.g. from a wrong quiz answer). */
export function MistakeEditor(props: {
  mistake?: Mistake;
  seed?: Partial<Omit<Mistake, 'id'>>;
  onClose: () => void;
}) {
  const m = props.mistake;
  const init = { ...props.seed, ...m };
  const [questionText, setQuestionText] = useState(init.questionText ?? '');
  const [userAnswer, setUserAnswer] = useState(init.userAnswer ?? '');
  const [correctAnswer, setCorrectAnswer] = useState(init.correctAnswer ?? '');
  const [category, setCategory] = useState<MistakeCategory>(init.category ?? 'concept');
  const [notes, setNotes] = useState(init.notes ?? '');
  const [tags, setTags] = useState((init.tags ?? []).join(', '));

  return (
    <Dialog title={m ? 'Edit mistake' : 'Log a mistake'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveMistake({
            id: m?.id,
            questionId: init.questionId ?? null,
            formulaId: init.formulaId ?? null,
            questionText: questionText.trim(),
            userAnswer: userAnswer.trim(),
            correctAnswer: correctAnswer.trim(),
            category,
            notes: notes.trim(),
            tags: parseTags(tags),
          });
          props.onClose();
        }}
      >
        <label className="field">
          Question
          <textarea
            className="study-text"
            autoFocus
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
        </label>
        <label className="field">
          Your answer
          <input value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} />
        </label>
        <label className="field">
          Correct answer
          <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
        </label>
        <label className="field">
          Why did it go wrong?
          <select value={category} onChange={(e) => setCategory(e.target.value as MistakeCategory)}>
            {MISTAKE_CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Notes
          <textarea
            className="study-text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="field">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <div className="btn-row end">
          {m && (
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await deleteMistake(m.id);
                props.onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!questionText.trim()}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
