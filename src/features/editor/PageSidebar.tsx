import { memo, useCallback, useRef, useState } from 'react';
import type { Page } from '@/core';
import { ItemMenu, type MenuAction } from '@/ui/ItemMenu';
import type { PageActions } from './pageActions';
import type { PageHistory } from './pageHistory';
import { PageThumbImg } from './PageThumbImg';
import { OutlinePanel } from '../pdf/OutlinePanel';

interface Props {
  pages: Page[];
  currentId: string | null;
  actions: PageActions;
  history: PageHistory;
  historyVersion: number;
  onSelect: (index: number) => void;
  onAfterAdd: (page: Page) => void;
  onAskDelete: (page: Page) => void;
  onAskMove: (page: Page, index: number) => void;
  onClose: () => void;
  /** PDF documents: id (to read the outline from) and a jump handler for original page indexes. */
  pdfDocId?: string;
  onJumpPdf?: (pdfPageIndex: number) => void;
}

export function PageSidebar(p: Props) {
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [tab, setTab] = useState<'pages' | 'outline'>('pages');
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; from: number; over: number } | null>(null);

  const rows = p.pages
    .map((page, index) => ({ page, index }))
    .filter((r) => !bookmarksOnly || r.page.bookmarked);

  const menuActions = (index: number): MenuAction[] => {
    const page = p.pages[index]!;
    return [
      {
        label: 'Add page after',
        onSelect: () => void p.actions.addAfter(index).then(p.onAfterAdd),
      },
      {
        label: 'Insert page before',
        onSelect: () => void p.actions.insertAt(index).then(p.onAfterAdd),
      },
      {
        label: 'Duplicate page',
        onSelect: () => void p.actions.duplicate(page.id).then(p.onAfterAdd),
      },
      { label: 'Move to position…', onSelect: () => p.onAskMove(page, index) },
      {
        label: page.bookmarked ? 'Remove bookmark' : 'Bookmark',
        onSelect: () => void p.actions.toggleBookmark(page),
      },
      { label: 'Delete page…', danger: true, onSelect: () => p.onAskDelete(page) },
    ];
  };

  const dragRef = useRef(drag);
  dragRef.current = drag;
  const actionsRef = useRef(p.actions);
  actionsRef.current = p.actions;
  const startDrag = useCallback((e: React.PointerEvent, id: string, index: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, from: index, over: index });
  }, []);
  const moveDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-page-index]');
    const over = el ? Number(el.dataset.pageIndex) : d.over;
    if (over !== d.over) setDrag({ ...d, over });
  }, []);
  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (d && d.over !== d.from) void actionsRef.current.move(d.id, d.over);
    setDrag(null);
  }, []);
  const cancelDrag = useCallback(() => setDrag(null), []);
  const openMenu = useCallback(
    (x: number, y: number, index: number) => setMenu({ x, y, index }),
    [],
  );

  return (
    <aside className="page-sidebar" aria-label="Pages">
      <div className="sidebar-head">
        <strong>Pages ({p.pages.length})</strong>
        <button className="btn" onClick={p.onClose} aria-label="Close page list">
          ✕
        </button>
      </div>
      <div className="btn-row sidebar-tools">
        <button
          className="btn"
          disabled={!p.history.canUndo}
          aria-label="Undo page change"
          title="Undo page change"
          onClick={() => void p.history.undo()}
        >
          ↶ Page
        </button>
        <button
          className="btn"
          disabled={!p.history.canRedo}
          aria-label="Redo page change"
          title="Redo page change"
          onClick={() => void p.history.redo()}
        >
          ↷ Page
        </button>
        <button
          className="btn"
          aria-pressed={bookmarksOnly}
          onClick={() => setBookmarksOnly((v) => !v)}
        >
          ★ Bookmarks
        </button>
      </div>
      {p.pdfDocId && (
        <div className="btn-row sidebar-tools" role="group" aria-label="Sidebar view">
          <button className="btn" aria-pressed={tab === 'pages'} onClick={() => setTab('pages')}>
            Pages
          </button>
          <button
            className="btn"
            aria-pressed={tab === 'outline'}
            onClick={() => setTab('outline')}
          >
            Outline
          </button>
        </div>
      )}
      {tab === 'outline' && p.pdfDocId && p.onJumpPdf && (
        <div className="outline-wrap">
          <OutlinePanel documentId={p.pdfDocId} onJump={p.onJumpPdf} />
        </div>
      )}
      <span hidden>{p.historyVersion}</span>
      {tab === 'pages' && rows.length === 0 && (
        <p className="muted pad">No bookmarked pages yet.</p>
      )}
      <ol className="page-list" hidden={tab !== 'pages'}>
        {rows.map(({ page, index }) => (
          <SidebarItem
            key={page.id}
            page={page}
            index={index}
            isCurrent={page.id === p.currentId}
            isDropTarget={drag?.over === index && drag.from !== index}
            isDragging={drag?.id === page.id}
            showHandle={!bookmarksOnly}
            onSelect={p.onSelect}
            onMenu={openMenu}
            onDragStart={startDrag}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            onDragCancel={cancelDrag}
          />
        ))}
      </ol>
      {menu && (
        <ItemMenu
          x={menu.x}
          y={menu.y}
          actions={menuActions(menu.index)}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

interface ItemProps {
  page: Page;
  index: number;
  isCurrent: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  showHandle: boolean;
  onSelect: (index: number) => void;
  onMenu: (x: number, y: number, index: number) => void;
  onDragStart: (e: React.PointerEvent, id: string, index: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
}

/** Memoised so changing the current page re-renders two items, not hundreds. */
const SidebarItem = memo(function SidebarItem(i: ItemProps) {
  const { page, index } = i;
  return (
    <li
      data-page-index={index}
      className={[
        'page-item',
        i.isCurrent ? 'current' : '',
        i.isDropTarget ? 'drop-target' : '',
        i.isDragging ? 'dragging' : '',
      ].join(' ')}
    >
      <button
        className="page-item-main"
        aria-label={`Go to page ${index + 1}${page.bookmarked ? ', bookmarked' : ''}`}
        aria-current={i.isCurrent ? 'true' : undefined}
        onClick={() => i.onSelect(index)}
      >
        <PageThumbImg page={page} lazy />
        <span className="page-num">
          {index + 1}
          {page.bookmarked && <span aria-hidden="true"> ★</span>}
        </span>
      </button>
      <div className="page-item-actions">
        {i.showHandle && (
          <button
            className="btn drag-handle"
            aria-label={`Drag to reorder page ${index + 1}`}
            onPointerDown={(e) => i.onDragStart(e, page.id, index)}
            onPointerMove={i.onDragMove}
            onPointerUp={i.onDragEnd}
            onPointerCancel={i.onDragCancel}
          >
            ⠿
          </button>
        )}
        <button
          className="btn"
          aria-haspopup="menu"
          aria-label={`Page ${index + 1} actions`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            i.onMenu(r.left, r.bottom, index);
          }}
        >
          ⋯
        </button>
      </div>
    </li>
  );
});
