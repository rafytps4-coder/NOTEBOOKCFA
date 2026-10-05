import { useEffect } from 'react';
import { getSetting, setSetting } from '@/core';
import { DEFAULT_TOOL_OPTIONS, type ToolPreset } from '@/engines/drawing';
import { useEditorStore } from './editorStore';
import { DEFAULT_SHAPE, DEFAULT_TEXT } from './objectFactory';
import type { InputMode } from './CanvasController';

const K = {
  options: 'editor.toolOptions',
  presets: 'editor.presets',
  inputMode: 'editor.inputMode',
  tool: 'editor.tool',
  text: 'editor.text',
  shape: 'editor.shape',
  shapeSnap: 'editor.shapeSnap',
};

/** Loads tool options/presets/input mode once, then saves them whenever they change. */
export function useEditorSettings(): void {
  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    void (async () => {
      const [options, presets, inputMode, tool, text, shape, shapeSnap] = await Promise.all([
        getSetting(K.options, DEFAULT_TOOL_OPTIONS),
        getSetting<ToolPreset[]>(K.presets, []),
        getSetting<InputMode>(K.inputMode, 'pencilAndFinger'),
        getSetting(K.tool, 'pen' as ReturnType<typeof useEditorStore.getState>['tool']),
        getSetting(K.text, DEFAULT_TEXT),
        getSetting(K.shape, DEFAULT_SHAPE),
        getSetting(K.shapeSnap, false),
      ]);
      if (cancelled) return;
      useEditorStore.setState({
        options: { ...DEFAULT_TOOL_OPTIONS, ...options },
        presets,
        inputMode,
        // A saved text/shape/lasso tool is not restored: start each session with an ink tool.
        tool: ['text', 'shape', 'lasso', 'eraser'].includes(tool) ? 'pen' : tool,
        text: { ...DEFAULT_TEXT, ...text },
        shape: { ...DEFAULT_SHAPE, ...shape },
        shapeSnap,
      });
      // Persist later changes (only the keys we own).
      unsub = useEditorStore.subscribe((s, prev) => {
        if (s.options !== prev.options) void setSetting(K.options, s.options);
        if (s.presets !== prev.presets) void setSetting(K.presets, s.presets);
        if (s.inputMode !== prev.inputMode) void setSetting(K.inputMode, s.inputMode);
        if (s.tool !== prev.tool) void setSetting(K.tool, s.tool);
        if (s.text !== prev.text) void setSetting(K.text, s.text);
        if (s.shape !== prev.shape) void setSetting(K.shape, s.shape);
        if (s.shapeSnap !== prev.shapeSnap) void setSetting(K.shapeSnap, s.shapeSnap);
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}
