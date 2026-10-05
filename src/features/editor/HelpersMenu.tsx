import { useState } from 'react';
import { ItemMenu, type MenuAction } from '@/ui/ItemMenu';

/**
 * The generic "Helpers" entry for a selection. It renders nothing unless at least one enabled
 * Helper offers selection actions at all; the actions themselves are asked for when it is opened.
 */
export function HelpersMenu(props: {
  available: boolean;
  disabled: boolean;
  getActions: () => Promise<MenuAction[]>;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; actions: MenuAction[] } | null>(null);
  if (!props.available) return null;
  return (
    <>
      <button
        className="btn"
        disabled={props.disabled}
        aria-haspopup="menu"
        title="Actions from your Helpers for the selection"
        onClick={async (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const actions = await props.getActions();
          setMenu({
            x: r.left,
            y: r.bottom + 4,
            actions: actions.length
              ? actions
              : [{ label: 'No Helper actions for this selection', onSelect: () => undefined }],
          });
        }}
      >
        Helpers ▾
      </button>
      {menu && (
        <ItemMenu x={menu.x} y={menu.y} actions={menu.actions} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
