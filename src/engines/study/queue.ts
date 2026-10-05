import { DAY } from './sm2';
import type { SchedState } from './types';

/** End of the local calendar day containing `now`. */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export interface DueCounts {
  /** Cards never studied. */
  new: number;
  /** Cards (learning or review) due by the end of today. */
  due: number;
  total: number;
}

export function isDue(s: SchedState, now: number): boolean {
  return s.phase !== 'new' && s.due <= now;
}

export function countDue(cards: { sched: SchedState }[], now: number): DueCounts {
  const eod = endOfDay(now);
  let n = 0;
  let due = 0;
  for (const c of cards) {
    if (c.sched.phase === 'new') n++;
    else if (c.sched.due <= eod) due++;
  }
  return { new: n, due, total: cards.length };
}

/**
 * The cards to study right now, in order: overdue/learning cards (most overdue first), then new
 * cards in creation order, capped by `newLimit`. Cards due later today are not offered early.
 */
export function buildQueue<T extends { id: string; createdAt: number; sched: SchedState }>(
  cards: T[],
  now: number,
  opts: { newLimit?: number } = {},
): T[] {
  const due = cards.filter((c) => isDue(c.sched, now)).sort((a, b) => a.sched.due - b.sched.due);
  const fresh = cards
    .filter((c) => c.sched.phase === 'new')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, opts.newLimit ?? Infinity);
  return [...due, ...fresh];
}

/** Whole days between two timestamps (for "last studied 3 days ago"). */
export function daysBetween(a: number, b: number): number {
  return Math.floor(Math.abs(b - a) / DAY);
}
