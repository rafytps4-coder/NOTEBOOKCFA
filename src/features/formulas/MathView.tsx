import { useEffect, useState } from 'react';

/**
 * A rendered equation. The picture is hidden from assistive technology and replaced by the plain
 * text form, so VoiceOver reads "FV = PV * (1 + r)^N" rather than spelling out markup. If KaTeX
 * can't load or the LaTeX is bad, the plain text is shown instead: the formula is never blank.
 */
export function MathView({
  latex,
  plain,
  display = true,
}: {
  latex: string;
  plain: string;
  display?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHtml(null);
    void import('./katexLoader')
      .then((m) => live && setHtml(m.renderLatex(latex, display)))
      .catch(() => live && setHtml(null));
    return () => {
      live = false;
    };
  }, [latex, display]);
  return (
    <div className="math" role="img" aria-label={plain}>
      {html ? (
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code aria-hidden="true">{plain}</code>
      )}
    </div>
  );
}
