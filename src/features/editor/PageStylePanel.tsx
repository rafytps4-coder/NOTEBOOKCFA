import { useState } from 'react';
import type { Page, PageSizeName, TemplateKind } from '@/core';
import { PAGE_SIZES, orientationOf, pageDimensions } from '@/engines/drawing';
import type { PageActions } from './pageActions';

const KINDS: { id: TemplateKind; label: string }[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'ruled', label: 'Ruled' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell' },
];
const PAPER = ['#ffffff', '#fdf6e3', '#eef3f8', '#f1f1f1'];
const LINES = ['#c5cfdc', '#9db4d0', '#d9b8b8', '#b9c9b0', '#888888'];

export function PageStylePanel({
  page,
  pageIds,
  actions,
  onClose,
}: {
  page: Page;
  pageIds: string[];
  actions: PageActions;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState({ w: page.width, h: page.height });
  const orientation = orientationOf(page);
  const set = (patch: Parameters<PageActions['setStyle']>[1]) =>
    void actions.setStyle([page.id], patch);

  const setSize = (name: PageSizeName, o = orientation, c = custom) => {
    const d = pageDimensions(name, o, { width: c.w, height: c.h });
    set({ sizeName: name, ...d });
  };

  return (
    <section className="style-panel" aria-label="Page style">
      <div className="style-row">
        <label className="field">
          Template
          <select
            value={page.template.kind}
            onChange={(e) =>
              set({ template: { ...page.template, kind: e.target.value as TemplateKind } })
            }
          >
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="slider">
          Line spacing {page.template.spacing}
          <input
            type="range"
            min={12}
            max={64}
            step={2}
            value={page.template.spacing}
            disabled={page.template.kind === 'blank'}
            onChange={(e) =>
              set({ template: { ...page.template, spacing: Number(e.target.value) } })
            }
          />
        </label>
        <div className="swatches" role="group" aria-label="Line colour">
          {LINES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              aria-label={`Line colour ${c}`}
              aria-pressed={page.template.color === c}
              onClick={() => set({ template: { ...page.template, color: c } })}
            />
          ))}
        </div>
        <div className="swatches" role="group" aria-label="Paper colour">
          {PAPER.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              aria-label={`Paper colour ${c}`}
              aria-pressed={page.background === c}
              onClick={() => set({ background: c })}
            />
          ))}
        </div>
      </div>
      <div className="style-row">
        <label className="field">
          Size
          <select value={page.sizeName} onChange={(e) => setSize(e.target.value as PageSizeName)}>
            {Object.keys(PAGE_SIZES).map((n) => (
              <option key={n}>{n}</option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        {page.sizeName === 'custom' && (
          <>
            <label className="field">
              Width (px)
              <input
                type="number"
                min={200}
                max={4000}
                value={custom.w}
                onChange={(e) => setCustom({ ...custom, w: Number(e.target.value) })}
                onBlur={() => setSize('custom')}
              />
            </label>
            <label className="field">
              Height (px)
              <input
                type="number"
                min={200}
                max={4000}
                value={custom.h}
                onChange={(e) => setCustom({ ...custom, h: Number(e.target.value) })}
                onBlur={() => setSize('custom')}
              />
            </label>
          </>
        )}
        <div className="btn-row" role="group" aria-label="Orientation">
          {(['portrait', 'landscape'] as const).map((o) => (
            <button
              key={o}
              className="btn"
              aria-pressed={orientation === o}
              onClick={() => setSize(page.sizeName, o)}
            >
              {o === 'portrait' ? 'Portrait' : 'Landscape'}
            </button>
          ))}
        </div>
        <button
          className="btn"
          onClick={() =>
            void actions.setStyle(pageIds, { template: page.template, background: page.background })
          }
        >
          Apply template to all pages
        </button>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="muted">
        Templates are only a background: changing them never touches your ink. Making a page smaller
        can hide ink outside the new edge; the ink is kept.
      </p>
    </section>
  );
}
