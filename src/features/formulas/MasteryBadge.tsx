import { MASTERY_LABEL, MASTERY_STATES, type MasteryState } from '@/engines/formula';

/** Shows the derived mastery level as text (never colour alone). */
export function MasteryBadge({ state }: { state: MasteryState }) {
  const level = MASTERY_STATES.indexOf(state);
  return (
    <span className={`badge mastery mastery-${state}`} title={`Mastery: ${MASTERY_LABEL[state]}`}>
      <span aria-hidden="true">
        {'●'.repeat(level)}
        {'○'.repeat(4 - level)}{' '}
      </span>
      {MASTERY_LABEL[state]}
    </span>
  );
}
