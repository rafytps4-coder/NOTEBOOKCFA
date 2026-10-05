import { useState } from 'react';
import { addCard, deleteCard, parseTags, updateCard, type CardSide, type Flashcard } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { ConfirmDialog } from '@/ui/Dialogs';
import { ImageField } from './ImageField';

/** Create (no `card`) or edit a flashcard. */
export function CardEditor(props: { setId: string; card?: Flashcard; onClose: () => void }) {
  const { card } = props;
  const [front, setFront] = useState<CardSide>(card?.front ?? { text: '', imageId: null });
  const [back, setBack] = useState<CardSide>(card?.back ?? { text: '', imageId: null });
  const [tags, setTags] = useState(card?.tags.join(', ') ?? '');
  const [again, setAgain] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const empty = (s: CardSide) => !s.text.trim() && !s.imageId;
  const valid = !empty(front) && !empty(back);

  async function save(keepOpen: boolean) {
    const t = parseTags(tags);
    if (card) await updateCard(card.id, { front, back, tags: t });
    else await addCard({ setId: props.setId, front, back, tags: t });
    if (keepOpen) {
      setFront({ text: '', imageId: null });
      setBack({ text: '', imageId: null });
      setAgain(true);
    } else props.onClose();
  }

  return (
    <Dialog title={card ? 'Edit card' : 'New card'} onClose={props.onClose}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save(false);
        }}
      >
        {(['Front', 'Back'] as const).map((label) => {
          const side = label === 'Front' ? front : back;
          const set = label === 'Front' ? setFront : setBack;
          return (
            <div key={label} className="form-grid">
              <label className="field">
                {label}
                <textarea
                  className="study-text"
                  autoFocus={label === 'Front'}
                  value={side.text}
                  onChange={(e) => set({ ...side, text: e.target.value })}
                />
              </label>
              <ImageField
                label={`${label} image`}
                imageId={side.imageId}
                onChange={(imageId) => set({ ...side, imageId })}
              />
            </div>
          );
        })}
        <label className="field">
          Tags (comma separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        {again && <p className="muted">Card added. Add another, or close.</p>}
        <div className="btn-row end">
          {card && (
            <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={props.onClose}>
            {again ? 'Done' : 'Cancel'}
          </button>
          {!card && (
            <button type="button" className="btn" disabled={!valid} onClick={() => void save(true)}>
              Save &amp; add another
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
      {confirming && card && (
        <ConfirmDialog
          title="Delete this card?"
          message="The card and its review history will be removed. This can’t be undone."
          confirmLabel="Delete card"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await deleteCard(card.id);
            props.onClose();
          }}
        />
      )}
    </Dialog>
  );
}
