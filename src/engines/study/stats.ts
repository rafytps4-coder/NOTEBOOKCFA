import type { Rating } from './types';

export interface LogLike {
  at: number;
  rating: Rating;
}

export interface SetStats {
  reviews: number;
  /** Share of reviews rated hard/good/easy (not "again"); null with no reviews. */
  retention: number | null;
  /** Reviews in the last 7 days. */
  last7Days: number;
  /** Consecutive days (ending today or yesterday) with at least one review. */
  streakDays: number;
  lastStudiedAt: number | null;
}

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Stats computed only from real review history. */
export function computeStats(logs: LogLike[], now: number): SetStats {
  if (!logs.length)
    return { reviews: 0, retention: null, last7Days: 0, streakDays: 0, lastStudiedAt: null };
  const passed = logs.filter((l) => l.rating !== 'again').length;
  const days = new Set(logs.map((l) => dayKey(l.at)));
  let streak = 0;
  const cursor = new Date(now);
  // Today may not have a review yet; the streak then counts back from yesterday.
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    reviews: logs.length,
    retention: passed / logs.length,
    last7Days: logs.filter((l) => now - l.at < 7 * 86_400_000).length,
    streakDays: streak,
    lastStudiedAt: Math.max(...logs.map((l) => l.at)),
  };
}
