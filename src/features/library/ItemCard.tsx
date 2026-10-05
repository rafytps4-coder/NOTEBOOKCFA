import { useRef } from 'react';
import { DocThumb } from './DocThumb';
import { itemFavorite, itemName, itemUpdated, type LibItem } from './items';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;

function glyph(i: LibItem): string {
  if (i.type === 'folder') return '📁';
  return i.doc.kind === 'pdf' ? '📄' : i.doc.kind === 'quickNote' ? '📝' : '📓';
}

function kindLabel(i: LibItem): string {
  if (i.type === 'folder') return 'Folder';
  return i.doc.kind === 'pdf' ? 'PDF' : i.doc.kind === 'quickNote' ? 'Quick note' : 'Notebook';
}

export function ItemCard(props: {
  item: LibItem;
  view: 'grid' | 'list';
  onOpen: () => void;
  onMenu?: (x: number, y: number) => void;
}) {
  const { item, view, onOpen, onMenu } = props;
  const timer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const longPressed = useRef(false);

  const clear = () => window.clearTimeout(timer.current);

  return (
    <div
      className={`item item-${view}`}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || !onMenu) return;
        longPressed.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onMenu(start.current.x, start.current.y);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE)
          clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
    >
      <button
        type="button"
        className="item-main"
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onOpen();
        }}
      >
        {item.type === 'document' ? (
          <DocThumb doc={item.doc} glyph={glyph(item)} />
        ) : (
          <span className="thumb" aria-hidden="true">
            {glyph(item)}
          </span>
        )}
        <span className="item-text">
          <span className="item-title">
            {itemName(item)}
            {itemFavorite(item) && (
              <>
                <span aria-hidden="true"> ★</span>
                <span className="sr-only">, favorite</span>
              </>
            )}
          </span>
          <span className="item-sub">
            {kindLabel(item)} · {new Date(itemUpdated(item)).toLocaleDateString()}
          </span>
        </span>
      </button>
      {onMenu && (
        <button
          type="button"
          className="item-more"
          aria-label={`More actions for ${itemName(item)}`}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.left, r.bottom);
          }}
        >
          ⋯
        </button>
      )}
    </div>
  );
}
