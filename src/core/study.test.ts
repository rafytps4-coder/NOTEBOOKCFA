// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addCard,
  addStudyImage,
  createSet,
  db,
  deleteCard,
  deleteQuestion,
  deleteSet,
  emptySide,
  exportQuestionsJson,
  finishSession,
  importQuestionsJson,
  isCorrectAnswer,
  parseTags,
  QuestionImportError,
  recordQuizResult,
  reviewCard,
  saveMistake,
  saveQuestion,
  startSession,
  updateCard,
} from './index';
import { DAY, buildQueue, countDue } from '@/engines/study';

beforeEach(() => Promise.all(db.tables.map((t) => t.clear())));
const T0 = new Date('2026-03-01T09:00:00').getTime();

describe('cards and reviews', () => {
  it('simulated study across days with a fake clock', async () => {
    const set = await createSet('Demo');
    const a = await addCard(
      { setId: set.id, front: { text: 'a', imageId: null }, back: emptySide() },
      undefined,
      T0,
    );
    await addCard(
      { setId: set.id, front: { text: 'b', imageId: null }, back: emptySide() },
      undefined,
      T0 + 1,
    );

    const load = async () => db.flashcards.where('setId').equals(set.id).toArray();
    expect(countDue(await load(), T0)).toEqual({ new: 2, due: 0, total: 2 });

    // Day 1: both new cards learned. a=good (1 day), b=again (10 minutes)
    let cards = await load();
    await reviewCard(
      cards.find((c) => c.id === a.id)!,
      'good',
      { at: T0 },
    );
    await reviewCard(
      cards.find((c) => c.id !== a.id)!,
      'again',
      { at: T0 },
    );
    expect(buildQueue(await load(), T0 + 60_000)).toHaveLength(0);
    expect(buildQueue(await load(), T0 + 11 * 60_000)).toHaveLength(1); // b is back

    // Day 2: a is due; answering good again moves it to 3 days
    cards = await load();
    expect(buildQueue(cards, T0 + DAY).map((c) => c.id)).toContain(a.id);
    await reviewCard(
      cards.find((c) => c.id === a.id)!,
      'good',
      { at: T0 + DAY },
    );
    expect((await db.flashcards.get(a.id))!.sched.interval).toBe(3);
    // not due again on day 3, due on day 5
    expect(buildQueue([(await db.flashcards.get(a.id))!], T0 + 2 * DAY)).toHaveLength(0);
    expect(buildQueue([(await db.flashcards.get(a.id))!], T0 + 4 * DAY)).toHaveLength(1);

    const logs = await db.reviewLogs.where('cardId').equals(a.id).sortBy('at');
    expect(logs.map((l) => [l.rating, l.prevInterval, l.newInterval])).toEqual([
      ['good', 0, 1],
      ['good', 1, 3],
    ]);
  });

  it('deleting a card removes its history and its now-unused image', async () => {
    const set = await createSet('S');
    const img = await addStudyImage(new Blob(['x'], { type: 'image/png' }));
    const c = await addCard({
      setId: set.id,
      front: { text: '', imageId: img },
      back: emptySide(),
    });
    await reviewCard(c, 'good');
    await deleteCard(c.id);
    expect(await db.reviewLogs.count()).toBe(0);
    expect(await db.studyAssets.count()).toBe(0);
  });

  it('an image used by another card is kept', async () => {
    const set = await createSet('S');
    const img = await addStudyImage(new Blob(['x'], { type: 'image/png' }));
    const a = await addCard({
      setId: set.id,
      front: { text: '', imageId: img },
      back: emptySide(),
    });
    await addCard({ setId: set.id, front: emptySide(), back: { text: '', imageId: img } });
    await deleteCard(a.id);
    expect(await db.studyAssets.count()).toBe(1);
  });

  it('editing a card replaces its image and drops the old one', async () => {
    const set = await createSet('S');
    const i1 = await addStudyImage(new Blob(['1'], { type: 'image/png' }));
    const c = await addCard({ setId: set.id, front: { text: '', imageId: i1 }, back: emptySide() });
    await updateCard(c.id, { front: { text: 'now text', imageId: null } });
    expect(await db.studyAssets.count()).toBe(0);
    expect((await db.flashcards.get(c.id))!.front.text).toBe('now text');
  });

  it('deleting a set removes its cards, logs and sessions but not other sets', async () => {
    const a = await createSet('A');
    const b = await createSet('B');
    const ca = await addCard({ setId: a.id, front: emptySide(), back: emptySide() });
    const cb = await addCard({ setId: b.id, front: emptySide(), back: emptySide() });
    await reviewCard(ca, 'good');
    await reviewCard(cb, 'good');
    const s = await startSession('cards', a.id);
    await finishSession(s.id, 1, 1);
    await deleteSet(a.id);
    expect(await db.studySets.count()).toBe(1);
    expect(await db.flashcards.count()).toBe(1);
    expect(await db.reviewLogs.count()).toBe(1);
    expect(await db.studySessions.count()).toBe(0);
  });

  it('tags are normalised and remembered', async () => {
    expect(parseTags(' TVM,  Fixed  Income ,tvm,,')).toEqual(['tvm', 'fixed income']);
    const set = await createSet('S');
    await addCard({ setId: set.id, front: emptySide(), back: emptySide(), tags: ['tvm', 'x'] });
    expect((await db.tags.toArray()).map((t) => t.name).sort()).toEqual(['tvm', 'x']);
  });
});

describe('questions, quiz and mistakes', () => {
  const mc = {
    kind: 'multiple-choice' as const,
    prompt: 'Capital of France?',
    choices: ['Rome', 'Paris'],
    correctIndex: 1,
    answer: '',
    explanation: '',
    tags: ['geo'],
    difficulty: 'easy' as const,
    formulaId: null,
  };
  const sa = {
    ...mc,
    kind: 'short-answer' as const,
    prompt: '2+2?',
    choices: [],
    correctIndex: null,
    answer: 'Four',
  };

  it('checks answers (multiple choice by index, short answer ignoring case and spacing)', async () => {
    const q1 = await saveQuestion(mc);
    const q2 = await saveQuestion(sa);
    expect(isCorrectAnswer(q1, 1)).toBe(true);
    expect(isCorrectAnswer(q1, 0)).toBe(false);
    expect(isCorrectAnswer(q2, '  four ')).toBe(true);
    expect(isCorrectAnswer(q2, '4')).toBe(false);
  });

  it('records results; deleting a question removes results but keeps the mistake text', async () => {
    const q = await saveQuestion(mc);
    await recordQuizResult(q, 'Rome', false, null);
    await saveMistake({
      questionId: q.id,
      questionText: q.prompt,
      userAnswer: 'Rome',
      correctAnswer: 'Paris',
      category: 'concept',
      notes: '',
      tags: [],
      formulaId: null,
    });
    await deleteQuestion(q.id);
    expect(await db.quizResults.count()).toBe(0);
    const m = (await db.mistakes.toArray())[0]!;
    expect(m).toMatchObject({ questionId: null, questionText: 'Capital of France?' });
  });

  it('exports and imports questions as JSON, and refuses bad files without adding anything', async () => {
    await saveQuestion(mc);
    await saveQuestion(sa);
    const json = await exportQuestionsJson();
    expect(json).not.toContain('"id"');
    await db.questions.clear();
    expect(await importQuestionsJson(json)).toBe(2);
    expect(await db.questions.count()).toBe(2);

    await expect(importQuestionsJson('not json')).rejects.toBeInstanceOf(QuestionImportError);
    await expect(importQuestionsJson('{"format":"other"}')).rejects.toBeInstanceOf(
      QuestionImportError,
    );
    const bad = JSON.stringify({
      format: 'notebook-questions',
      version: 1,
      questions: [
        { kind: 'short-answer', prompt: 'ok', answer: 'a' },
        { kind: 'multiple-choice', prompt: 'bad', choices: ['x', 'y'], correctIndex: 5 },
      ],
    });
    const before = await db.questions.count();
    await expect(importQuestionsJson(bad)).rejects.toThrow(/Question 2/);
    expect(await db.questions.count()).toBe(before);
    await expect(
      importQuestionsJson(
        JSON.stringify({ format: 'notebook-questions', version: 2, questions: [] }),
      ),
    ).rejects.toThrow(/newer version/);
  });
});
