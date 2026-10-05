# Prompt 02: Drawing engine

## Goal
A handwriting canvas that feels good with Apple Pencil, on a single page first.

## Install
`perfect-freehand`.

## Do
1. Editor route opens a notebook's first page (create one page if none exists).
2. Stroke model in `engines/drawing`: JSON strokes with points `{x, y, pressure, t}`, tool, color, base width, opacity. Pure TypeScript, unit-tested, independent of React.
3. Rendering: two stacked canvases, a committed layer and a live layer for the stroke in progress. Use Pointer Events, `getCoalescedEvents()`, `touch-action: none` on the canvas, and handle device pixel ratio. Draw live strokes on the live layer only, and commit on pointer-up. Keep the pointer path free of allocations and React state updates.
4. Palm rejection: when a `pen` pointer has been seen, ignore `touch` pointers for drawing. Touch is used only for pan/zoom. Mouse draws on desktop. Make this a setting ("Pencil only / Pencil and finger").
5. Tools: pen, pencil (textured, lower opacity), highlighter (wide, multiply/translucent, drawn behind ink order-wise or with blend mode), eraser (stroke eraser; optional pixel-style partial erase only if it's solid), lasso select (move, delete, copy/paste selection).
6. Tool options: color palette plus custom color, size slider, opacity slider, and **saved presets** (user can save/rename/delete). Persist in settings.
7. Undo/redo with a command stack (keyboard Cmd/Ctrl+Z, Shift+Z, and toolbar buttons). Undo must cover draw, erase, move, delete.
8. Zoom and pan: pinch zoom with two fingers, pan with two fingers or scroll, zoom limits, double-tap to reset. Strokes stay crisp at high zoom (re-render at scale).
9. Autosave: debounced save of the page's strokes to Dexie on change and on `visibilitychange`/`pagehide`. Never block drawing while saving. Show a subtle saved/saving indicator.
10. Generate a small thumbnail of the page after saving and use it on the library card.
11. Add a developer-only performance overlay (frame time, points/sec), hidden by default, to help tune latency.

## Do not
Add multiple pages, templates, text, shapes, images, or PDF.

## Done when
Draw, erase, highlight, select/move, undo/redo, zoom/pan, reload and strokes persist. Tests pass. State clearly what you could only verify with a mouse/emulation, and that real Pencil latency needs a physical iPad.

Finish with the required report and STOP.
