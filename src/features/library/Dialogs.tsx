import { ROOT_ID, listAllFolders, descendantFolderIds, type Folder } from '@/core';
import { Dialog } from '@/ui/Dialog';
import { useLive } from '@/ui/useLive';

interface Row {
  folder: Folder | null; // null = top level
  depth: number;
}

function buildRows(all: Folder[], hidden: Set<string>): Row[] {
  const rows: Row[] = [{ folder: null, depth: 0 }];
  const walk = (parent: string, depth: number) => {
    all
      .filter((f) => f.parentId === parent && !hidden.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        rows.push({ folder: f, depth });
        walk(f.id, depth + 1);
      });
  };
  walk(ROOT_ID, 1);
  return rows;
}

/** Folder picker. `excludeFolderId` hides a folder and its subtree (for moving folders). */
export function MoveDialog(props: {
  title: string;
  excludeFolderId?: string;
  currentId: string;
  onPick: (folderId: string) => void;
  onClose: () => void;
}) {
  const all = useLive(listAllFolders, [], [] as Folder[]);
  const hidden = useLive(
    async () =>
      new Set(
        props.excludeFolderId
          ? [props.excludeFolderId, ...(await descendantFolderIds(props.excludeFolderId))]
          : [],
      ),
    [props.excludeFolderId],
    new Set<string>(),
  );
  const rows = buildRows(all, hidden);
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <ul className="picker" role="listbox" aria-label="Destination folder">
        {rows.map((r) => {
          const id = r.folder?.id ?? ROOT_ID;
          return (
            <li key={id} role="option" aria-selected={id === props.currentId}>
              <button
                type="button"
                className="picker-row"
                style={{ paddingLeft: 12 + r.depth * 18 }}
                disabled={id === props.currentId}
                onClick={() => props.onPick(id)}
              >
                <span aria-hidden="true">{r.folder ? '📁' : '🏠'}</span>{' '}
                {r.folder ? r.folder.name : 'Library (top level)'}
                {id === props.currentId ? ' — current' : ''}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="btn-row end">
        <button type="button" className="btn" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
