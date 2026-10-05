import { useState } from 'react';
import { PALETTE, type ImageObject, type PageObject } from '@/engines/drawing';
import type { ShapeKind } from '@/core';
import type { ShapeOptions, TextOptions } from './objectFactory';

const SHAPES: { id: ShapeKind; label: string; icon: string }[] = [
  { id: 'line', label: 'Line', icon: '／' },
  { id: 'arrow', label: 'Arrow', icon: '→' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'triangle', label: 'Triangle', icon: '△' },
];

function Swatches({
  label,
  value,
  onPick,
  allowNone,
}: {
  label: string;
  value: string | null;
  onPick: (c: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          className="swatch none"
          aria-label={`${label}: none`}
          aria-pressed={value === null}
          onClick={() => onPick(null)}
        >
          ∅
        </button>
      )}
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          aria-label={`${label} ${c}`}
          aria-pressed={value?.toLowerCase() === c}
          onClick={() => onPick(c)}
        />
      ))}
      <label className="swatch custom" title={`Custom ${label.toLowerCase()}`}>
        <span className="sr-only">Custom {label.toLowerCase()}</span>
        <input type="color" value={value ?? '#000000'} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

export function TextControls({
  value,
  onChange,
}: {
  value: TextOptions;
  onChange: (patch: Partial<TextOptions>, key: string) => void;
}) {
  return (
    <>
      <label className="slider">
        Text size {value.fontSize}
        <input
          type="range"
          min={8}
          max={96}
          value={value.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) }, 'fontSize')}
        />
      </label>
      <Swatches
        label="Text colour"
        value={value.color}
        onPick={(c) => onChange({ color: c ?? '#000000' }, 'color')}
      />
      <div className="btn-row" role="group" aria-label="Text style">
        <button
          type="button"
          className="btn"
          aria-pressed={value.bold}
          onClick={() => onChange({ bold: !value.bold }, 'bold')}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={value.italic}
          onClick={() => onChange({ italic: !value.italic }, 'italic')}
        >
          <i>I</i>
        </button>
      </div>
    </>
  );
}

export function ShapeControls({
  value,
  onChange,
  showKinds,
}: {
  value: Pick<ShapeOptions, 'stroke' | 'width' | 'fill'> & { kind?: ShapeKind };
  onChange: (patch: Partial<ShapeOptions>, key: string) => void;
  showKinds: boolean;
}) {
  return (
    <>
      {showKinds && (
        <div className="btn-row" role="group" aria-label="Shape">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn"
              aria-pressed={value.kind === s.id}
              aria-label={s.label}
              title={s.label}
              onClick={() => onChange({ kind: s.id }, 'kind')}
            >
              <span aria-hidden="true">{s.icon}</span>
            </button>
          ))}
        </div>
      )}
      <Swatches
        label="Outline colour"
        value={value.stroke}
        onPick={(c) => onChange({ stroke: c ?? '#000000' }, 'stroke')}
      />
      <label className="slider">
        Outline width {value.width}
        <input
          type="range"
          min={1}
          max={20}
          step={0.5}
          value={value.width}
          onChange={(e) => onChange({ width: Number(e.target.value) }, 'width')}
        />
      </label>
      <Swatches
        label="Fill colour"
        value={value.fill}
        allowNone
        onPick={(c) => onChange({ fill: c }, 'fill')}
      />
    </>
  );
}

const SIDES = [
  ['l', 'Left'],
  ['r', 'Right'],
  ['t', 'Top'],
  ['b', 'Bottom'],
] as const;

export function CropControls({
  obj,
  onCrop,
}: {
  obj: ImageObject;
  onCrop: (crop: ImageObject['crop']) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Crop…
      </button>
    );
  return (
    <div className="crop-panel" role="group" aria-label="Crop image">
      {SIDES.map(([k, label]) => (
        <label key={k} className="slider">
          Trim {label.toLowerCase()} {Math.round(obj.crop[k] * 100)}%
          <input
            type="range"
            min={0}
            max={80}
            value={Math.round(obj.crop[k] * 100)}
            onChange={(e) => onCrop({ ...obj.crop, [k]: Number(e.target.value) / 100 })}
          />
        </label>
      ))}
      <button type="button" className="btn" onClick={() => onCrop({ l: 0, t: 0, r: 0, b: 0 })}>
        Reset crop
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Done
      </button>
    </div>
  );
}

export function describeObject(o: PageObject): string {
  if (o.type === 'text') return 'Text box';
  if (o.type === 'image') return 'Image';
  return `Shape (${o.shape})`;
}
