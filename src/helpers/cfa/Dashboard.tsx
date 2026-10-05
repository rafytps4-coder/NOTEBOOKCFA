import { Link } from 'react-router-dom';
import { CFA_DISCLAIMER } from '@/features/about/AboutSection';

const PLANNED = [
  ['Study plan and exam countdown', 'Planned'],
  ['Topic dashboard and progress', 'Planned'],
  ['Formula bank for Level I', 'Planned'],
  ['Notebook ↔ topic links and weak-area insights', 'Planned'],
] as const;

/** Honest shell: nothing here is computed yet, so no numbers are shown. */
export function CfaDashboard() {
  return (
    <section aria-labelledby="cfa-title">
      <h1 id="cfa-title">CFA Helper · Level I</h1>
      <p role="note" className="notice">
        {CFA_DISCLAIMER}
      </p>
      <p>
        This Helper adds study tools for CFA Level I on top of your notebooks. Right now it is only
        a shell: the parts below are not built yet, so there is nothing to show.
      </p>
      <ul className="row-list" aria-label="What is planned">
        {PLANNED.map(([label, state]) => (
          <li key={label}>
            <span className="grow">{label}</span>
            <span className="badge">{state}</span>
          </li>
        ))}
      </ul>
      <h2>Available now</h2>
      <p>
        The general study tools work with or without this Helper:{' '}
        <Link to="/study">flashcards, questions and a mistake log</Link> and a{' '}
        <Link to="/study/formulas">formula library</Link>. While this Helper is on, its starter
        formula pack can be installed from the Formulas screen (Packs).
      </p>
    </section>
  );
}
