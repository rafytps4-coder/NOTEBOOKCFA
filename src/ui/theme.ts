import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'notebook.theme';

function load(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable: fall back to system */
  }
  return 'system';
}

/** `system` removes the override so `prefers-color-scheme` in CSS decides. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: load(),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
    applyTheme(mode);
    set({ mode });
  },
}));
