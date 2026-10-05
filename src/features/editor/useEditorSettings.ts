import { useEffect } from 'react';
import { getSetting, setSetting } from '@/core';
import { DEFAULT_TOOL_OPTIONS, type ToolPreset } from '@/engines/drawing';
import { useEditorStore } from './editorStore';
import type { InputMode } from './CanvasController';

const K = {
  options: 'editor.toolOptions',
  presets: 'editor.presets',
  inputMode: 'editor.inputMode',
  tool: 'editor.tool',
};

/** Loads tool options/presets/input mode once, then saves them whenever they change. */
export function useEditorSettings(): void {
  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    void (async () => {
      const [options, presets, inputMode, tool] = await Promise.all([
        getSetting(K.options, DEFAULT_TOOL_OPTIONS),
        getSetting<ToolPreset[]>(K.presets, []),
        getSetting<InputMode>(K.inputMode, 'pencilAndFinger'),
        getSetting(K.tool, 'pen' as ReturnType<typeof useEditorStore.getState>['tool']),
      ]);
      if (cancelled) return;
      useEditorStore.setState({
        options: { ...DEFAULT_TOOL_OPTIONS, ...options },
        presets,
        inputMode,
        tool,
      });
      // Persist later changes (only the keys we own).
      unsub = useEditorStore.subscribe((s, prev) => {
        if (s.options !== prev.options) void setSetting(K.options, s.options);
        if (s.presets !== prev.presets) void setSetting(K.presets, s.presets);
        if (s.inputMode !== prev.inputMode) void setSetting(K.inputMode, s.inputMode);
        if (s.tool !== prev.tool) void setSetting(K.tool, s.tool);
      });
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}
