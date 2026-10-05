import { useEffect, useState } from 'react';
import { addCard, createSet, db, parseTags, type FormulaRow, type StudySet } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { useLive } from '@/ui/useLive';

/** Make a flashcard about a formula. The card stays linked, so studying it moves mastery. */
export function FormulaCardDialog({
  formula,
  onClose,
}: {
  formula: FormulaRow;
  onClose: () => void;
}) {
  const sets = useLive(
    () => db.studySets.orderBy('updatedAt').reverse().toArray(),
    [],
    [] as StudySet[],
  );
  const [setId, setSetId] = useState('');
  const [newName, setNewName] = useState('');
  const [front, setFront] = useState(`${formula.name}: write the formula`);
  const [back, setBack] = useState(`${formula.equation.plain}\n\n${formula.purpose}`);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!setId && sets.length) setSetId(sets[0]!.id);
  }, [sets, setId]);
  const creating = setId === '' || setId === '__new';
  const valid = front.trim() && back.trim() && (!creating || newName.trim());

  if (done)
    return (
      <Dialog title="Flashcard created" onClose={onClose}>
        <p>The card was added to your set and linked to this formula.</p>
        <div className="btn-row end">
          <button className="btn primary" autoFocus onClick={onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );
  return (
    <Dialog title="Create flashcard" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          const target = creating ? (await createSet(newName.trim())).id : setId;
          await addCard({
            setId: target,
            front: { text: front.trim(), imageId: null },
            back: { text: back.trim(), imageId: null },
            tags: parseTags((formula.tags ?? []).join(',')),
            formulaId: formula.id,
          });
          setDone(true);
        }}
      >
        <label className="field">
          Set
          <select value={creating ? '__new' : setId} onChange={(e) => setSetId(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new">New set…</option>
          </select>
        </label>
        {creating && (
          <label className="field">
            New set name
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
        )}
        <label className="field">
          Front
          <textarea
            className="study-text"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
        </label>
        <label className="field">
          Back
          <textarea className="study-text" value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Create card
          </button>
        </div>
      </form>
    </Dialog>
  );
}
