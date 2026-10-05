import { create } from 'zustand';

export const TEXT_SCALES = [
  { id: 'small', label: 'Small', value: 0.9 },
  { id: 'default', label: 'Default', value: 1 },
  { id: 'large', label: 'Large', value: 1.15 },
  { id: 'xl', label: 'Extra large', value: 1.3 },
] as const;

const KEY = 'notebook.textScale';

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (TEXT_SCALES.some((t) => t.value === v)) return v;
  } catch {
    /* ignore */
  }
  return 1;
}

export const useTextScale = create<{ scale: number }>(() => ({ scale: load() }));

/** Scales the root font size; every size in the UI is in rem, so the whole interface follows. */
export function applyTextScale(value: number, persist = true): void {
  document.documentElement.style.setProperty('--text-scale', String(value));
  if (persist) {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      /* ignore */
    }
  }
  useTextScale.setState({ scale: value });
}
