import { CFA_DISCLAIMER } from '@/features/about/AboutSection';

export function CfaOnboarding({ onDone }: { onDone: () => void }) {
  return (
    <section aria-labelledby="cfa-intro">
      <h1 id="cfa-intro">Welcome to the CFA Helper</h1>
      <p role="note" className="notice">
        {CFA_DISCLAIMER}
      </p>
      <p>
        It is an optional add-on for studying CFA Level I. It is an early shell: onboarding
        questions, a study planner and a dashboard are <strong>planned</strong> but not built yet.
        Your notebooks work exactly the same with or without it, and you can switch it off at any
        time without losing anything.
      </p>
      <button className="btn primary" onClick={onDone}>
        Continue
      </button>
    </section>
  );
}
