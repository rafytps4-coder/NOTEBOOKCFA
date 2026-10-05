import { useEffect, useState } from 'react';
import { Dialog } from '@/ui/Dialog';

const KEY = 'notebook.firstRunDone';

// A per-device UI preference (like the theme), so it lives in localStorage rather than the notebook data.
const isDone = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag on every load
  }
};

const STEPS = [
  {
    title: 'Welcome to Notebook',
    body: 'A free handwriting notebook for your iPad and computer. It is private by design: everything stays on this device, there are no accounts, no ads and nothing to pay for. It works offline too.',
  },
  {
    title: 'Write with Apple Pencil',
    body: 'Draw with your Apple Pencil (or a mouse). Resting your palm on the screen won’t leave marks once the Pencil is in use. Use two fingers to scroll and pinch to zoom, and double-tap with one finger to reset the zoom. You can change this in Settings → Drawing.',
  },
  {
    title: 'Make your first notebook',
    body: 'In the Library, choose New notebook (or Quick note), or Import PDF to write on top of a document. Add pages with “+ New page”, pick ruled, grid or dotted paper under Page style, and add typed text, shapes and images from the toolbar.',
  },
  {
    title: 'Keep a backup',
    body: 'Your notes live in this browser’s storage, which a device can clear when it is short of space. Settings → Storage & backup saves everything to a single file you can keep anywhere, and can remind you to do it regularly.',
  },
];

/** Short, skippable introduction. Shown once; can be reopened from Settings → About. */
export function FirstRunGuide({
  forceOpen,
  onClosed,
}: {
  forceOpen?: boolean;
  onClosed?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!isDone());
  }, []);
  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setShow(true);
    }
  }, [forceOpen]);

  const finish = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    onClosed?.();
  };
  if (!show) return null;
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  return (
    <Dialog title={s.title} onClose={finish}>
      <p>{s.body}</p>
      <p className="muted" aria-live="polite">
        Step {step + 1} of {STEPS.length}
      </p>
      <div className="btn-row end">
        <button className="btn" onClick={finish}>
          Skip
        </button>
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button
          className="btn primary"
          autoFocus
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </Dialog>
  );
}
