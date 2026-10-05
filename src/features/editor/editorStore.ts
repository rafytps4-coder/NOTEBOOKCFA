import { create } from 'zustand';
import type { PageObject } from '@/engines/drawing';
import { DEFAULT_SHAPE, DEFAULT_TEXT, type ShapeOptions, type TextOptions } from './objectFactory';
import {
  DEFAULT_TOOL_OPTIONS,
  INK_TOOLS,
  type EditorTool,
  type ToolOptions,
  type ToolPreset,
} from '@/engines/drawing';
import { newId } from '@/core/ids';
import type { InputMode } from './CanvasController';
import type { SaveState } from './PageSaver';

type InkTool = (typeof INK_TOOLS)[number];

interface EditorState {
  tool: EditorTool;
  options: Record<InkTool, ToolOptions>;
  presets: ToolPreset[];
  inputMode: InputMode;
  text: TextOptions;
  shape: ShapeOptions;
  shapeSnap: boolean;
  // Reported by the canvas controller
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  /** The single selected object, when exactly one object (and no ink) is selected. */
  selectedObject: PageObject | null;
  zoomPct: number;
  saveState: SaveState;
  perfOverlay: boolean;
  /** Page whose undo/redo/selection the toolbar controls. */
  activePageId: string | null;
  /** Tool options panel visible (collapsed by default on narrow screens to leave room to write). */
  optionsOpen: boolean;
  toggleOptions: () => void;

  setTool: (t: EditorTool) => void;
  setOption: (patch: Partial<ToolOptions>) => void;
  setInputMode: (m: InputMode) => void;
  setText: (p: Partial<TextOptions>) => void;
  setShape: (p: Partial<ShapeOptions>) => void;
  setShapeSnap: (on: boolean) => void;
  savePreset: (name: string) => void;
  renamePreset: (id: string, name: string) => void;
  deletePreset: (id: string) => void;
  applyPreset: (id: string) => void;
  patch: (p: Partial<EditorState>) => void;
}

export const isInkTool = (t: EditorTool): t is InkTool =>
  (INK_TOOLS as readonly string[]).includes(t);

/** Options of the currently selected tool (pen's when an eraser/lasso is active). */
export function activeOptions(s: Pick<EditorState, 'tool' | 'options'>): ToolOptions {
  return s.options[isInkTool(s.tool) ? s.tool : 'pen'];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: 'pen',
  options: structuredClone(DEFAULT_TOOL_OPTIONS),
  presets: [],
  inputMode: 'pencilAndFinger',
  text: DEFAULT_TEXT,
  shape: DEFAULT_SHAPE,
  shapeSnap: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  selectedObject: null,
  zoomPct: 100,
  saveState: 'saved',
  perfOverlay: false,
  activePageId: null,
  optionsOpen: typeof window === 'undefined' || window.innerWidth > 600,
  toggleOptions: () => set((st) => ({ optionsOpen: !st.optionsOpen })),

  setTool: (tool) => set({ tool }),
  setOption: (patch) => {
    const { tool, options } = get();
    if (!isInkTool(tool)) return;
    set({ options: { ...options, [tool]: { ...options[tool], ...patch } } });
  },
  setInputMode: (inputMode) => set({ inputMode }),
  setText: (p) => set({ text: { ...get().text, ...p } }),
  setShape: (p) => set({ shape: { ...get().shape, ...p } }),
  setShapeSnap: (shapeSnap) => set({ shapeSnap }),
  savePreset: (name) => {
    const { tool, options, presets } = get();
    if (!isInkTool(tool)) return;
    set({ presets: [...presets, { id: newId(), name, tool, ...options[tool] }] });
  },
  renamePreset: (id, name) =>
    set({ presets: get().presets.map((p) => (p.id === id ? { ...p, name } : p)) }),
  deletePreset: (id) => set({ presets: get().presets.filter((p) => p.id !== id) }),
  applyPreset: (id) => {
    const p = get().presets.find((x) => x.id === id);
    if (!p) return;
    const { id: _id, name: _name, tool, ...opts } = p;
    void _id;
    void _name;
    set({ tool, options: { ...get().options, [tool]: opts } });
  },
  patch: (p) => set(p),
}));
