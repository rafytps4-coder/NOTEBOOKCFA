export type { Stroke, StrokePoint, StrokeTool } from '@/core/models';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** Tools the canvas understands. Pen/pencil/highlighter make strokes; text/shape make objects; lasso is the select tool. */
export type EditorTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'lasso' | 'text' | 'shape';

export interface ToolOptions {
  color: string;
  width: number;
  /** 0.05 - 1 */
  opacity: number;
}

export interface ToolPreset extends ToolOptions {
  id: string;
  name: string;
  tool: 'pen' | 'pencil' | 'highlighter';
}

export const INK_TOOLS = ['pen', 'pencil', 'highlighter'] as const;

export const DEFAULT_TOOL_OPTIONS: Record<(typeof INK_TOOLS)[number], ToolOptions> = {
  pen: { color: '#1d1c1a', width: 2.5, opacity: 1 },
  pencil: { color: '#3a3a3a', width: 2, opacity: 0.8 },
  highlighter: { color: '#ffe14d', width: 18, opacity: 0.45 },
};

export const PALETTE = [
  '#1d1c1a',
  '#d62828',
  '#f77f00',
  '#ffe14d',
  '#2a9d4b',
  '#1e88e5',
  '#6a4fd1',
  '#8d6e63',
] as const;
