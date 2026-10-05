import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { purgeDeletedPages, type NotebookDocument, type Page, type PageStyle } from '@/core';
import { ConfirmDialog, PromptDialog } from '@/ui/Dialogs';
import { useLive, useSetting } from '@/ui/useLive';
import { listPages } from '@/core';
import type { NavRequest } from './CanvasController';
import { ContinuousPages } from './ContinuousPages';
import { PageActions } from './pageActions';
import { PageHistory } from './pageHistory';
import { PageSidebar } from './PageSidebar';
import { PageStylePanel } from './PageStylePanel';
import { PageView } from './PageView';
import { activeController } from './pageRegistry';
import { Toolbar } from './Toolbar';
import { renderSelectionPng } from './selectionSnapshot';
import { collectSelectionActions, useEnabledHelpers } from '@/helpers/state';
import type { SelectionContext } from '@/helpers/types';
import { CreateFromSelection, type SelectionDraft } from '../study/CreateFromSelection';
import { ToolOptionsPanel } from './ToolOptionsPanel';
import { useEditorStore } from './editorStore';
import { useEditorSettings } from './useEditorSettings';
import { useDataNotices } from './dataNotices';
import { ShortcutsHost } from '../help/ShortcutsDialog';
import { clearImageCache } from './imageCache';
import { importImageFile } from './imageImport';
import { ItemMenu } from '@/ui/ItemMenu';
import { flushAllPages } from './pageRegistry';
import { clearInkCache } from './pageRegistry';
import { pdfBitmaps } from '../pdf/bitmapCache';
import { closePdf } from '../pdf/pdfDocs';
import { exportDocumentAsPdf } from '../pdf/exportActions';
import type { ExportMode } from '../pdf/exportPdf';
import { saveDocumentFile } from '../backup/saveArchive';
import {
  clearAnnotations,
  hasAnnotations,
  restoreAnnotations,
  snapshotAnnotations,
} from '../pdf/annotations';

type ViewMode = 'continuous' | 'single';
const SAVE_LABEL = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  error: 'Save failed, retrying',
  full: 'Storage full: not saved',
};
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function DocumentEditor({
  doc,
  initialPages,
  defaultStyle,
  initialPageId,
}: {
  doc: NotebookDocument;
  initialPages: Page[];
  defaultStyle: PageStyle;
  /** Open scrolled to this page (e.g. from a search result). */
  initialPageId?: string;
}) {
  useEditorSettings();
  const pages = useLive(() => listPages(doc.id), [doc.id], initialPages);
  const [viewMode, setViewMode] = useSetting<ViewMode>('editor.viewMode', 'continuous');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 900);
  const [styleOpen, setStyleOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomState, setZoomState] = useState<number | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [dlg, setDlg] = useState<
    | { t: 'delete'; page: Page }
    | { t: 'move'; page: Page; index: number }
    | { t: 'last' }
    | { t: 'wipe' }
    | null
  >(null);
  const [cardDraft, setCardDraft] = useState<SelectionDraft | null>(null);
  const [, bump] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const isPdf = doc.kind === 'pdf';
  const dataNotices = useDataNotices((n) => n.notices);
  const dismissNotice = useDataNotices((n) => n.dismiss);
  const [shortcutsSignal, setShortcutsSignal] = useState(0);
  // Bumped when ink is replaced wholesale (remove/restore annotations) so every page reloads it.
  const [epoch, setEpoch] = useState(0);
  const [pdfMenu, setPdfMenu] = useState<{ x: number; y: number } | null>(null);
  const [job, setJob] = useState<{ label: string; done: number; total: number } | null>(null);
  const saveState = useEditorStore((s) => s.saveState);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const history = useMemo(() => new PageHistory(), []);
  const defaultsRef = useRef(defaultStyle);
  const actions = useMemo(
    () => new PageActions(doc.id, history, () => defaultsRef.current),
    [doc.id, history],
  );
  useEffect(() => {
    const off = history.subscribe(() => bump((n) => n + 1));
    return () => void off();
  }, [history]);

  const index = Math.min(currentIndex, Math.max(0, pages.length - 1));
  const current = pages[index];

  // Keep the document tidy: remove pages deleted (and undo-able) in a previous session, and again on exit.
  useEffect(() => {
    void purgeDeletedPages(doc.id);
    return () => void purgeDeletedPages(doc.id);
  }, [doc.id]);

  // ---- continuous-mode zoom -------------------------------------------------
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => setContainerW(sc.clientWidth));
    ro.observe(sc);
    setContainerW(sc.clientWidth);
    return () => ro.disconnect();
  }, [viewMode]);

  const fitZoom = clampZoom(Math.min(1.6, (containerW - 32) / (pages[0]?.width ?? 794)));
  const zoom = zoomState ?? fitZoom;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingScroll = useRef<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    const p = pendingScroll.current;
    if (sc && p) {
      sc.scrollTop = p.top;
      sc.scrollLeft = p.left;
      pendingScroll.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    if (viewMode === 'continuous') useEditorStore.setState({ zoomPct: Math.round(zoom * 100) });
  }, [zoom, viewMode]);

  const accum = useRef({ f: 1, dx: 0, dy: 0, ax: 0, ay: 0, reset: false, raf: 0 });
  const onNavigate = useCallback((pageId: string, n: NavRequest) => {
    const a = accum.current;
    if (n.reset) a.reset = true;
    else {
      if (n.factor !== 1) {
        const host = document.getElementById(`page-host-${pageId}`);
        const r = host?.getBoundingClientRect();
        a.f *= n.factor;
        a.ax = (r?.left ?? 0) + n.cx;
        a.ay = (r?.top ?? 0) + n.cy;
      }
      a.dx += n.dx;
      a.dy += n.dy;
    }
    if (a.raf) return;
    a.raf = requestAnimationFrame(() => {
      const sc = scrollerRef.current;
      const { f, dx, dy, ax, ay, reset } = a;
      Object.assign(a, { f: 1, dx: 0, dy: 0, reset: false, raf: 0 });
      if (!sc) return;
      if (reset) return setZoomState(null);
      const old = zoomRef.current;
      const next = clampZoom(old * f);
      if (next !== old) {
        const box = sc.getBoundingClientRect();
        const lx = ax - box.left;
        const ly = ay - box.top;
        const ratio = next / old;
        pendingScroll.current = {
          top: (sc.scrollTop + ly) * ratio - ly - dy,
          left: (sc.scrollLeft + lx) * ratio - lx - dx,
        };
        setZoomState(next);
      } else sc.scrollBy(-dx, -dy);
    });
  }, []);

  // ---- navigation -------------------------------------------------------------
  const goTo = useCallback(
    (i: number) => {
      const target = Math.max(0, Math.min(i, pages.length - 1));
      setCurrentIndex(target);
      const p = pages[target];
      if (viewMode === 'continuous' && p) {
        document.getElementById(`page-${p.id}`)?.scrollIntoView({ block: 'start' });
      }
    },
    [pages, viewMode],
  );

  const onCurrent = useCallback((i: number) => setCurrentIndex(i), []);

  // Opened from a search result: jump to that page once, after the first layout.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !initialPageId) return;
    const i = pages.findIndex((p) => p.id === initialPageId);
    if (i < 0) return;
    jumped.current = true;
    setCurrentIndex(i);
    window.setTimeout(() => goTo(i), 80); // after the first layout
  }, [initialPageId, pages, goTo]);

  // A page created by the user: jump to it as soon as the live query delivers it.
  const pendingGo = useRef<string | null>(null);
  const afterAdd = useCallback((page: Page) => {
    pendingGo.current = page.id;
    bump((n) => n + 1);
  }, []);
  useEffect(() => {
    const id = pendingGo.current;
    if (!id) return;
    const i = pages.findIndex((p) => p.id === id);
    if (i >= 0) {
      pendingGo.current = null;
      goTo(i);
    }
  }, [pages, goTo]);

  // ---- keyboard ----------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const c = activeController();
      if (mod && e.shiftKey && k === 'p') {
        e.preventDefault();
        useEditorStore.setState((s) => ({ perfOverlay: !s.perfOverlay }));
      } else if (mod && k === 'enter') {
        e.preventDefault();
        void actions.addAfter(index).then(afterAdd);
      } else if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowDown')) {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault();
        goTo(index - 1);
      } else if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) c?.redo();
        else c?.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        c?.redo();
      } else if (mod && k === 'c') c?.copySelection();
      else if (mod && k === 'x') c?.cutSelection();
      else if (mod && k === 'v') c?.paste();
      else if (e.key === 'Delete' || e.key === 'Backspace') c?.deleteSelection();
      else if (!mod && k === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, index, goTo, afterAdd, viewMode]);

  const helperList = useEnabledHelpers();
  async function getHelperActions() {
    const ctx = await selectionContext();
    if (!ctx) return [];
    return collectSelectionActions(helperList, ctx).map(({ action }) => ({
      label: action.label,
      onSelect: () => void action.run(),
    }));
  }

  async function selectionContext(): Promise<SelectionContext | null> {
    const c = activeController();
    const pageId = useEditorStore.getState().activePageId;
    const info = c?.selectionInfo();
    if (!c || !pageId || !info) return null;
    const text = info.objects
      .flatMap((o) => (o.type === 'text' ? [o.text.trim()] : []))
      .filter(Boolean)
      .join('\n');
    return { documentId: doc.id, pageId, text, snapshot: () => renderSelectionPng(info) };
  }

  async function startFlashcard() {
    const c = activeController();
    const pageId = useEditorStore.getState().activePageId;
    const info = c?.selectionInfo();
    if (!c || !pageId || !info) return;
    const text = info.objects
      .flatMap((o) => (o.type === 'text' ? [o.text.trim()] : []))
      .filter(Boolean)
      .join('\n');
    setCardDraft({
      documentId: doc.id,
      pageId,
      text,
      snapshot: await renderSelectionPng(info),
    });
  }

  const resetView = () => {
    if (viewMode === 'continuous') setZoomState(null);
    else activeController()?.resetView();
  };

  const insertImages = async (files: File[]) => {
    setNotice(null);
    for (const file of files) {
      const c = activeController();
      if (!c) {
        setNotice('Tap or draw on a page first, then choose an image.');
        return;
      }
      try {
        const img = await importImageFile(file, doc.id);
        c.insertImage(img.assetId, img.width, img.height);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Could not add the image.');
      }
    }
  };

  useEffect(() => () => clearImageCache(), []);
  useEffect(
    () => () => {
      if (isPdf) {
        pdfBitmaps.release(doc.id); // free rendered pages and the parsed document
        void closePdf(doc.id);
      }
    },
    [doc.id, isPdf],
  );

  // ---- PDF actions ----------------------------------------------------------------
  const runExport = async (mode: ExportMode | 'original') => {
    setNotice(null);
    setJob({ label: 'Preparing…', done: 0, total: 1 });
    try {
      await flushAllPages(); // include ink that is still waiting for its autosave
      await exportDocumentAsPdf(doc.id, doc.title, mode, (p) =>
        setJob({ label: 'Building PDF', done: p.done, total: p.total }),
      );
    } catch (e) {
      console.error(e);
      setNotice('The PDF could not be exported. Your notebook is unchanged.');
    } finally {
      setJob(null);
    }
  };

  const runNotebookFile = async () => {
    setNotice(null);
    setJob({ label: 'Saving notebook file', done: 0, total: 1 });
    try {
      await flushAllPages();
      await saveDocumentFile(doc.id, doc.title, (p) =>
        setJob({ label: 'Saving notebook file', done: p.done, total: p.total }),
      );
    } catch (e) {
      console.error(e);
      setNotice('The notebook file could not be saved. Your notebook is unchanged.');
    } finally {
      setJob(null);
    }
  };

  const wipeAnnotations = async () => {
    await flushAllPages();
    const snap = await snapshotAnnotations(doc.id);
    if (!hasAnnotations(snap)) return setNotice('There are no annotations to remove.');
    await clearAnnotations(snap);
    clearInkCache();
    setEpoch((n) => n + 1);
    history.push({
      label: 'remove annotations',
      undo: async () => {
        await restoreAnnotations(snap);
        clearInkCache();
        setEpoch((n) => n + 1);
      },
      redo: async () => {
        await clearAnnotations(snap);
        clearInkCache();
        setEpoch((n) => n + 1);
      },
    });
  };

  const jumpToPdfPage = (pdfIndex: number) => {
    const i = pages.findIndex((p) => p.pdf?.index === pdfIndex);
    if (i >= 0) goTo(i);
  };

  const askDelete = (page: Page) =>
    pages.length <= 1 ? setDlg({ t: 'last' }) : setDlg({ t: 'delete', page });

  return (
    <div className="editor">
      <header className="editor-top">
        <Link to="/library" className="btn">
          ← Library
        </Link>
        <h1 className="editor-title">{doc.title}</h1>
        <button
          className="btn"
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          Pages
        </button>
        <button className="btn" aria-pressed={styleOpen} onClick={() => setStyleOpen((v) => !v)}>
          Page style
        </button>
        <div className="btn-row" role="group" aria-label="Page layout">
          <button
            className="btn"
            aria-pressed={viewMode === 'continuous'}
            onClick={() => setViewMode('continuous')}
          >
            Scroll
          </button>
          <button
            className="btn"
            aria-pressed={viewMode === 'single'}
            onClick={() => setViewMode('single')}
          >
            Single page
          </button>
        </div>
        <button
          className="btn"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPdfMenu({ x: r.left, y: r.bottom });
          }}
        >
          Export ▾
        </button>
        <button
          className="btn"
          onClick={() => setShortcutsSignal((n) => n + 1)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          ⌨
        </button>
        <span className={`save-state save-${saveState}`} role="status" aria-live="polite">
          {SAVE_LABEL[saveState]}
        </span>
      </header>
      {job && (
        <div className="pdf-progress" role="status">
          <span>
            {job.label}… {job.done}/{job.total}
          </span>
          <progress value={job.done} max={job.total} />
        </div>
      )}
      {cardDraft && <CreateFromSelection draft={cardDraft} onClose={() => setCardDraft(null)} />}
      <Toolbar
        actions={{
          undo: () => activeController()?.undo(),
          redo: () => activeController()?.redo(),
          resetView,
          deleteSelection: () => activeController()?.deleteSelection(),
          copy: () => activeController()?.copySelection(),
          cut: () => activeController()?.cutSelection(),
          paste: () => activeController()?.paste(),
          insertImages: (f) => void insertImages(f),
          createFlashcard: () => void startFlashcard(),
          helperActions: {
            available: helperList.some((h) => !!h.selectionActions),
            get: getHelperActions,
          },
        }}
      />
      {saveState === 'full' && (
        <p role="alert" className="notice error-notice">
          Your device is out of storage space, so the latest changes are only kept in memory for
          now. Free some space (or delete things you no longer need), then keep writing; saving
          retries automatically. Settings → Storage &amp; backup can export a backup first.
        </p>
      )}
      {dataNotices.map((n) => (
        <p key={n.id} role="status" className="notice">
          {n.message}
          <button className="btn" onClick={() => dismissNotice(n.id)}>
            OK
          </button>
        </p>
      ))}
      <ShortcutsHost openSignal={shortcutsSignal} />
      {notice && (
        <p role="alert" className="notice error-notice">
          {notice}
          <button className="btn" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
      <ToolOptionsPanel />
      {styleOpen && current && (
        <PageStylePanel
          page={current}
          pageIds={pages.map((p) => p.id)}
          actions={actions}
          onClose={() => setStyleOpen(false)}
        />
      )}
      <div className="editor-body">
        {sidebarOpen && (
          <PageSidebar
            pages={pages}
            currentId={current?.id ?? null}
            actions={actions}
            history={history}
            historyVersion={0}
            onSelect={(i) => {
              goTo(i);
              if (window.innerWidth < 700) setSidebarOpen(false);
            }}
            onAfterAdd={afterAdd}
            onAskDelete={askDelete}
            onAskMove={(page, i) => setDlg({ t: 'move', page, index: i })}
            onClose={() => setSidebarOpen(false)}
            pdfDocId={isPdf ? doc.id : undefined}
            onJumpPdf={jumpToPdfPage}
          />
        )}
        <div className="editor-main">
          {viewMode === 'continuous' ? (
            <div ref={scrollerRef} className="pages-scroller">
              <ContinuousPages
                doc={doc}
                pages={pages}
                zoom={zoom}
                scrollerRef={scrollerRef}
                onCurrent={onCurrent}
                onNavigate={onNavigate}
                epoch={epoch}
              />
            </div>
          ) : (
            current && (
              <div className="single-host">
                <PageView
                  key={`${current.id}:${epoch}`}
                  doc={doc}
                  page={current}
                  pageNumber={index + 1}
                  pageCount={pages.length}
                />
              </div>
            )
          )}
          <div className="pagebar" role="group" aria-label="Page navigation">
            <button
              className="btn"
              disabled={index <= 0}
              onClick={() => goTo(index - 1)}
              aria-label="Previous page"
              title="Previous page (PageUp)"
            >
              ◀
            </button>
            <span aria-live="polite">
              Page {index + 1} of {pages.length}
            </span>
            <label className="goto">
              Go to
              <input
                type="number"
                min={1}
                max={pages.length}
                aria-label="Go to page number"
                key={index}
                defaultValue={index + 1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const n = Math.round(Number(e.currentTarget.value));
                    if (n >= 1 && n <= pages.length) goTo(n - 1);
                  }
                  e.stopPropagation(); // typing digits must not trigger editor shortcuts
                }}
              />
            </label>
            <button
              className="btn"
              disabled={index >= pages.length - 1}
              onClick={() => goTo(index + 1)}
              aria-label="Next page"
              title="Next page (PageDown)"
            >
              ▶
            </button>
            <button
              className="btn"
              onClick={() => void actions.addAfter(index).then(afterAdd)}
              title="New page after this one (Ctrl/Cmd+Enter)"
            >
              + New page
            </button>
          </div>
        </div>
      </div>

      {dlg?.t === 'delete' && (
        <ConfirmDialog
          title="Delete this page?"
          message={`Page ${pages.findIndex((p) => p.id === dlg.page.id) + 1} and its ink will be deleted. You can undo this until you leave the notebook.`}
          confirmLabel="Delete page"
          danger
          onClose={() => setDlg(null)}
          onConfirm={() => {
            const page = dlg.page;
            setDlg(null);
            void actions.remove(page.id);
          }}
        />
      )}
      {pdfMenu && (
        <ItemMenu
          x={pdfMenu.x}
          y={pdfMenu.y}
          onClose={() => setPdfMenu(null)}
          actions={
            isPdf
              ? [
                  {
                    label: 'Export annotated PDF',
                    onSelect: () => void runExport('annotated'),
                  },
                  { label: 'Export original PDF', onSelect: () => void runExport('original') },
                  {
                    label: 'Export annotations only',
                    onSelect: () => void runExport('annotationsOnly'),
                  },
                  { label: 'Export notebook file', onSelect: () => void runNotebookFile() },
                  {
                    label: 'Remove all annotations…',
                    danger: true,
                    onSelect: () => setDlg({ t: 'wipe' }),
                  },
                ]
              : [
                  { label: 'Export as PDF', onSelect: () => void runExport('annotated') },
                  { label: 'Export notebook file', onSelect: () => void runNotebookFile() },
                ]
          }
        />
      )}
      {dlg?.t === 'wipe' && (
        <ConfirmDialog
          title="Remove all annotations?"
          message="All ink, text, shapes and images on every page will be removed. The original PDF is not changed. Use “Undo page change” in the Pages list to bring them back until you leave this document."
          confirmLabel="Remove annotations"
          danger
          onClose={() => setDlg(null)}
          onConfirm={() => {
            setDlg(null);
            void wipeAnnotations();
          }}
        />
      )}
      {dlg?.t === 'last' && (
        <ConfirmDialog
          title="Can’t delete the last page"
          message="A notebook always keeps at least one page. Add another page first, or delete the notebook from the Library."
          confirmLabel="OK"
          onClose={() => setDlg(null)}
          onConfirm={() => setDlg(null)}
        />
      )}
      {dlg?.t === 'move' && (
        <PromptDialog
          title="Move page"
          label={`New position (1–${pages.length})`}
          initial={String(dlg.index + 1)}
          confirmLabel="Move"
          onClose={() => setDlg(null)}
          onSubmit={(v) => {
            const n = Math.round(Number(v));
            const page = dlg.page;
            setDlg(null);
            if (Number.isFinite(n) && n >= 1 && n <= pages.length)
              void actions.move(page.id, n - 1);
          }}
        />
      )}
    </div>
  );
}
