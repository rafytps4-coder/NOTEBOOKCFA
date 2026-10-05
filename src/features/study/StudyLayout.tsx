import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/study', label: 'Flashcards', end: true },
  { to: '/study/formulas', label: 'Formulas' },
  { to: '/study/questions', label: 'Questions' },
  { to: '/study/mistakes', label: 'Mistakes' },
];

export function StudyLayout() {
  return (
    <section>
      <h1>Study</h1>
      <nav className="subnav" aria-label="Study sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
