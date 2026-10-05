import { useState } from 'react';
import { PALETTE } from '@/engines/drawing';
import { ConfirmDialog, PromptDialog } from '@/ui/Dialogs';
import { activeController } from './pageRegistry';
import { CropControls, ShapeControls, TextControls, describeObject } from './ObjectOptions';
import { activeOptions, isInkTool, useEditorStore } from './editorStore';

export function ToolOptionsPanel() {
  const s = useEditorStore();
  const [dlg, setDlg] = useState<
    | { t: 'save' }
    | { t: 'rename'; id: string; name: string }
    | { t: 'delete'; id: string; name: string }
    | null
  >(null);

  if (!s.optionsOpen) return null;
  const sel = s.selectedObject;
  const patch = (p: Record<string, unknown>, key: string) =>
    activeController()?.patchSelected(p, key);

  // A selected object is edited in place, whichever tool is active.
  if (sel && s.tool === 'lasso') {
    return (
      <div className="options" id="tool-options" aria-label="Object options">
        <strong>{describeObject(sel)}</strong>
        {sel.type === 'text' && <TextControls value={sel} onChange={patch} />}
        {sel.type === 'shape' && (
          <ShapeControls
            showKinds={false}
            value={{ stroke: sel.stroke, width: sel.strokeWidth, fill: sel.fill }}
            onChange={(p, key) =>
              patch(
                {
                  ...(p.stroke !== undefined ? { stroke: p.stroke } : {}),
                  ...(p.width !== undefined ? { strokeWidth: p.width } : {}),
                  ...(p.fill !== undefined ? { fill: p.fill } : {}),
                },
                key,
              )
            }
          />
        )}
        {sel.type === 'image' && (
          <CropControls obj={sel} onCrop={(c) => activeController()?.cropSelected(c)} />
        )}
        <div className="btn-row" role="group" aria-label="Arrange">
          <button className="btn" onClick={() => activeController()?.bringToFront()}>
            Bring to front
          </button>
          <button className="btn" onClick={() => activeController()?.sendToBack()}>
            Send to back
          </button>
          <button className="btn danger" onClick={() => activeController()?.deleteSelection()}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (s.tool === 'text') {
    return (
      <div className="options" id="tool-options" aria-label="Text options">
        <TextControls value={s.text} onChange={(p) => s.setText(p)} />
        <p className="muted">Tap the page to add a text box. Tap an existing one to edit it.</p>
      </div>
    );
  }
  if (s.tool === 'shape') {
    return (
      <div className="options" id="tool-options" aria-label="Shape options">
        <ShapeControls
          showKinds
          value={{
            kind: s.shape.kind,
            stroke: s.shape.stroke,
            width: s.shape.width,
            fill: s.shape.fill,
          }}
          onChange={(p) => s.setShape(p)}
        />
        <p className="muted">Drag on the page to draw. A tap drops a default-size shape.</p>
      </div>
    );
  }
  if (!isInkTool(s.tool)) {
    return (
      <div className="options" id="tool-options" aria-label="Tool options">
        <p className="muted">
          {s.tool === 'eraser'
            ? 'Eraser removes whole ink strokes it touches. Undo brings them back.'
            : 'Tap an object, or draw a loop around ink and objects, to select. Drag to move.'}
        </p>
      </div>
    );
  }

  const o = activeOptions(s);
  const presets = s.presets.filter((p) => p.tool === s.tool);
  const maxW = s.tool === 'highlighter' ? 48 : 24;

  return (
    <div className="options" id="tool-options" aria-label="Tool options">
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
      {s.tool !== 'highlighter' && (
        <label className="check">
          <input
            type="checkbox"
            checked={s.shapeSnap}
            onChange={(e) => s.setShapeSnap(e.target.checked)}
          />
          Snap to shapes (hold still at the end of a stroke)
        </label>
      )}

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
