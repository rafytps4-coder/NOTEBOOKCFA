import { useEffect, useRef, useState } from 'react';
import {
  ensureAssetInDocument,
  setPageThumbnail,
  setThumbnail,
  type NotebookDocument,
  type Page,
} from '@/core';
import { CanvasController, type EditTextRequest, type NavRequest } from './CanvasController';
import { PageSaver } from './PageSaver';
import { PerfOverlay } from './PerfOverlay';
import { activeOptions, useEditorStore } from './editorStore';
import {
  activate,
  cacheInk,
  hasActive,
  loadInk,
  registerController,
  registerSaver,
  reportSave,
  unregisterController,
} from './pageRegistry';
import { pdfPageBackground } from '../pdf/pdfBackground';
import { renderThumbnail } from './thumbnail';
import { TextEditorOverlay } from './TextEditorOverlay';

interface Props {
  doc: NotebookDocument;
  page: Page;
  pageNumber: number;
  pageCount: number;
  /** Set in continuous mode: the host is exactly the page at this scale. */
  fixedScale?: number;
  onNavigate?: (pageId: string, n: NavRequest) => void;
}

/** One live, drawable page: two canvases + controller + autosave + thumbnail upkeep. */
export function PageView({ doc, page, pageNumber, pageCount, fixedScale, onNavigate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const committedRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<CanvasController | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const scaleRef = useRef(fixedScale);
  scaleRef.current = fixedScale; // the controller is built asynchronously: read the latest zoom
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;
  const thumbRef = useRef<() => void>(() => {});
  const tool = useEditorStore((s) => s.tool);
  const perf = useEditorStore((s) => s.perfOverlay);
  const [edit, setEdit] = useState<EditTextRequest | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const committed = committedRef.current;
    const live = liveRef.current;
    if (!host || !committed || !live) return;
    let cancelled = false;
    let controller: CanvasController | null = null;
    let saver: PageSaver | null = null;
    let thumbTimer: number | undefined;
    let thumbPending = false;
    const pageId = page.id;

    const makeThumb = async () => {
      thumbPending = false;
      const c = controller;
      if (!c) return;
      const p = pageRef.current;
      const blob = await renderThumbnail(c.content(), p, doc.id);
      if (!blob) return;
      await setPageThumbnail(doc.id, pageId, blob);
      if (p.order === 0) await setThumbnail(doc.id, blob);
    };
    thumbRef.current = () => {
      thumbPending = true;
      window.clearTimeout(thumbTimer);
      thumbTimer = window.setTimeout(() => void makeThumb(), 1500);
    };

    void loadInk(pageId).then((ink) => {
      if (cancelled) return;
      const store = useEditorStore;
      const s = new PageSaver(
        pageId,
        () => controller!.content(),
        (st) => reportSave(pageId, st),
        () => thumbRef.current(),
      );
      saver = s;
      registerSaver(pageId, s);
      const c = new CanvasController({
        host,
        committed,
        live,
        page: pageRef.current,
        strokes: ink.strokes,
        objects: ink.objects,
        fixedScale: scaleRef.current,
        background: pageRef.current.pdf
          ? pdfPageBackground(doc.id, pageRef.current.pdf.index)
          : undefined,
        getTool: () => {
          const st = store.getState();
          return {
            tool: st.tool,
            options: activeOptions(st),
            inputMode: st.inputMode,
            text: st.text,
            shape: st.shape,
            shapeSnap: st.shapeSnap,
          };
        },
        onChanged: (content) => {
          cacheInk(pageId, content);
          s.markDirty();
        },
        onEditText: setEdit,
        onToolChange: (t) => store.getState().setTool(t),
        resolveAsset: (assetId) => ensureAssetInDocument(assetId, doc.id),
        onUi: (p) => {
          if (store.getState().activePageId !== pageId) return;
          if (fixedScale !== undefined) delete p.zoomPct; // the container owns zoom in this mode
          store.setState(p);
        },
        onNavigate: (n) => navRef.current?.(pageId, n),
        onActivate: () => activate(pageId),
      });
      controller = c;
      ctrlRef.current = c;
      registerController(pageId, c);
      if (!hasActive()) activate(pageId);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(thumbTimer);
      if (thumbPending) void makeThumb(); // don't lose a pending thumbnail when scrolled away
      unregisterController(pageId);
      registerSaver(pageId, null);
      ctrlRef.current = null;
      void saver?.dispose().then(() => reportSave(pageId, null));
      controller?.dispose();
    };
    // Controller is rebuilt only when the page identity changes; look/scale updates go via effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, doc.id]);

  // Template/size/background edits: redraw the page and refresh its thumbnail (not on first mount).
  const lookKey = JSON.stringify([page.width, page.height, page.template, page.background]);
  const lastLook = useRef(lookKey);
  useEffect(() => {
    if (lastLook.current === lookKey) return;
    lastLook.current = lookKey;
    ctrlRef.current?.setLook(pageRef.current);
    thumbRef.current();
  }, [lookKey]);

  useEffect(() => {
    if (fixedScale !== undefined) ctrlRef.current?.setFixedScale(fixedScale);
  }, [fixedScale]);

  useEffect(() => ctrlRef.current?.setTool(), [tool]);

  return (
    <div
      ref={hostRef}
      id={`page-host-${page.id}`}
      className={fixedScale !== undefined ? 'canvas-host fixed' : 'canvas-host'}
      role="img"
      aria-label={`Page ${pageNumber} of ${pageCount} of ${doc.title}. Draw with Apple Pencil, a mouse or your finger. Two fingers pan and zoom.`}
    >
      <canvas ref={committedRef} className="layer" />
      <canvas ref={liveRef} className="layer" />
      {edit && ctrlRef.current && (
        <TextEditorOverlay
          key={edit.obj.id}
          req={edit}
          view={ctrlRef.current.viewState()}
          onCommit={(t) => ctrlRef.current?.commitText(t)}
          onCancel={() => ctrlRef.current?.cancelText()}
        />
      )}
      {perf && <PerfOverlay controller={ctrlRef.current} />}
    </div>
  );
}
