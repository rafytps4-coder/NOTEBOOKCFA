import type { Rating, SchedState, Scheduler } from './types';

const MIN = 60_000;
export const DAY = 86_400_000;

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.2;
export const MAX_INTERVAL_DAYS = 3650;
/** How soon a card you got wrong (or are still learning) comes back. */
export const RELEARN_DELAY_MS = 10 * MIN;
export const GRADUATE_GOOD_DAYS = 1;
export const GRADUATE_EASY_DAYS = 4;
const HARD_FACTOR = 1.2;
const EASY_BONUS = 1.3;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function initialState(now: number): SchedState {
  return { phase: 'new', due: now, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
}

/**
 * SM-2 style scheduling, deterministic (no random fuzz) and pure: the clock is a parameter.
 *
 * - New / learning cards: "again" and "hard" come back in 10 minutes; "good" graduates to a 1-day
 *   gap and "easy" to a 4-day gap.
 * - Review cards: "good" multiplies the gap by the ease factor, "hard" grows it slowly and lowers
 *   the ease, "easy" grows it faster and raises the ease, "again" is a lapse: ease drops, the card
 *   goes back to learning and returns in 10 minutes.
 * - A gap always grows by at least a day on a correct answer, and never exceeds ten years.
 */
export function reviewCard(state: SchedState, rating: Rating, now: number): SchedState {
  if (state.phase !== 'review') {
    // `new` and `learning` (including relearning after a lapse).
    if (rating === 'again' || rating === 'hard') {
      return {
        ...state,
        phase: 'learning',
        due: now + RELEARN_DELAY_MS,
        interval: 0,
        reps: 0,
      };
    }
    const days = rating === 'easy' ? GRADUATE_EASY_DAYS : GRADUATE_GOOD_DAYS;
    return {
      ...state,
      phase: 'review',
      due: now + days * DAY,
      interval: days,
      reps: state.reps + 1,
      ease: rating === 'easy' ? round2(clamp(state.ease + 0.15, MIN_EASE, MAX_EASE)) : state.ease,
    };
  }

  const prev = Math.max(1, state.interval);
  if (rating === 'again') {
    return {
      ...state,
      phase: 'learning',
      due: now + RELEARN_DELAY_MS,
      interval: 0,
      reps: 0,
      lapses: state.lapses + 1,
      ease: round2(clamp(state.ease - 0.2, MIN_EASE, MAX_EASE)),
    };
  }
  let interval: number;
  let ease = state.ease;
  if (rating === 'hard') {
    interval = Math.max(prev + 1, Math.round(prev * HARD_FACTOR));
    ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
  } else if (rating === 'good') {
    interval = Math.max(prev + 1, Math.round(prev * ease));
  } else {
    interval = Math.max(prev + 2, Math.round(prev * ease * EASY_BONUS));
    ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
  }
  interval = Math.min(interval, MAX_INTERVAL_DAYS);
  return {
    ...state,
    phase: 'review',
    due: now + interval * DAY,
    interval,
    reps: state.reps + 1,
    ease: round2(ease),
  };
}

export function formatDelay(ms: number): string {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} h`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30)} mo`;
  return `${Math.round((d / 365) * 10) / 10} y`;
}

export const sm2: Scheduler = {
  initial: initialState,
  review: reviewCard,
  preview(state, now) {
    const out = {} as Record<Rating, string>;
    for (const r of ['again', 'hard', 'good', 'easy'] as const)
      out[r] = formatDelay(reviewCard(state, r, now).due - now);
    return out;
  },
};
