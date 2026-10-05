import { MASTERY_STATES, type MasteryState } from './types';

/**
 * Mastery is derived, never set by hand. The exact rules are in docs/MASTERY.md; the numbers here
 * are the single source for them, and tests pin each rule.
 */
export const DAY = 86_400_000;
export const RULES = {
  /** How many of the most recent answers count towards accuracy. */
  accuracyWindow: 10,
  reviewing: { answers: 3, accuracy: 0.6 },
  strong: { answers: 6, correctDays: 3, accuracy: 0.8, lastCorrect: 3 },
  mastered: { answers: 10, correctDays: 5, spanDays: 14, accuracy: 0.9, lastCorrect: 5 },
  /** No decay for this many idle days; then one step down per `decayEveryDays`. */
  graceDays: 14,
  decayEveryDays: 14,
} as const;

/** One answer to something linked to the formula. */
export interface Evidence {
  at: number;
  correct: boolean;
  source: 'card' | 'quiz' | 'mistake';
}

export interface MasteryResult {
  state: MasteryState;
  /** The level the answers alone earn, before the recent-error cap and decay. */
  earned: MasteryState;
  /** The level after the recent-error cap, before decay. */
  beforeDecay: MasteryState;
  /** Levels lost to decay (0 when none). */
  decaySteps: number;
  answers: number;
  /** Incorrect answers among the most recent five (or fewer). */
  wrongInLast5: number;
  lastFive: number;
  lastWasWrong: boolean;
  /** Accuracy over the last ten answers; null with no answers. */
  accuracy: number | null;
  lastAt: number | null;
  idleDays: number | null;
}

const idx = (s: MasteryState) => MASTERY_STATES.indexOf(s);
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function trailingCorrect(sorted: Evidence[]): number {
  let n = 0;
  for (let i = sorted.length - 1; i >= 0 && sorted[i]!.correct; i--) n++;
  return n;
}

export function computeMastery(evidence: Evidence[], now: number): MasteryResult {
  if (!evidence.length)
    return {
      state: 'not-studied',
      earned: 'not-studied',
      beforeDecay: 'not-studied',
      decaySteps: 0,
      answers: 0,
      wrongInLast5: 0,
      lastFive: 0,
      lastWasWrong: false,
      accuracy: null,
      lastAt: null,
      idleDays: null,
    };
  const sorted = [...evidence].sort((a, b) => a.at - b.at);
  const answers = sorted.length;
  const window = sorted.slice(-RULES.accuracyWindow);
  const accuracy = window.filter((e) => e.correct).length / window.length;
  const correct = sorted.filter((e) => e.correct);
  const correctDays = new Set(correct.map((e) => dayKey(e.at))).size;
  const spanDays = correct.length ? (correct[correct.length - 1]!.at - correct[0]!.at) / DAY : 0;
  const trailing = trailingCorrect(sorted);

  let earned: MasteryState = 'learning';
  const r = RULES;
  if (answers >= r.reviewing.answers && accuracy >= r.reviewing.accuracy) earned = 'reviewing';
  if (
    answers >= r.strong.answers &&
    correctDays >= r.strong.correctDays &&
    accuracy >= r.strong.accuracy &&
    trailing >= r.strong.lastCorrect
  )
    earned = 'strong';
  if (
    answers >= r.mastered.answers &&
    correctDays >= r.mastered.correctDays &&
    spanDays >= r.mastered.spanDays &&
    accuracy >= r.mastered.accuracy &&
    trailing >= r.mastered.lastCorrect &&
    earned === 'strong'
  )
    earned = 'mastered';

  // Recent errors cap the level: you can't be "Strong" right after getting it wrong.
  const last = sorted[sorted.length - 1]!;
  const prev = sorted[sorted.length - 2];
  let capped = earned;
  if (!last.correct && idx(capped) > idx('reviewing')) capped = 'reviewing';
  if (!last.correct && prev && !prev.correct && idx(capped) > idx('learning')) capped = 'learning';

  // Decay with time since the last answer.
  const idleDays = Math.max(0, (now - last.at) / DAY);
  const decaySteps =
    idleDays <= r.graceDays ? 0 : 1 + Math.floor((idleDays - r.graceDays) / r.decayEveryDays);
  const state = MASTERY_STATES[Math.max(idx('learning'), idx(capped) - decaySteps)]!;

  const five = sorted.slice(-5);
  return {
    state,
    earned,
    beforeDecay: capped,
    decaySteps:
      idx(capped) > idx('learning') ? Math.min(decaySteps, idx(capped) - idx('learning')) : 0,
    answers,
    wrongInLast5: five.filter((e) => !e.correct).length,
    lastFive: five.length,
    lastWasWrong: !last.correct,
    accuracy,
    lastAt: last.at,
    idleDays,
  };
}
