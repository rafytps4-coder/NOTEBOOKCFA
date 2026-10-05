import { db } from './db';
import { newId, now } from './ids';
import { sm2, type Rating, type Scheduler } from '@/engines/study';
import type {
  CardSide,
  Flashcard,
  Mistake,
  Question,
  QuizResult,
  ReviewLog,
  SessionKind,
  SourceRef,
  StudySession,
  StudySet,
} from './studyModels';

/** Data access for the generic study system. The scheduler is injectable; so is the clock. */

export const emptySide = (): CardSide => ({ text: '', imageId: null });

// ---- tags -----------------------------------------------------------------------------------

export const normalizeTag = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();

export function parseTags(input: string): string[] {
  return [...new Set(input.split(',').map(normalizeTag).filter(Boolean))];
}

async function ensureTags(names: string[]): Promise<void> {
  const t = now();
  await db.tags.bulkPut(names.map((name) => ({ name, createdAt: t })));
}

// ---- images ----------------------------------------------------------------------------------

export async function addStudyImage(blob: Blob): Promise<string> {
  const id = newId();
  await db.studyAssets.put({
    id,
    mime: blob.type || 'image/png',
    size: blob.size,
    blob,
    createdAt: now(),
  });
  return id;
}

async function removeUnusedImages(candidateIds: (string | null)[]): Promise<void> {
  const ids = [...new Set(candidateIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const cards = await db.flashcards.toArray();
  const used = new Set(cards.flatMap((c) => [c.front.imageId, c.back.imageId]));
  await db.studyAssets.bulkDelete(ids.filter((i) => !used.has(i)));
}

// ---- sets ------------------------------------------------------------------------------------

export async function createSet(name: string, description = ''): Promise<StudySet> {
  const t = now();
  const set: StudySet = { id: newId(), name, description, createdAt: t, updatedAt: t };
  await db.studySets.add(set);
  return set;
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<StudySet, 'name' | 'description'>>,
) {
  await db.studySets.update(id, { ...patch, updatedAt: now() });
}

/** Removes the set, its cards and their review history. Callers confirm with the user first. */
export async function deleteSet(id: string): Promise<void> {
  const cards = await db.flashcards.where('setId').equals(id).toArray();
  await db.transaction(
    'rw',
    [db.studySets, db.flashcards, db.reviewLogs, db.studySessions],
    async () => {
      await db.reviewLogs.where('setId').equals(id).delete();
      await db.flashcards.where('setId').equals(id).delete();
      await db.studySessions.where('setId').equals(id).delete();
      await db.studySets.delete(id);
    },
  );
  await removeUnusedImages(cards.flatMap((c) => [c.front.imageId, c.back.imageId]));
}

// ---- cards -----------------------------------------------------------------------------------

export interface NewCard {
  setId: string;
  front: CardSide;
  back: CardSide;
  tags?: string[];
  formulaId?: string | null;
  sourceRef?: SourceRef | null;
}

export async function addCard(
  input: NewCard,
  scheduler: Scheduler = sm2,
  at = now(),
): Promise<Flashcard> {
  const card: Flashcard = {
    id: newId(),
    setId: input.setId,
    front: input.front,
    back: input.back,
    tags: input.tags ?? [],
    formulaId: input.formulaId ?? null,
    sourceRef: input.sourceRef ?? null,
    sched: scheduler.initial(at),
    createdAt: at,
    updatedAt: at,
  };
  await db.transaction('rw', [db.flashcards, db.tags, db.studySets], async () => {
    await db.flashcards.add(card);
    await ensureTags(card.tags);
    await db.studySets.update(card.setId, { updatedAt: at });
  });
  return card;
}

export async function updateCard(
  id: string,
  patch: Partial<Pick<Flashcard, 'front' | 'back' | 'tags' | 'setId' | 'formulaId'>>,
): Promise<void> {
  const before = await db.flashcards.get(id);
  if (!before) return;
  await db.transaction('rw', [db.flashcards, db.tags], async () => {
    await db.flashcards.update(id, { ...patch, updatedAt: now() });
    if (patch.tags) await ensureTags(patch.tags);
  });
  await removeUnusedImages([before.front.imageId, before.back.imageId]);
}

export async function deleteCard(id: string): Promise<void> {
  const card = await db.flashcards.get(id);
  if (!card) return;
  await db.transaction('rw', [db.flashcards, db.reviewLogs], async () => {
    await db.reviewLogs.where('cardId').equals(id).delete();
    await db.flashcards.delete(id);
  });
  await removeUnusedImages([card.front.imageId, card.back.imageId]);
}

/** Grade a card: new schedule and the log entry are written together or not at all. */
export async function reviewCard(
  card: Flashcard,
  rating: Rating,
  opts: { at?: number; sessionId?: string | null; durationMs?: number; scheduler?: Scheduler } = {},
): Promise<Flashcard> {
  const at = opts.at ?? now();
  const sched = (opts.scheduler ?? sm2).review(card.sched, rating, at);
  const log: ReviewLog = {
    id: newId(),
    cardId: card.id,
    setId: card.setId,
    sessionId: opts.sessionId ?? null,
    at,
    rating,
    prevInterval: card.sched.interval,
    newInterval: sched.interval,
    prevPhase: card.sched.phase,
    newPhase: sched.phase,
    durationMs: Math.max(0, Math.round(opts.durationMs ?? 0)),
  };
  const updated = { ...card, sched, updatedAt: at };
  await db.transaction('rw', [db.flashcards, db.reviewLogs], async () => {
    await db.flashcards.put(updated);
    await db.reviewLogs.add(log);
  });
  return updated;
}

// ---- sessions --------------------------------------------------------------------------------

export async function startSession(
  kind: SessionKind,
  setId: string | null,
  at = now(),
): Promise<StudySession> {
  const s: StudySession = {
    id: newId(),
    kind,
    setId,
    startedAt: at,
    endedAt: null,
    answered: 0,
    correct: 0,
  };
  await db.studySessions.add(s);
  return s;
}

export async function finishSession(id: string, answered: number, correct: number, at = now()) {
  await db.studySessions.update(id, { endedAt: at, answered, correct });
}

// ---- questions & quiz ------------------------------------------------------------------------

export async function saveQuestion(
  input: Omit<Question, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<Question> {
  const t = now();
  const existing = input.id ? await db.questions.get(input.id) : undefined;
  const q: Question = {
    ...input,
    id: input.id ?? newId(),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  };
  await db.transaction('rw', [db.questions, db.tags], async () => {
    await db.questions.put(q);
    await ensureTags(q.tags);
  });
  return q;
}

/** Deletes the question and its quiz results; mistakes keep their text but lose the link. */
export async function deleteQuestion(id: string): Promise<void> {
  await db.transaction('rw', [db.questions, db.quizResults, db.mistakes], async () => {
    await db.quizResults.where('questionId').equals(id).delete();
    await db.mistakes.where('questionId').equals(id).modify({ questionId: null });
    await db.questions.delete(id);
  });
}

export function isCorrectAnswer(q: Question, given: string | number): boolean {
  if (q.kind === 'multiple-choice') return given === q.correctIndex;
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(String(given)) === norm(q.answer);
}

export async function recordQuizResult(
  q: Question,
  given: string,
  correct: boolean,
  sessionId: string | null,
  at = now(),
): Promise<QuizResult> {
  const r: QuizResult = { id: newId(), questionId: q.id, sessionId, at, correct, given };
  await db.quizResults.add(r);
  return r;
}

export function correctAnswerText(q: Question): string {
  return q.kind === 'multiple-choice' ? (q.choices[q.correctIndex ?? -1] ?? '') : q.answer;
}

// ---- mistakes --------------------------------------------------------------------------------

export async function saveMistake(
  input: Omit<Mistake, 'id' | 'createdAt' | 'reviewed'> & {
    id?: string;
    reviewed?: boolean;
    createdAt?: number;
  },
): Promise<Mistake> {
  const existing = input.id ? await db.mistakes.get(input.id) : undefined;
  const m: Mistake = {
    ...input,
    id: input.id ?? newId(),
    createdAt: input.createdAt ?? existing?.createdAt ?? now(),
    reviewed: input.reviewed ?? existing?.reviewed ?? false,
  };
  await db.transaction('rw', [db.mistakes, db.tags], async () => {
    await db.mistakes.put(m);
    await ensureTags(m.tags);
  });
  return m;
}

export const setMistakeReviewed = (id: string, reviewed: boolean) =>
  db.mistakes.update(id, { reviewed });
export const deleteMistake = (id: string) => db.mistakes.delete(id);
