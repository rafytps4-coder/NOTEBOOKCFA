import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setThumbnail, type NotebookDocument, type Page } from '@/core';
import { CanvasController } from './CanvasController';
import { PageSaver } from './PageSaver';
import { PerfOverlay } from './PerfOverlay';
import { Toolbar } from './Toolbar';
import { ToolOptionsPanel } from './ToolOptionsPanel';
import { activeOptions, useEditorStore } from './editorStore';
import { renderThumbnail } from './thumbnail';
import { useEditorSettings } from './useEditorSettings';

const SAVE_LABEL = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  error: 'Save failed, retrying',
};

export function EditorView({ doc, page }: { doc: NotebookDocument; page: Page }) {
  useEditorSettings();
  const hostRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const [controller, setController] = useState<CanvasController | null>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const saveState = useEditorStore((s) => s.saveState);
  const perf = useEditorStore((s) => s.perfOverlay);
  const tool = useEditorStore((s) => s.tool);

  useEffect(() => {
    const host = hostRef.current;
    const committed = committedRef.current;
    const live = liveRef.current;
    if (!host || !committed || !live) return;
    const store = useEditorStore;
    store.setState({ canUndo: false, canRedo: false, hasSelection: false, saveState: 'saved' });
    if (new URLSearchParams(location.search).has('perf')) store.setState({ perfOverlay: true });

    let thumbTimer: number | undefined;
    const saver = new PageSaver(
      page.id,
      () => c.strokes,
      (s) => store.setState({ saveState: s }),
      () => {
        // Thumbnail is generated after a save, off the drawing path, and debounced.
        window.clearTimeout(thumbTimer);
        thumbTimer = window.setTimeout(async () => {
          const blob = await renderThumbnail(c.strokes, page);
          if (blob) await setThumbnail(doc.id, blob);
        }, 1500);
      },
    );
    const c = new CanvasController({
      host,
      committed,
      live,
      page,
      strokes: page.strokes,
      getTool: () => {
        const s = store.getState();
        return { tool: s.tool, options: activeOptions(s), inputMode: s.inputMode };
      },
      onStrokesChanged: () => saver.markDirty(),
      onUi: (p) => store.setState(p),
    });
    ctrlRef.current = c;
    setController(c);
    return () => {
      window.clearTimeout(thumbTimer);
      c.dispose();
      ctrlRef.current = null;
      setController(null);
      void saver.dispose();
    };
  }, [page, doc.id]);

  // Tool change drops any selection
  useEffect(() => ctrlRef.current?.setTool(), [tool]);

  const run = useCallback((fn: (c: CanvasController) => void) => {
    const c = ctrlRef.current;
    if (c) fn(c);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && e.shiftKey && k === 'p') {
        e.preventDefault();
        useEditorStore.setState((s) => ({ perfOverlay: !s.perfOverlay }));
      } else if (mod && k === 'z') {
        e.preventDefault();
        run((c) => (e.shiftKey ? c.redo() : c.undo()));
      } else if (mod && k === 'y') {
        e.preventDefault();
        run((c) => c.redo());
      } else if (mod && k === 'c') run((c) => c.copySelection());
      else if (mod && k === 'x') run((c) => c.cutSelection());
      else if (mod && k === 'v') run((c) => c.paste());
      else if (e.key === 'Delete' || e.key === 'Backspace') run((c) => c.deleteSelection());
      else if (!mod && k === '0') run((c) => c.resetView());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  return (
    <div className="editor">
      <header className="editor-top">
        <Link to="/library" className="btn">
          ← Library
        </Link>
        <h1 className="editor-title">{doc.title}</h1>
        <span className={`save-state save-${saveState}`} role="status" aria-live="polite">
          {SAVE_LABEL[saveState]}
        </span>
      </header>
      <Toolbar
        actions={{
          undo: () => run((c) => c.undo()),
          redo: () => run((c) => c.redo()),
          resetView: () => run((c) => c.resetView()),
          deleteSelection: () => run((c) => c.deleteSelection()),
          copy: () => run((c) => c.copySelection()),
          cut: () => run((c) => c.cutSelection()),
          paste: () => run((c) => c.paste()),
        }}
      />
      <ToolOptionsPanel />
      <div
        ref={hostRef}
        className="canvas-host"
        role="img"
        aria-label={`Drawing page for ${doc.title}. Draw with Apple Pencil, a mouse or your finger. Two fingers pan and zoom.`}
      >
        <canvas ref={committedRef} className="layer" />
        <canvas ref={liveRef} className="layer" />
        {perf && <PerfOverlay controller={controller} />}
      </div>
    </div>
  );
}
