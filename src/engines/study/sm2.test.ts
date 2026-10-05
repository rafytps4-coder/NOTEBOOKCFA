import { describe, expect, it } from 'vitest';
import {
  DAY,
  GRADUATE_EASY_DAYS,
  GRADUATE_GOOD_DAYS,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  RELEARN_DELAY_MS,
  START_EASE,
  buildQueue,
  computeStats,
  countDue,
  formatDelay,
  initialState,
  reviewCard,
  sm2,
  weakAreasByTag,
  type Rating,
  type SchedState,
} from './index';

const T0 = new Date('2026-03-01T09:00:00').getTime();

describe('sm2 scheduler', () => {
  it('starts new, due immediately, default ease', () => {
    expect(initialState(T0)).toEqual({
      phase: 'new',
      due: T0,
      interval: 0,
      ease: START_EASE,
      reps: 0,
      lapses: 0,
    });
  });

  it('new card: good → 1 day, easy → 4 days and a higher ease, again/hard → 10 min', () => {
    const s = initialState(T0);
    const good = reviewCard(s, 'good', T0);
    expect(good).toMatchObject({ phase: 'review', interval: GRADUATE_GOOD_DAYS, reps: 1 });
    expect(good.due).toBe(T0 + DAY);
    const easy = reviewCard(s, 'easy', T0);
    expect(easy.interval).toBe(GRADUATE_EASY_DAYS);
    expect(easy.ease).toBeCloseTo(2.65);
    for (const r of ['again', 'hard'] as const) {
      const x = reviewCard(s, r, T0);
      expect(x).toMatchObject({ phase: 'learning', interval: 0, reps: 0, lapses: 0 });
      expect(x.due).toBe(T0 + RELEARN_DELAY_MS);
    }
  });

  it('correct answers push the card further out each time', () => {
    let s = reviewCard(initialState(T0), 'good', T0);
    const gaps = [s.interval];
    for (let i = 0; i < 6; i++) {
      s = reviewCard(s, 'good', s.due);
      gaps.push(s.interval);
    }
    expect(gaps).toEqual([1, 3, 8, 20, 50, 125, 313]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]!);
  });

  it('a wrong answer is a lapse: ease drops, interval resets, back in 10 minutes', () => {
    let s = reviewCard(initialState(T0), 'good', T0);
    s = reviewCard(s, 'good', s.due); // 3 days
    const lapsed = reviewCard(s, 'again', s.due);
    expect(lapsed).toMatchObject({ phase: 'learning', interval: 0, reps: 0, lapses: 1 });
    expect(lapsed.ease).toBeCloseTo(2.3);
    expect(lapsed.due - s.due).toBe(RELEARN_DELAY_MS);
    // relearning then graduates back to a 1 day gap, keeping the lowered ease and the lapse count
    const back = reviewCard(lapsed, 'good', lapsed.due);
    expect(back).toMatchObject({ phase: 'review', interval: 1, lapses: 1 });
    expect(back.ease).toBeCloseTo(2.3);
  });

  it('hard grows slowly and lowers ease; easy grows fast and raises ease', () => {
    const base: SchedState = {
      phase: 'review',
      due: T0,
      interval: 10,
      ease: 2.5,
      reps: 3,
      lapses: 0,
    };
    const hard = reviewCard(base, 'hard', T0);
    const good = reviewCard(base, 'good', T0);
    const easy = reviewCard(base, 'easy', T0);
    expect(hard.interval).toBe(12);
    expect(hard.ease).toBeCloseTo(2.35);
    expect(good.interval).toBe(25);
    expect(easy.interval).toBe(33);
    expect(easy.ease).toBeCloseTo(2.65);
    expect(hard.interval).toBeLessThan(good.interval);
    expect(good.interval).toBeLessThan(easy.interval);
  });

  it('interval always grows by at least a day on a correct answer', () => {
    const tiny: SchedState = {
      phase: 'review',
      due: T0,
      interval: 1,
      ease: MIN_EASE,
      reps: 1,
      lapses: 0,
    };
    expect(reviewCard(tiny, 'hard', T0).interval).toBe(2);
    expect(reviewCard(tiny, 'good', T0).interval).toBe(2);
    expect(reviewCard(tiny, 'easy', T0).interval).toBeGreaterThanOrEqual(3);
  });

  it('ease never leaves its bounds, however many lapses', () => {
    let s = reviewCard(initialState(T0), 'good', T0);
    for (let i = 0; i < 30; i++) {
      s = reviewCard(s, 'good', s.due);
      s = reviewCard(s, 'again', s.due);
      s = reviewCard(s, 'good', s.due);
    }
    expect(s.ease).toBe(MIN_EASE);
    expect(s.lapses).toBe(30);
    let e = reviewCard(initialState(T0), 'easy', T0);
    for (let i = 0; i < 40; i++) e = reviewCard(e, 'easy', e.due);
    expect(e.ease).toBeLessThanOrEqual(3.2);
  });

  it('interval is capped at ten years', () => {
    let s = reviewCard(initialState(T0), 'easy', T0);
    for (let i = 0; i < 40; i++) s = reviewCard(s, 'easy', s.due);
    expect(s.interval).toBe(MAX_INTERVAL_DAYS);
  });

  it('is pure and deterministic: same input, same output, input untouched', () => {
    const s = initialState(T0);
    const frozen = Object.freeze({ ...s });
    expect(reviewCard(frozen, 'good', T0)).toEqual(reviewCard(frozen, 'good', T0));
    expect(frozen).toEqual(s);
  });

  it('long history: 200 mixed reviews keep every invariant', () => {
    const pattern: Rating[] = ['good', 'good', 'hard', 'easy', 'again', 'good', 'good'];
    let s = initialState(T0);
    let t = T0;
    for (let i = 0; i < 200; i++) {
      const prev = s;
      s = reviewCard(s, pattern[i % pattern.length]!, t);
      expect(s.ease).toBeGreaterThanOrEqual(MIN_EASE);
      expect(s.interval).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
      expect(s.due).toBeGreaterThan(t);
      expect(Number.isFinite(s.due)).toBe(true);
      if (s.phase === 'review' && prev.phase === 'review')
        expect(s.interval).toBeGreaterThan(prev.interval);
      t = s.due;
    }
  });

  it('previews what each button would do', () => {
    const p = sm2.preview(initialState(T0), T0);
    expect(p).toEqual({ again: '10 min', hard: '10 min', good: '1 d', easy: '4 d' });
  });

  it('formats delays', () => {
    expect(formatDelay(30_000)).toBe('1 min');
    expect(formatDelay(2 * 3_600_000)).toBe('2 h');
    expect(formatDelay(10 * DAY)).toBe('10 d');
    expect(formatDelay(90 * DAY)).toBe('3 mo');
    expect(formatDelay(800 * DAY)).toBe('2.2 y');
  });
});

describe('queue and due counts across simulated days', () => {
  const mk = (id: string, sched: SchedState, createdAt = 1) => ({ id, createdAt, sched });

  it('counts new and due-by-end-of-today separately', () => {
    const cards = [
      mk('n', initialState(T0)),
      mk('d', { ...initialState(T0), phase: 'review', due: T0 - DAY, interval: 1 }),
      mk('later-today', {
        ...initialState(T0),
        phase: 'review',
        due: new Date('2026-03-01T22:00:00').getTime(),
        interval: 1,
      }),
      mk('tomorrow', { ...initialState(T0), phase: 'review', due: T0 + DAY, interval: 1 }),
    ];
    expect(countDue(cards, T0)).toEqual({ new: 1, due: 2, total: 4 });
  });

  it('queue: overdue first (most overdue first), then new in creation order, capped', () => {
    const cards = [
      mk('new2', initialState(T0), 20),
      mk('new1', initialState(T0), 10),
      mk('late', { ...initialState(T0), phase: 'review', due: T0 - 3 * DAY, interval: 1 }),
      mk('recent', { ...initialState(T0), phase: 'review', due: T0 - 1000, interval: 1 }),
      mk('future', { ...initialState(T0), phase: 'review', due: T0 + DAY, interval: 1 }),
    ];
    expect(buildQueue(cards, T0).map((c) => c.id)).toEqual(['late', 'recent', 'new1', 'new2']);
    expect(buildQueue(cards, T0, { newLimit: 1 }).map((c) => c.id)).toEqual([
      'late',
      'recent',
      'new1',
    ]);
  });

  it('a card studied "good" is not due again until its gap has passed (fake clock)', () => {
    let c = mk('x', initialState(T0));
    expect(buildQueue([c], T0)).toHaveLength(1);
    c = { ...c, sched: reviewCard(c.sched, 'good', T0) }; // due in 1 day
    expect(buildQueue([c], T0 + 3600_000)).toHaveLength(0);
    expect(buildQueue([c], T0 + DAY)).toHaveLength(1);
    c = { ...c, sched: reviewCard(c.sched, 'again', T0 + DAY) }; // lapse: back in 10 minutes
    expect(buildQueue([c], T0 + DAY + 5 * 60_000)).toHaveLength(0);
    expect(buildQueue([c], T0 + DAY + 11 * 60_000)).toHaveLength(1);
  });
});

describe('stats and weak areas', () => {
  it('stats come only from the logs', () => {
    expect(computeStats([], T0)).toEqual({
      reviews: 0,
      retention: null,
      last7Days: 0,
      streakDays: 0,
      lastStudiedAt: null,
    });
    const logs = [
      { at: T0, rating: 'good' as const },
      { at: T0 - DAY, rating: 'again' as const },
      { at: T0 - 2 * DAY, rating: 'easy' as const },
      { at: T0 - 10 * DAY, rating: 'good' as const },
    ];
    const s = computeStats(logs, T0);
    expect(s).toMatchObject({
      reviews: 4,
      retention: 0.75,
      last7Days: 3,
      streakDays: 3,
      lastStudiedAt: T0,
    });
  });

  it('streak survives "not yet studied today" but not a missed day', () => {
    expect(computeStats([{ at: T0 - DAY, rating: 'good' }], T0).streakDays).toBe(1);
    expect(computeStats([{ at: T0 - 2 * DAY, rating: 'good' }], T0).streakDays).toBe(0);
  });

  it('weak areas rank tags by logged mistakes', () => {
    const w = weakAreasByTag([
      { tags: ['tvm', 'quant'], reviewed: false },
      { tags: ['tvm'], reviewed: true },
      { tags: [], reviewed: false },
    ]);
    expect(w[0]).toEqual({ tag: 'tvm', mistakes: 2, unreviewed: 1 });
    expect(w.map((x) => x.tag)).toEqual(['tvm', 'quant', 'untagged']);
  });
});
