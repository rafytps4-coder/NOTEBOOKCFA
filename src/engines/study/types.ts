/** Answer quality chosen by the learner after seeing a card. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

export type CardPhase = 'new' | 'learning' | 'review';

/** Everything the scheduler needs to know about one card. Plain data, so it can be stored as is. */
export interface SchedState {
  phase: CardPhase;
  /** When the card is next due (ms since epoch). New cards are due immediately. */
  due: number;
  /** Current gap in days (0 while learning / relearning). */
  interval: number;
  /** Ease factor: how fast the gap grows on a "good" answer. Never below MIN_EASE. */
  ease: number;
  /** Number of successful reviews in a row (reset by "again"). */
  reps: number;
  /** Number of times a graduated card was forgotten. */
  lapses: number;
}

/** A scheduler turns "what the learner said" into the card's next state. Swappable by design. */
export interface Scheduler {
  initial(now: number): SchedState;
  review(state: SchedState, rating: Rating, now: number): SchedState;
  /** What each rating would do, for showing "10 min / 1 d / 3 d" under the buttons. */
  preview(state: SchedState, now: number): Record<Rating, string>;
}
