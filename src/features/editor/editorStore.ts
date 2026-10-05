import { create } from 'zustand';
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
  // Reported by the canvas controller
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  zoomPct: number;
  saveState: SaveState;
  perfOverlay: boolean;
  /** Page whose undo/redo/selection the toolbar controls. */
  activePageId: string | null;

  setTool: (t: EditorTool) => void;
  setOption: (patch: Partial<ToolOptions>) => void;
  setInputMode: (m: InputMode) => void;
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
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  zoomPct: 100,
  saveState: 'saved',
  perfOverlay: false,
  activePageId: null,

  setTool: (tool) => set({ tool }),
  setOption: (patch) => {
    const { tool, options } = get();
    if (!isInkTool(tool)) return;
    set({ options: { ...options, [tool]: { ...options[tool], ...patch } } });
  },
  setInputMode: (inputMode) => set({ inputMode }),
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
