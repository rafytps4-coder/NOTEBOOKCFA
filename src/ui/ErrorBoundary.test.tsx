import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Bomb(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('shows a calm message with a way out instead of a blank screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(el.textContent).toContain('Something went wrong');
    expect(el.textContent).toContain('are saved on this device');
    expect(el.querySelector('[role=alert]')).not.toBeNull();
    expect([...el.querySelectorAll('button, a')].map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Reload', 'Try again', 'Go to Library']),
    );
    expect(el.textContent).toContain('kaboom'); // technical details are available
    await act(async () => root.unmount());
  });

  it('renders children normally when nothing throws', async () => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <p>fine</p>
        </ErrorBoundary>,
      );
    });
    expect(el.textContent).toBe('fine');
    await act(async () => root.unmount());
  });
});
