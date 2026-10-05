import { useEffect, useState } from 'react';
import { addCard, addStudyImage, createSet, db, parseTags, type StudySet } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { useLive } from '@/ui/useLive';

export interface SelectionDraft {
  documentId: string;
  pageId: string;
  /** Text from selected text boxes. */
  text: string;
  /** Snapshot of the selected region. */
  snapshot: Blob | null;
}

type Where = 'front' | 'back' | 'none';

/** "Create flashcard" from a notebook selection. Handwriting can't be read, so it stays an image. */
export function CreateFromSelection(props: { draft: SelectionDraft; onClose: () => void }) {
  const { draft } = props;
  const sets = useLive(
    () => db.studySets.orderBy('updatedAt').reverse().toArray(),
    [],
    [] as StudySet[],
  );
  const [setId, setSetId] = useState('');
  const [newName, setNewName] = useState('');
  const [front, setFront] = useState(draft.text);
  const [back, setBack] = useState('');
  const [where, setWhere] = useState<Where>(draft.snapshot ? 'front' : 'none');
  const [tags, setTags] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!draft.snapshot) return;
    const u = URL.createObjectURL(draft.snapshot);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [draft.snapshot]);
  useEffect(() => {
    if (!setId && sets.length) setSetId(sets[0]!.id);
  }, [sets, setId]);

  const creating = setId === '' || setId === '__new';
  const imgFront = where === 'front' && !!draft.snapshot;
  const imgBack = where === 'back' && !!draft.snapshot;
  const valid =
    (!creating || newName.trim()) && (front.trim() || imgFront) && (back.trim() || imgBack);

  async function save() {
    setBusy(true);
    const target = creating ? (await createSet(newName.trim())).id : setId;
    const imageId = where !== 'none' && draft.snapshot ? await addStudyImage(draft.snapshot) : null;
    await addCard({
      setId: target,
      front: { text: front.trim(), imageId: where === 'front' ? imageId : null },
      back: { text: back.trim(), imageId: where === 'back' ? imageId : null },
      tags: parseTags(tags),
      sourceRef: { documentId: draft.documentId, pageId: draft.pageId },
    });
    setBusy(false);
    setDone(true);
  }

  if (done)
    return (
      <Dialog title="Flashcard created" onClose={props.onClose}>
        <p>The card was added. It remembers this page, so you can jump back to it from the set.</p>
        <div className="btn-row end">
          <button className="btn primary" autoFocus onClick={props.onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title="Create flashcard" onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void save();
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
            <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </label>
        )}
        {url && (
          <div className="field">
            <span>Snapshot of your selection</span>
            <img className="card-img" src={url} alt="Selected part of the page" />
            <label className="field">
              Put the snapshot on the
              <select value={where} onChange={(e) => setWhere(e.target.value as Where)}>
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="none">Don’t attach it</option>
              </select>
            </label>
            <span className="muted">
              Handwriting can’t be converted to text yet, so it is attached as an image.
            </span>
          </div>
        )}
        <label className="field">
          Front text
          <textarea
            className="study-text"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
        </label>
        <label className="field">
          Back text
          <textarea className="study-text" value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        <label className="field">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <div className="btn-row end">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            Create card
          </button>
        </div>
      </form>
    </Dialog>
  );
}
