import { useState } from 'react';
import { PALETTE } from '@/engines/drawing';
import { ConfirmDialog, PromptDialog } from '@/ui/Dialogs';
import { activeOptions, isInkTool, useEditorStore } from './editorStore';

export function ToolOptionsPanel() {
  const s = useEditorStore();
  const [dlg, setDlg] = useState<
    | { t: 'save' }
    | { t: 'rename'; id: string; name: string }
    | { t: 'delete'; id: string; name: string }
    | null
  >(null);

  if (!isInkTool(s.tool)) {
    return (
      <div className="options" aria-label="Tool options">
        <p className="muted">
          {s.tool === 'eraser'
            ? 'Eraser removes whole strokes it touches. Undo brings them back.'
            : 'Draw a loop around ink to select it. Drag inside the box to move it.'}
        </p>
      </div>
    );
  }

  const o = activeOptions(s);
  const presets = s.presets.filter((p) => p.tool === s.tool);
  const maxW = s.tool === 'highlighter' ? 48 : 24;

  return (
    <div className="options" aria-label="Tool options">
      <div className="swatches" role="group" aria-label="Colour">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c }}
            aria-label={`Colour ${c}`}
            aria-pressed={o.color.toLowerCase() === c}
            onClick={() => s.setOption({ color: c })}
          />
        ))}
        <label className="swatch custom" title="Custom colour">
          <span className="sr-only">Custom colour</span>
          <input
            type="color"
            value={o.color}
            onChange={(e) => s.setOption({ color: e.target.value })}
          />
        </label>
      </div>
      <label className="slider">
        Size {o.width.toFixed(1)}
        <input
          type="range"
          min={0.5}
          max={maxW}
          step={0.5}
          value={o.width}
          onChange={(e) => s.setOption({ width: Number(e.target.value) })}
        />
      </label>
      <label className="slider">
        Opacity {Math.round(o.opacity * 100)}%
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={o.opacity}
          onChange={(e) => s.setOption({ opacity: Number(e.target.value) })}
        />
      </label>
      <div className="presets">
        <span className="muted">Presets</span>
        {presets.map((p) => (
          <span key={p.id} className="preset">
            <button type="button" className="btn" onClick={() => s.applyPreset(p.id)}>
              <span className="dot" style={{ background: p.color }} aria-hidden="true" /> {p.name}
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Rename preset ${p.name}`}
              onClick={() => setDlg({ t: 'rename', id: p.id, name: p.name })}
            >
              ✎
            </button>
            <button
              type="button"
              className="btn"
              aria-label={`Delete preset ${p.name}`}
              onClick={() => setDlg({ t: 'delete', id: p.id, name: p.name })}
            >
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="btn" onClick={() => setDlg({ t: 'save' })}>
          Save current as preset
        </button>
      </div>

      {dlg?.t === 'save' && (
        <PromptDialog
          title="Save preset"
          label="Preset name"
          confirmLabel="Save"
          onClose={() => setDlg(null)}
          onSubmit={(name) => {
            s.savePreset(name);
            setDlg(null);
          }}
        />
      )}
      {dlg?.t === 'rename' && (
        <PromptDialog
          title="Rename preset"
          label="Preset name"
          initial={dlg.name}
          confirmLabel="Rename"
          onClose={() => setDlg(null)}
          onSubmit={(name) => {
            s.renamePreset(dlg.id, name);
            setDlg(null);
          }}
        />
      )}
      {dlg?.t === 'delete' && (
        <ConfirmDialog
          title="Delete preset?"
          message={`Delete the preset “${dlg.name}”? Your drawings are not affected.`}
          confirmLabel="Delete"
          danger
          onClose={() => setDlg(null)}
          onConfirm={() => {
            s.deletePreset(dlg.id);
            setDlg(null);
          }}
        />
      )}
    </div>
  );
}
