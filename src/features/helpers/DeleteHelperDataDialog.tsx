import { useEffect, useState } from 'react';
import { deleteHelperData, describeHelperData } from '@/helpers/state';
import type { Helper } from '@/helpers/types';
import { Dialog } from '@/ui/Dialog';

/** Shows exactly what will be removed, then removes it only after an explicit confirmation. */
export function DeleteHelperDataDialog({
  helper,
  onClose,
}: {
  helper: Helper;
  onClose: () => void;
}) {
  const [items, setItems] = useState<{ id: string; label: string; count: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    void describeHelperData(helper).then(setItems);
  }, [helper]);
  const total = items?.reduce((a, b) => a + b.count, 0) ?? 0;
  return (
    <Dialog title={`Delete ${helper.name} data?`} onClose={onClose}>
      {done ? (
        <>
          <p>The data was deleted.</p>
          <div className="btn-row end">
            <button className="btn primary" autoFocus onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p>This will permanently remove:</p>
          {items === null ? (
            <p className="muted">Counting…</p>
          ) : (
            <ul>
              {items.map((i) => (
                <li key={i.id}>
                  {i.label}: <strong>{i.count}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            Your notebooks, flashcards, questions, mistakes and notes are not affected. This can’t
            be undone; export a backup first if unsure.
          </p>
          <div className="btn-row end">
            <button className="btn" autoFocus onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={busy || items === null || total === 0}
              onClick={async () => {
                setBusy(true);
                await deleteHelperData(helper);
                setBusy(false);
                setDone(true);
              }}
            >
              {total === 0 && items !== null ? 'Nothing to delete' : 'Delete data'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
