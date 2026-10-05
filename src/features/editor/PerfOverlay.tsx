import { useEffect, useState } from 'react';
import type { CanvasController } from './CanvasController';

/** Developer-only. Toggle with Ctrl/Cmd+Shift+P, or open the editor with ?perf=1. */
export function PerfOverlay({ controller }: { controller: CanvasController | null }) {
  const [stats, setStats] = useState({ frameMs: 0, pointsPerSec: 0 });
  useEffect(() => {
    const id = window.setInterval(() => controller && setStats(controller.perf()), 500);
    return () => window.clearInterval(id);
  }, [controller]);
  return (
    <div className="perf" aria-hidden="true">
      frame {stats.frameMs.toFixed(1)} ms · {stats.pointsPerSec} pts/s ·{' '}
      {controller?.strokes.length ?? 0} strokes
    </div>
  );
}
