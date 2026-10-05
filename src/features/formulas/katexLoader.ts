import 'katex/dist/katex.min.css';
import katex from 'katex';

/** Kept in its own module so KaTeX (and its fonts) load only when a formula is shown. */
export function renderLatex(latex: string, display = true): string {
  return katex.renderToString(latex, {
    throwOnError: false,
    displayMode: display,
    output: 'htmlAndMathml',
    trust: false,
    strict: 'ignore',
  });
}
