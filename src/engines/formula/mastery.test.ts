import { describe, expect, it } from 'vitest';
import {
  DAY,
  RULES,
  computeMastery,
  gatherEvidence,
  recommendForReview,
  type Evidence,
  type MasteryResult,
} from './index';

// Noon local time, so adding whole days never lands near a midnight/DST boundary.
const T0 = new Date('2026-01-05T12:00:00').getTime();
const ev = (day: number, correct: boolean, hourOffset = 0): Evidence => ({
  at: T0 + day * DAY + hourOffset * 3_600_000,
  correct,
  source: 'card',
});
const run = (list: Evidence[], atDay: number) => computeMastery(list, T0 + atDay * DAY);

describe('mastery states', () => {
  it('no answers → Not studied, and never anything else', () => {
    expect(run([], 100)).toMatchObject({
      state: 'not-studied',
      answers: 0,
      accuracy: null,
      lastAt: null,
    });
  });

  it('one or two answers → Learning even when all correct', () => {
    expect(run([ev(0, true)], 0).state).toBe('learning');
    expect(run([ev(0, true), ev(0, true, 1)], 0).state).toBe('learning');
  });

  it('three answers at ≥ 60% → Reviewing; below 60% stays Learning', () => {
    expect(run([ev(0, true), ev(0, true, 1), ev(0, false, 2)], 0).state).toBe('reviewing'); // 67%
    expect(run([ev(0, true), ev(0, false, 1), ev(0, false, 2), ev(0, true, 3)], 0).state).toBe(
      'learning',
    ); // 50%
  });

  it('Strong needs 6 answers over 3 days, ≥ 80% and the last 3 correct', () => {
    const base = [
      ev(0, true),
      ev(0, true, 1),
      ev(1, true),
      ev(1, true, 1),
      ev(2, true),
      ev(2, true, 1),
    ];
    expect(run(base, 2).state).toBe('strong');
    // only two distinct days → Reviewing
    expect(run([0, 1, 2, 3, 4, 5].map((h) => ev(0, true, h)).concat(ev(1, true)), 1).state).toBe(
      'reviewing',
    );
    // five answers → not enough
    expect(run(base.slice(1), 2).state).toBe('reviewing');
    // accuracy 6/8 = 75% → Reviewing
    expect(run([ev(0, false), ev(0, false, 1), ...base], 2).state).toBe('reviewing');
  });

  it('Mastered needs 10 answers, 5 days, a 14-day span, ≥ 90% and the last 5 correct', () => {
    const days = [0, 4, 8, 12, 16, 20];
    const list = days.flatMap((d) => [ev(d, true), ev(d, true, 1)]);
    expect(list.length).toBe(12);
    expect(run(list, 20).state).toBe('mastered');
    // the same answers squeezed into 10 days: Strong, not Mastered
    const quick = [0, 2, 4, 6, 8, 9].flatMap((d) => [ev(d, true), ev(d, true, 1)]);
    expect(run(quick, 9).state).toBe('strong');
    // an old miss outside the last ten answers does not matter
    expect(run([ev(-1, false), ...list], 20).state).toBe('mastered');
    // a miss inside the last five blocks it
    expect(
      run([...list.slice(0, -3), ev(20, false), ev(20, true, 1), ev(20, true, 2)], 20).state,
    ).not.toBe('mastered');
  });

  it('cannot reach a level by repeating answers on one day', () => {
    const same = Array.from({ length: 30 }, (_, i) => ev(0, true, i / 10));
    expect(run(same, 0).state).toBe('reviewing');
  });
});

describe('recent errors cap the level', () => {
  const strong = [
    ev(0, true),
    ev(0, true, 1),
    ev(1, true),
    ev(1, true, 1),
    ev(2, true),
    ev(2, true, 1),
  ];
  it('a wrong last answer cannot be Strong', () => {
    const r = run([...strong, ev(3, false)], 3);
    expect(r.earned).not.toBe('strong'); // accuracy/trailing rule already blocks it
    expect(r.state).toBe('reviewing');
    expect(r.lastWasWrong).toBe(true);
  });
  it('two wrong in a row drop it to Learning', () => {
    expect(run([...strong, ev(3, false), ev(3, false, 1)], 3).state).toBe('learning');
  });
  it('a later correct answer recovers', () => {
    const r = run([...strong, ev(3, false), ev(4, true), ev(4, true, 1), ev(5, true)], 5);
    expect(['reviewing', 'strong']).toContain(r.state);
    expect(r.lastWasWrong).toBe(false);
  });
});

describe('decay with time', () => {
  const strong = [
    ev(0, true),
    ev(0, true, 1),
    ev(1, true),
    ev(1, true, 1),
    ev(2, true),
    ev(2, true, 1),
  ];
  it('no decay within the 14-day grace period', () => {
    expect(run(strong, 2 + RULES.graceDays).state).toBe('strong');
  });
  it('one step per 14 idle days after that, never below Learning', () => {
    expect(run(strong, 2 + 15).state).toBe('reviewing');
    expect(run(strong, 2 + 29).state).toBe('learning');
    expect(run(strong, 2 + 400).state).toBe('learning');
    const d = run(strong, 2 + 15);
    expect(d).toMatchObject({ beforeDecay: 'strong', decaySteps: 1 });
  });
  it('Mastered decays Mastered → Strong → Reviewing → Learning', () => {
    const list = [0, 4, 8, 12, 16, 20].flatMap((d) => [ev(d, true), ev(d, true, 1)]);
    expect(run(list, 20 + 15).state).toBe('strong');
    expect(run(list, 20 + 29).state).toBe('reviewing');
    expect(run(list, 20 + 43).state).toBe('learning');
  });
  it('studying again resets the clock', () => {
    expect(run([...strong, ev(40, true)], 41).state).not.toBe('learning');
  });
  it('is deterministic: same input, same output, order of evidence irrelevant', () => {
    const shuffled = [...strong].reverse();
    expect(run(shuffled, 30)).toEqual(run(strong, 30));
  });
});

describe('gathering evidence', () => {
  it('maps card ratings, quiz results and mistakes', () => {
    const e = gatherEvidence({
      cardLogs: [
        { at: 1, rating: 'again' },
        { at: 2, rating: 'hard' },
        { at: 3, rating: 'easy' },
      ],
      quiz: [{ at: 4, correct: true, questionId: 'q1' }],
      mistakes: [{ createdAt: 5, questionId: null }],
    });
    expect(e.map((x) => [x.source, x.correct])).toEqual([
      ['card', false],
      ['card', true],
      ['card', true],
      ['quiz', true],
      ['mistake', false],
    ]);
  });
  it('does not count a mistake twice when it came from a wrong quiz answer', () => {
    const quizAt = T0;
    const e = gatherEvidence({
      cardLogs: [],
      quiz: [{ at: quizAt, correct: false, questionId: 'q1' }],
      mistakes: [
        { createdAt: quizAt + 5 * 60_000, questionId: 'q1' }, // logged from that quiz → same failure
        { createdAt: quizAt + 5 * DAY, questionId: 'q1' }, // a separate, later mistake → counts
        { createdAt: quizAt + 1000, questionId: 'q2' }, // different question → counts
      ],
    });
    expect(e.filter((x) => x.source === 'mistake')).toHaveLength(2);
    expect(e).toHaveLength(3);
  });
});

describe('recommended for review', () => {
  const mk = (id: string, list: Evidence[], atDay: number, dueCards = 0) => ({
    id,
    name: id.toUpperCase(),
    mastery: run(list, atDay) as MasteryResult,
    dueCards,
  });
  it('explains recent errors in plain words', () => {
    const r = recommendForReview([
      mk('a', [ev(0, true), ev(0, false, 1), ev(0, true, 2), ev(0, false, 3), ev(0, false, 4)], 0),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.reason).toBe('3 of your last 5 answers were wrong');
  });
  it('last answer wrong, decay, and due cards each get their own reason', () => {
    const strong = [
      ev(0, true),
      ev(0, true, 1),
      ev(1, true),
      ev(1, true, 1),
      ev(2, true),
      ev(2, true, 1),
    ];
    const r = recommendForReview([
      mk('wrong', [ev(0, true), ev(0, true, 1), ev(0, true, 2), ev(1, false)], 1),
      mk('old', strong, 2 + 20),
      mk('due', [ev(0, true), ev(0, true, 1), ev(0, true, 2)], 0, 2),
    ]);
    const by = Object.fromEntries(r.map((x) => [x.id, x.reason]));
    expect(by.wrong).toBe('Your last answer was wrong');
    expect(by.old).toBe('Not practised for 19 days, so it slipped from Strong to Reviewing');
    expect(by.due).toBe('2 linked flashcards are due');
    expect(r.map((x) => x.id)).toEqual(['wrong', 'old', 'due']); // errors first, then decay, then due
  });
  it('skips formulas that are fine or never studied', () => {
    const strong = [
      ev(0, true),
      ev(0, true, 1),
      ev(1, true),
      ev(1, true, 1),
      ev(2, true),
      ev(2, true, 1),
    ];
    expect(recommendForReview([mk('x', strong, 3), mk('y', [], 0)])).toEqual([]);
  });
});
