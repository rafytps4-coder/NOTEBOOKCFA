import { useState } from 'react';
import { createUserFormula, updateUserFormula, parseTags, type FormulaRow } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { MathView } from './MathView';

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** Manual entry of your own formula (or editing one you made). There is no handwriting recognition. */
export function FormulaEditor(props: {
  formula?: FormulaRow;
  onClose: (savedId?: string) => void;
}) {
  const f = props.formula;
  const [name, setName] = useState(f?.name ?? '');
  const [category, setCategory] = useState(f?.category ?? '');
  const [latex, setLatex] = useState(f?.equation.latex ?? '');
  const [plain, setPlain] = useState(f?.equation.plain ?? '');
  const [vars, setVars] = useState(
    f?.variables.length
      ? f.variables.map((v) => ({
          symbol: v.symbol,
          name: v.name,
          description: v.description ?? '',
        }))
      : [{ symbol: '', name: '', description: '' }],
  );
  const [purpose, setPurpose] = useState(f?.purpose ?? '');
  const [whenToUse, setWhenToUse] = useState(f?.whenToUse ?? '');
  const [assumptions, setAssumptions] = useState((f?.assumptions ?? []).join('\n'));
  const [problem, setProblem] = useState(f?.workedExample.problem ?? '');
  const [steps, setSteps] = useState((f?.workedExample.steps ?? []).join('\n'));
  const [answer, setAnswer] = useState(f?.workedExample.answer ?? '');
  const [mistakes, setMistakes] = useState((f?.commonMistakes ?? []).join('\n'));
  const [tags, setTags] = useState((f?.tags ?? []).join(', '));
  const [difficulty, setDifficulty] = useState<FormulaRow['difficulty']>(
    f?.difficulty ?? 'intermediate',
  );

  const goodVars = vars.filter((v) => v.symbol.trim() && v.name.trim());
  const valid =
    name.trim() &&
    category.trim() &&
    latex.trim() &&
    plain.trim() &&
    goodVars.length &&
    purpose.trim() &&
    whenToUse.trim();

  async function save() {
    const input = {
      name: name.trim(),
      category: category.trim(),
      equation: { latex: latex.trim(), plain: plain.trim() },
      variables: goodVars.map((v) => ({
        symbol: v.symbol.trim(),
        name: v.name.trim(),
        ...(v.description.trim() ? { description: v.description.trim() } : {}),
      })),
      purpose: purpose.trim(),
      whenToUse: whenToUse.trim(),
      assumptions: lines(assumptions),
      workedExample: { problem: problem.trim(), steps: lines(steps), answer: answer.trim() },
      commonMistakes: lines(mistakes),
      tags: parseTags(tags),
      difficulty,
    };
    if (f) {
      await updateUserFormula(f.id, input);
      props.onClose(f.id);
    } else props.onClose((await createUserFormula(input)).id);
  }

  return (
    <Dialog title={f ? 'Edit formula' : 'New formula'} onClose={() => props.onClose()}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save();
        }}
      >
        <label className="field">
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="field">
          Equation (LaTeX)
          <input
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder="FV = PV\,(1+r)^{N}"
          />
        </label>
        {latex.trim() && <MathView latex={latex} plain={plain || latex} />}
        <label className="field">
          Equation in plain text (read aloud by screen readers)
          <input
            value={plain}
            onChange={(e) => setPlain(e.target.value)}
            placeholder="FV = PV * (1 + r)^N"
          />
        </label>
        <fieldset>
          <legend>Variables</legend>
          {vars.map((v, i) => (
            <div className="choice" key={i}>
              {(['symbol', 'name', 'description'] as const).map((k) => (
                <input
                  key={k}
                  aria-label={`Variable ${i + 1} ${k}`}
                  placeholder={k}
                  style={{ flex: k === 'symbol' ? '0 0 5rem' : 1, minWidth: 0 }}
                  value={v[k]}
                  onChange={(e) =>
                    setVars(vars.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                  }
                />
              ))}
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => setVars([...vars, { symbol: '', name: '', description: '' }])}
          >
            Add variable
          </button>
        </fieldset>
        <label className="field">
          What it’s for
          <textarea
            className="study-text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <label className="field">
          When to use it
          <textarea
            className="study-text"
            value={whenToUse}
            onChange={(e) => setWhenToUse(e.target.value)}
          />
        </label>
        <label className="field">
          Assumptions (one per line)
          <textarea
            className="study-text"
            value={assumptions}
            onChange={(e) => setAssumptions(e.target.value)}
          />
        </label>
        <label className="field">
          Worked example: problem
          <textarea
            className="study-text"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
          />
        </label>
        <label className="field">
          Worked example: steps (one per line)
          <textarea
            className="study-text"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </label>
        <label className="field">
          Worked example: answer
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </label>
        <label className="field">
          Common mistakes (one per line)
          <textarea
            className="study-text"
            value={mistakes}
            onChange={(e) => setMistakes(e.target.value)}
          />
        </label>
        <label className="field">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="field">
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as FormulaRow['difficulty'])}
          >
            <option value="foundational">Foundational</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <div className="btn-row end">
          <button type="button" className="btn" onClick={() => props.onClose()}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
