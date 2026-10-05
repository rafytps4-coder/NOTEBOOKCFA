import { useEffect, useRef } from 'react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** Context / long-press menu, kept inside the viewport. */
export function ItemMenu(props: {
  x: number;
  y: number;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8))}px`;
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [props.x, props.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="menu-scrim"
        onPointerDown={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={ref} className="menu" role="menu" style={{ left: props.x, top: props.y }}>
        {props.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            role="menuitem"
            className={a.danger ? 'danger' : undefined}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}
