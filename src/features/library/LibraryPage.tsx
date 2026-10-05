import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_SORT,
  ROOT_ID,
  createDocument,
  createFolder,
  createQuickNote,
  emptyTrash,
  getFolder,
  getFolderPath,
  listDocuments,
  listFavoriteDocuments,
  listFavoriteFolders,
  listSubfolders,
  listTrash,
  type Folder,
  type SortKey,
  type SortOptions,
} from '@/core';
import { useLive, useSetting } from '@/ui/useLive';
import { ConfirmDialog, PromptDialog } from '@/ui/Dialogs';
import { MoveDialog } from './Dialogs';
import { ItemCard } from './ItemCard';
import { ItemMenu, type MenuAction } from '@/ui/ItemMenu';
import {
  deleteForever,
  duplicate,
  itemFavorite,
  itemId,
  itemName,
  itemParent,
  move,
  rename,
  restore,
  toggleFavorite,
  trash,
  type LibItem,
} from './items';

export type LibraryMode = 'folder' | 'favorites' | 'trash';

type Dialog =
  | { t: 'newFolder' }
  | { t: 'newNotebook' }
  | { t: 'rename'; item: LibItem }
  | { t: 'move'; item: LibItem }
  | { t: 'forever'; item: LibItem }
  | { t: 'emptyTrash' }
  | null;

const EMPTY: Record<LibraryMode | 'folderRoot', string> = {
  folderRoot: 'Your library is empty. Create a folder, a notebook or a quick note to get started.',
  folder: 'This folder is empty.',
  favorites: 'Nothing is marked as a favorite yet. Use “Favorite” in an item’s menu.',
  trash: 'Trash is empty. Deleted items stay here until you delete them forever.',
};

async function loadItems(
  mode: LibraryMode,
  folderId: string,
  sort: SortOptions,
): Promise<LibItem[]> {
  let folders: Folder[];
  let docs;
  if (mode === 'trash') {
    ({ folders, documents: docs } = await listTrash());
  } else if (mode === 'favorites') {
    [folders, docs] = await Promise.all([listFavoriteFolders(sort), listFavoriteDocuments(sort)]);
  } else {
    [folders, docs] = await Promise.all([
      listSubfolders(folderId, sort),
      listDocuments(folderId, sort),
    ]);
  }
  return [
    ...folders.map((folder) => ({ type: 'folder' as const, folder })),
    ...docs.map((doc) => ({ type: 'document' as const, doc })),
  ];
}

export function LibraryPage({ mode }: { mode: LibraryMode }) {
  const navigate = useNavigate();
  const params = useParams();
  const folderId = mode === 'folder' ? (params.folderId ?? ROOT_ID) : ROOT_ID;

  const [view, setView] = useSetting<'grid' | 'list'>('library.view', 'grid');
  const [sort, setSort] = useSetting<SortOptions>('library.sort', DEFAULT_SORT);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; item: LibItem } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useLive(
    () => loadItems(mode, folderId, sort),
    [mode, folderId, sort],
    [] as LibItem[],
  );
  const path = useLive(() => getFolderPath(folderId), [folderId], [] as Folder[]);
  const folderMissing = useLive(
    async () => {
      if (mode !== 'folder' || folderId === ROOT_ID) return false;
      const f = await getFolder(folderId);
      return !f || f.deletedAt !== null;
    },
    [mode, folderId],
    false,
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const actionsFor = (item: LibItem): MenuAction[] => {
    if (mode === 'trash') {
      return [
        { label: 'Restore', onSelect: () => void run(() => restore(item)) },
        {
          label: 'Delete forever…',
          danger: true,
          onSelect: () => setDialog({ t: 'forever', item }),
        },
      ];
    }
    return [
      { label: 'Open', onSelect: () => open(item) },
      { label: 'Rename…', onSelect: () => setDialog({ t: 'rename', item }) },
      { label: 'Duplicate', onSelect: () => void run(() => duplicate(item)) },
      { label: 'Move to…', onSelect: () => setDialog({ t: 'move', item }) },
      {
        label: itemFavorite(item) ? 'Remove favorite' : 'Favorite',
        onSelect: () => void run(() => toggleFavorite(item)),
      },
      { label: 'Move to trash', danger: true, onSelect: () => void run(() => trash(item)) },
    ];
  };

  const open = (item: LibItem) => {
    if (mode === 'trash') return;
    navigate(item.type === 'folder' ? `/library/f/${item.folder.id}` : `/doc/${item.doc.id}`);
  };

  const title = mode === 'trash' ? 'Trash' : mode === 'favorites' ? 'Favorites' : 'Library';
  const sortKeys = useMemo<{ key: SortKey; label: string }[]>(
    () => [
      { key: 'name', label: 'Name' },
      { key: 'modified', label: 'Date modified' },
      { key: 'created', label: 'Date created' },
    ],
    [],
  );

  if (folderMissing) {
    return (
      <section>
        <h1>Folder not found</h1>
        <p>This folder no longer exists or is in the trash.</p>
        <Link to="/library">Back to Library</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>{mode === 'folder' && path.length ? path[path.length - 1]!.name : title}</h1>

      <nav aria-label="Library sections" className="subnav">
        <Link to="/library" aria-current={mode === 'folder' ? 'page' : undefined}>
          All
        </Link>
        <Link to="/library/favorites" aria-current={mode === 'favorites' ? 'page' : undefined}>
          Favorites
        </Link>
        <Link to="/library/trash" aria-current={mode === 'trash' ? 'page' : undefined}>
          Trash
        </Link>
      </nav>

      {mode === 'folder' && (
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/library">Library</Link>
          {path.map((f, i) => (
            <span key={f.id}>
              <span aria-hidden="true"> / </span>
              {i === path.length - 1 ? (
                <span aria-current="page">{f.name}</span>
              ) : (
                <Link to={`/library/f/${f.id}`}>{f.name}</Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="toolbar">
        {mode === 'folder' && (
          <div className="btn-row">
            <button className="btn primary" onClick={() => setDialog({ t: 'newNotebook' })}>
              New notebook
            </button>
            <button className="btn" onClick={() => setDialog({ t: 'newFolder' })}>
              New folder
            </button>
            <button
              className="btn"
              onClick={() =>
                void run(async () => {
                  const d = await createQuickNote(folderId);
                  navigate(`/doc/${d.id}`);
                })
              }
            >
              Quick note
            </button>
          </div>
        )}
        {mode === 'trash' && items.length > 0 && (
          <button className="btn danger" onClick={() => setDialog({ t: 'emptyTrash' })}>
            Empty trash…
          </button>
        )}
        <div className="btn-row grow-end">
          <label className="inline-field">
            Sort
            <select
              value={sort.key}
              onChange={(e) => setSort({ ...sort, key: e.target.value as SortKey })}
            >
              {sortKeys.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            aria-label={`Sort direction: ${sort.dir === 'asc' ? 'ascending' : 'descending'}`}
            onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
          <div className="btn-row" role="group" aria-label="View">
            <button className="btn" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              Grid
            </button>
            <button className="btn" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="empty">
          {mode === 'folder' && folderId === ROOT_ID ? EMPTY.folderRoot : EMPTY[mode]}
        </p>
      ) : (
        <ul className={`items items-${view}`}>
          {items.map((item) => (
            <li key={itemId(item)}>
              <ItemCard
                item={item}
                view={view}
                onOpen={() => open(item)}
                onMenu={(x, y) => setMenu({ x, y, item })}
              />
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <ItemMenu
          x={menu.x}
          y={menu.y}
          actions={actionsFor(menu.item)}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog?.t === 'newFolder' && (
        <PromptDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            setDialog(null);
            void run(() => createFolder(name, folderId));
          }}
        />
      )}
      {dialog?.t === 'newNotebook' && (
        <PromptDialog
          title="New notebook"
          label="Notebook name"
          confirmLabel="Create"
          onClose={() => setDialog(null)}
          onSubmit={(title) => {
            setDialog(null);
            void run(async () => {
              const d = await createDocument({ kind: 'notebook', title, folderId });
              navigate(`/doc/${d.id}`);
            });
          }}
        />
      )}
      {dialog?.t === 'rename' && (
        <PromptDialog
          title="Rename"
          label="Name"
          initial={itemName(dialog.item)}
          confirmLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            const item = dialog.item;
            setDialog(null);
            void run(() => rename(item, name));
          }}
        />
      )}
      {dialog?.t === 'move' && (
        <MoveDialog
          title={`Move “${itemName(dialog.item)}”`}
          currentId={itemParent(dialog.item)}
          excludeFolderId={dialog.item.type === 'folder' ? dialog.item.folder.id : undefined}
          onClose={() => setDialog(null)}
          onPick={(dest) => {
            const item = dialog.item;
            setDialog(null);
            void run(() => move(item, dest));
          }}
        />
      )}
      {dialog?.t === 'forever' && (
        <ConfirmDialog
          title="Delete forever?"
          message={`“${itemName(dialog.item)}”${
            dialog.item.type === 'folder' ? ' and everything inside it' : ''
          } will be permanently deleted, including its pages and files. This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const item = dialog.item;
            setDialog(null);
            void run(() => deleteForever(item));
          }}
        />
      )}
      {dialog?.t === 'emptyTrash' && (
        <ConfirmDialog
          title="Empty trash?"
          message="Everything in the trash will be permanently deleted, including pages and files. This cannot be undone."
          confirmLabel="Empty trash"
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void run(emptyTrash);
          }}
        />
      )}
    </section>
  );
}
