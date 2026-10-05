import type { Evidence } from './mastery';

const HOUR = 3_600_000;

export interface EvidenceInput {
  /** Review logs of flashcards linked to the formula. */
  cardLogs: { at: number; rating: 'again' | 'hard' | 'good' | 'easy' }[];
  /** Results of questions linked to the formula. */
  quiz: { at: number; correct: boolean; questionId: string }[];
  /** Mistakes logged against the formula. */
  mistakes: { createdAt: number; questionId: string | null }[];
}

/**
 * Turn raw history into answers. A mistake logged right after a wrong quiz answer to the same
 * question is that same failure, so it is not counted twice.
 */
export function gatherEvidence(input: EvidenceInput): Evidence[] {
  const out: Evidence[] = [];
  for (const l of input.cardLogs)
    out.push({ at: l.at, correct: l.rating !== 'again', source: 'card' });
  for (const q of input.quiz) out.push({ at: q.at, correct: q.correct, source: 'quiz' });
  for (const m of input.mistakes) {
    const duplicate =
      m.questionId !== null &&
      input.quiz.some(
        (q) =>
          q.questionId === m.questionId &&
          !q.correct &&
          q.at <= m.createdAt + 60_000 &&
          m.createdAt - q.at <= 24 * HOUR,
      );
    if (!duplicate) out.push({ at: m.createdAt, correct: false, source: 'mistake' });
  }
  return out;
}
