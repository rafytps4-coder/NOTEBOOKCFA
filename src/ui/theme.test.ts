import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, useThemeStore } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('sets and clears the data-theme override', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('persists the chosen mode', () => {
    useThemeStore.getState().setMode('light');
    expect(localStorage.getItem('notebook.theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
