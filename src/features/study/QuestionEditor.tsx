import { useState } from 'react';
import { deleteQuestion, parseTags, saveQuestion, type Difficulty, type Question } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/Dialogs';

export function QuestionEditor(props: { question?: Question; onClose: () => void }) {
  const q = props.question;
  const [kind, setKind] = useState<Question['kind']>(q?.kind ?? 'multiple-choice');
  const [prompt, setPrompt] = useState(q?.prompt ?? '');
  const [choices, setChoices] = useState<string[]>(q?.choices.length ? q.choices : ['', '', '']);
  const [correct, setCorrect] = useState<number>(q?.correctIndex ?? 0);
  const [answer, setAnswer] = useState(q?.answer ?? '');
  const [explanation, setExplanation] = useState(q?.explanation ?? '');
  const [tags, setTags] = useState(q?.tags.join(', ') ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(q?.difficulty ?? 'medium');
  const [confirming, setConfirming] = useState(false);

  const filled = choices.map((c) => c.trim());
  const valid =
    prompt.trim() &&
    (kind === 'short-answer'
      ? answer.trim()
      : filled.filter(Boolean).length >= 2 && !!filled[correct]);

  async function save() {
    // Keep only filled choices, and move the correct index with them.
    const kept = filled.map((c, i) => ({ c, i })).filter((x) => x.c);
    await saveQuestion({
      id: q?.id,
      kind,
      prompt: prompt.trim(),
      choices: kind === 'multiple-choice' ? kept.map((x) => x.c) : [],
      correctIndex: kind === 'multiple-choice' ? kept.findIndex((x) => x.i === correct) : null,
      answer: kind === 'short-answer' ? answer.trim() : '',
      explanation: explanation.trim(),
      tags: parseTags(tags),
      difficulty,
      formulaId: q?.formulaId ?? null,
    });
    props.onClose();
  }

  return (
    <Dialog title={q ? 'Edit question' : 'New question'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save();
        }}
      >
        <label className="field">
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as Question['kind'])}>
            <option value="multiple-choice">Multiple choice</option>
            <option value="short-answer">Short answer</option>
          </select>
        </label>
        <label className="field">
          Question
          <textarea
            className="study-text"
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        {kind === 'multiple-choice' ? (
          <fieldset>
            <legend>Choices (select the correct one)</legend>
            {choices.map((c, i) => (
              <div className="choice" key={i}>
                <input
                  type="radio"
                  name="correct"
                  checked={correct === i}
                  onChange={() => setCorrect(i)}
                  aria-label={`Choice ${i + 1} is correct`}
                />
                <input
                  value={c}
                  onChange={(e) =>
                    setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  aria-label={`Choice ${i + 1}`}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
            <button type="button" className="btn" onClick={() => setChoices([...choices, ''])}>
              Add choice
            </button>
          </fieldset>
        ) : (
          <label className="field">
            Correct answer
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
        )}
        <label className="field">
          Explanation (optional)
          <textarea
            className="study-text"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </label>
        <label className="field">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="field">
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <div className="btn-row end">
          {q && (
            <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
      {confirming && q && (
        <ConfirmDialog
          title="Delete this question?"
          message="Its quiz results are removed. Mistakes you logged keep their text."
          confirmLabel="Delete question"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteQuestion(q.id);
            props.onClose();
          }}
        />
      )}
    </Dialog>
  );
}
