export interface Shortcut {
  keys: string;
  action: string;
}

/** The single source of truth for the shortcuts help sheet (and for tooltips). */
export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Drawing',
    items: [
      { keys: 'Ctrl/⌘ + Z', action: 'Undo' },
      { keys: 'Shift + Ctrl/⌘ + Z  or  Ctrl/⌘ + Y', action: 'Redo' },
      { keys: 'Delete or Backspace', action: 'Delete the selection' },
      { keys: 'Ctrl/⌘ + C / X / V', action: 'Copy, cut, paste the selection' },
      { keys: '0', action: 'Reset zoom (fit the page)' },
    ],
  },
  {
    title: 'Pages',
    items: [
      { keys: 'Page Down  or  Alt + ↓', action: 'Next page' },
      { keys: 'Page Up  or  Alt + ↑', action: 'Previous page' },
      { keys: 'Ctrl/⌘ + Enter', action: 'New page after the current one' },
    ],
  },
  {
    title: 'Text boxes',
    items: [
      { keys: 'Ctrl/⌘ + Enter', action: 'Finish editing the text' },
      { keys: 'Esc', action: 'Discard the edit' },
      { keys: 'Double-tap a text box', action: 'Edit it (Select tool)' },
    ],
  },
  {
    title: 'Anywhere',
    items: [
      { keys: '?', action: 'Show this list' },
      { keys: 'Tab / Shift + Tab', action: 'Move between controls' },
      { keys: 'Esc', action: 'Close a menu or dialog' },
    ],
  },
  {
    title: 'Touch and Apple Pencil',
    items: [
      { keys: 'Apple Pencil', action: 'Draw (a resting palm is ignored)' },
      { keys: 'Two fingers', action: 'Scroll and pinch to zoom' },
      { keys: 'Double-tap with one finger', action: 'Reset zoom' },
    ],
  },
];
