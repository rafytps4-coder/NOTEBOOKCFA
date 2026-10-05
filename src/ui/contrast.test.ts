// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

/** Pull `--token: #hex;` declarations out of a CSS block that starts at `marker`. */
function tokens(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open, close).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g))
    out[m[1]!] = m[2]!;
  return out;
}

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const light = tokens(':root {');
const dark = tokens(":root[data-theme='dark'] {");

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast (WCAG AA)', (_name, t) => {
  const text: [string, string][] = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text', 'surface-2'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['text-muted', 'surface-2'],
    ['accent-contrast', 'accent'],
    ['accent', 'surface'], // links and outlines drawn in the accent colour
    ['focus', 'bg'],
    ['focus', 'surface'],
  ];
  it.each(text)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], `${fg} defined`).toBeDefined();
    expect(t[bg], `${bg} defined`).toBeDefined();
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrast helper', () => {
  it('black on white is 21:1', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});
