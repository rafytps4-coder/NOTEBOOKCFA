import { useRef } from 'react';
import type { EditorTool } from '@/engines/drawing';
import { useEditorStore } from './editorStore';

const TOOLS: { id: EditorTool; label: string; icon: string }[] = [
  { id: 'pen', label: 'Pen', icon: '✒️' },
  { id: 'pencil', label: 'Pencil', icon: '✏️' },
  { id: 'highlighter', label: 'Highlighter', icon: '🖍️' },
  { id: 'eraser', label: 'Eraser', icon: '🧽' },
  { id: 'lasso', label: 'Lasso select', icon: '⭕' },
  { id: 'text', label: 'Text', icon: '🔤' },
  { id: 'shape', label: 'Shapes', icon: '⬜' },
];

export interface ToolbarActions {
  undo: () => void;
  redo: () => void;
  resetView: () => void;
  deleteSelection: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  insertImages: (files: File[]) => void;
}

export function Toolbar({ actions }: { actions: ToolbarActions }) {
  const s = useEditorStore();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="btn-row" role="group" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn tool"
            aria-pressed={s.tool === t.id}
            aria-label={t.label}
            title={t.label}
            onClick={() => s.setTool(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
          </button>
        ))}
      </div>
      <div className="btn-row" role="group" aria-label="Insert">
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          title="Insert an image from Files or Photos"
        >
          <span aria-hidden="true">🖼️</span> Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Choose images to insert"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) actions.insertImages(files);
          }}
        />
      </div>
      <div className="btn-row" role="group" aria-label="History">
        <button
          className="btn"
          disabled={!s.canUndo}
          onClick={actions.undo}
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
        >
          ↶
        </button>
        <button
          className="btn"
          disabled={!s.canRedo}
          onClick={actions.redo}
          aria-label="Redo"
          title="Redo (Shift+Ctrl/Cmd+Z)"
        >
          ↷
        </button>
      </div>
      <div className="btn-row" role="group" aria-label="Selection">
        <button className="btn" disabled={!s.hasSelection} onClick={actions.copy}>
          Copy
        </button>
        <button className="btn" disabled={!s.hasSelection} onClick={actions.cut}>
          Cut
        </button>
        <button className="btn" onClick={actions.paste}>
          Paste
        </button>
        <button className="btn danger" disabled={!s.hasSelection} onClick={actions.deleteSelection}>
          Delete
        </button>
      </div>
      <div className="btn-row grow-end" role="group" aria-label="View">
        <button
          className="btn"
          aria-pressed={s.inputMode === 'pencilAndFinger'}
          title="When on, a finger can draw until an Apple Pencil is used. When off, only the Pencil (or mouse) draws and fingers scroll and zoom."
          onClick={() =>
            s.setInputMode(s.inputMode === 'pencilOnly' ? 'pencilAndFinger' : 'pencilOnly')
          }
        >
          Finger draws
        </button>
        <button className="btn" onClick={actions.resetView} title="Reset zoom (0)">
          {s.zoomPct}% · Fit
        </button>
      </div>
    </div>
  );
}
