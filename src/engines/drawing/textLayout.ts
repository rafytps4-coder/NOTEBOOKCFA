export interface TextStyleSpec {
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

export const LINE_HEIGHT = 1.3;
export const TEXT_PAD = 6;

export function fontString(s: TextStyleSpec): string {
  return `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : '400 '}${s.fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/**
 * Greedy word wrap. `measure` returns the rendered width of a string in the current font.
 * Explicit newlines are kept; words longer than the line are split by character.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (word === '') continue;
      const trial = line + word;
      if (measure(trial) <= maxWidth || line === '') {
        line = trial;
        // A single over-long word: break by characters.
        while (measure(line) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function textHeight(lineCount: number, fontSize: number): number {
  return lineCount * fontSize * LINE_HEIGHT + TEXT_PAD * 2;
}
