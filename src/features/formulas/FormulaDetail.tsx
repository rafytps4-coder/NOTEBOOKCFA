import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, deleteUserFormula, saveFormulaNotes, type FormulaRow } from '@/core';
import { MASTERY_LABEL } from '@/engines/formula';
import { ConfirmDialog } from '@/ui/Dialogs';
import { useLive } from '@/ui/useLive';
import { QuestionEditor } from '../study/QuestionEditor';
import { FormulaCardDialog } from './FormulaCardDialog';
import { FormulaEditor } from './FormulaEditor';
import { MasteryBadge } from './MasteryBadge';
import { MathView } from './MathView';
import { loadStatuses, recommendations, type FormulaStatus } from './masteryData';

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}

function Notes({ id }: { id: string }) {
  const saved = useLive(
    async () => (await db.formulaProgress.get(id))?.notes ?? '',
    [id],
    null as string | null,
  );
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (saved !== null && text === null) setText(saved);
  }, [saved, text]);
  useEffect(() => setText(null), [id]);
  // Autosave shortly after typing stops.
  useEffect(() => {
    if (text === null || text === saved) return;
    const t = window.setTimeout(() => void saveFormulaNotes(id, text), 500);
    return () => window.clearTimeout(t);
  }, [text, saved, id]);
  return (
    <label className="field">
      <h3 style={{ margin: 0 }}>Your notes</h3>
      <textarea
        className="study-text"
        value={text ?? ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== null && text !== saved && void saveFormulaNotes(id, text)}
        placeholder="Your own reminders, tricks, mistakes to avoid"
      />
      <span className="muted">
        Saved automatically. Kept separately from the pack, so updates never overwrite it.
      </span>
    </label>
  );
}

export function FormulaDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useLive(
    async () => {
      const formula = (await db.formulas.get(id)) ?? null;
      const all = await db.formulas.toArray();
      const statuses = await loadStatuses(all);
      return { formula, all, statuses };
    },
    [id],
    null,
  );
  const [dlg, setDlg] = useState<'card' | 'question' | 'edit' | 'delete' | null>(null);
  if (!data) return null;
  const { formula: f, all, statuses } = data;
  if (!f)
    return (
      <p className="empty">
        That formula isn’t in your library. <Link to="/study/formulas">Back to formulas</Link>
      </p>
    );
  const status: FormulaStatus | undefined = statuses.get(f.id);
  const rec = recommendations([f], statuses)[0];
  const related = (f.relatedFormulaIds ?? [])
    .map((rid) => all.find((x) => x.id === rid))
    .filter((x): x is FormulaRow => !!x);
  const v0 = f.variables[0];
  const seed = {
    kind: 'short-answer' as const,
    prompt: v0
      ? `In ${f.equation.plain}, what does ${v0.symbol} stand for?`
      : `Name the formula: ${f.equation.plain}`,
    answer: v0 ? v0.name : f.name,
    choices: [],
    correctIndex: null,
    explanation: f.purpose,
    tags: f.tags ?? [],
    difficulty: 'medium' as const,
    formulaId: f.id,
  };

  return (
    <article>
      <p className="crumbs">
        <Link to="/study/formulas">Formulas</Link> / {f.category}
      </p>
      <h2>{f.name}</h2>
      <div className="counts">
        <MasteryBadge state={status?.mastery.state ?? 'not-studied'} />
        <span className="badge">{f.difficulty}</span>
        {f.origin === 'user' && <span className="badge">yours</span>}
      </div>
      {status && status.mastery.state !== 'not-studied' && (
        <p className="muted" aria-label="Mastery details">
          {status.mastery.answers} answer{status.mastery.answers === 1 ? '' : 's'} so far, accuracy{' '}
          {Math.round((status.mastery.accuracy ?? 0) * 100)}% over the last{' '}
          {Math.min(10, status.mastery.answers)}.{rec ? ` ${rec.reason}.` : ''} Mastery comes only
          from your flashcards, quiz answers and logged mistakes linked to this formula.
        </p>
      )}
      {status?.mastery.state === 'not-studied' && (
        <p className="muted">
          Not studied yet. Make a flashcard or practice question below; mastery then follows how you
          answer.
        </p>
      )}

      <MathView latex={f.equation.latex} plain={f.equation.plain} />
      <p>
        <span className="muted">In plain text: </span>
        <code>{f.equation.plain}</code>
      </p>

      <div className="btn-row">
        <button className="btn primary" onClick={() => setDlg('card')}>
          Create flashcard
        </button>
        <button className="btn" onClick={() => setDlg('question')}>
          Create practice question
        </button>
        {f.origin === 'user' && (
          <>
            <button className="btn" onClick={() => setDlg('edit')}>
              Edit
            </button>
            <button className="btn danger" onClick={() => setDlg('delete')}>
              Delete
            </button>
          </>
        )}
      </div>
      {status && (status.cards > 0 || status.questions > 0) && (
        <p className="muted">
          Linked: {status.cards} flashcard{status.cards === 1 ? '' : 's'} ({status.dueCards} due),{' '}
          {status.questions} question
          {status.questions === 1 ? '' : 's'}.
        </p>
      )}

      <h3>Variables</h3>
      <table className="var-table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Meaning</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {f.variables.map((v) => (
            <tr key={v.symbol}>
              <th scope="row">
                <code>{v.symbol}</code>
              </th>
              <td>{v.name}</td>
              <td>{[v.description, v.unit && `unit: ${v.unit}`].filter(Boolean).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>What it’s for</h3>
      <p>{f.purpose}</p>
      <h3>When to use it</h3>
      <p>{f.whenToUse}</p>
      <List title="Assumptions" items={f.assumptions} />
      {f.workedExample.problem && (
        <>
          <h3>Worked example</h3>
          <p>{f.workedExample.problem}</p>
          <ol>
            {f.workedExample.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p>
            <strong>Answer:</strong> {f.workedExample.answer}
          </p>
        </>
      )}
      <List title="Common mistakes" items={f.commonMistakes} />
      {related.length > 0 && (
        <>
          <h3>Related formulas</h3>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <Link to={`/study/formulas/${r.id}`}>{r.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {(f.tags?.length ?? 0) > 0 && (
        <p>
          {f.tags!.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </p>
      )}
      <Notes id={f.id} />
      <p className="muted" style={{ marginTop: 12 }}>
        Mastery scale: {Object.values(MASTERY_LABEL).slice(0).join(' → ')}.
      </p>

      {dlg === 'card' && <FormulaCardDialog formula={f} onClose={() => setDlg(null)} />}
      {dlg === 'question' && <QuestionEditor seed={seed} onClose={() => setDlg(null)} />}
      {dlg === 'edit' && <FormulaEditor formula={f} onClose={() => setDlg(null)} />}
      {dlg === 'delete' && (
        <ConfirmDialog
          title={`Delete “${f.name}”?`}
          message="Your formula and its notes are removed. Flashcards and questions you made from it keep their text but lose the link. This can’t be undone."
          confirmLabel="Delete formula"
          danger
          onClose={() => setDlg(null)}
          onConfirm={async () => {
            await deleteUserFormula(f.id);
            nav('/study/formulas');
          }}
        />
      )}
    </article>
  );
}
