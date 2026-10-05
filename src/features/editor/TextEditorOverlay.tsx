import { useEffect, useRef } from 'react';
import { TEXT_PAD, LINE_HEIGHT } from '@/engines/drawing';
import type { View } from '@/engines/drawing';
import type { EditTextRequest } from './CanvasController';

/**
 * Native <textarea> over the text box being edited: gives real keyboard input (including the
 * iPad hardware keyboard, IME and dictation) without re-implementing text editing on a canvas.
 */
export function TextEditorOverlay({
  req,
  view,
  onCommit,
  onCancel,
}: {
  req: EditTextRequest;
  view: View;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const o = req.obj;
  const s = view.scale;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Text box"
      defaultValue={o.text}
      spellCheck
      style={{
        left: o.cx * s + view.tx,
        top: o.cy * s + view.ty,
        width: o.w * s,
        minHeight: o.h * s,
        transform: `translate(-50%, -50%) rotate(${o.rot}rad)`,
        font: `${o.italic ? 'italic ' : ''}${o.bold ? '700' : '400'} ${o.fontSize * s}px/${LINE_HEIGHT} system-ui, -apple-system, 'Segoe UI', sans-serif`,
        color: o.color,
        padding: TEXT_PAD * s,
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${Math.max(o.h * s, el.scrollHeight)}px`;
      }}
      onBlur={(e) => finish(() => onCommit(e.currentTarget.value))}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(onCancel);
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          finish(() => onCommit(e.currentTarget.value));
        }
      }}
    />
  );
}
