import { db, type FormulaRow } from '@/core';
import {
  computeMastery,
  gatherEvidence,
  recommendForReview,
  type MasteryResult,
  type Recommendation,
} from '@/engines/formula';

export interface FormulaStatus {
  mastery: MasteryResult;
  dueCards: number;
  cards: number;
  questions: number;
}

/** Mastery of every formula, derived from the user's linked cards, quiz results and mistakes. */
export async function loadStatuses(
  formulas: FormulaRow[],
  now = Date.now(),
): Promise<Map<string, FormulaStatus>> {
  const cards = (await db.flashcards.toArray()).filter((c) => c.formulaId);
  const questions = (await db.questions.toArray()).filter((q) => q.formulaId);
  const mistakes = (await db.mistakes.toArray()).filter((m) => m.formulaId);
  const logs = cards.length
    ? await db.reviewLogs
        .where('cardId')
        .anyOf(cards.map((c) => c.id))
        .toArray()
    : [];
  const results = questions.length
    ? await db.quizResults
        .where('questionId')
        .anyOf(questions.map((q) => q.id))
        .toArray()
    : [];
  const out = new Map<string, FormulaStatus>();
  for (const f of formulas) {
    const myCards = cards.filter((c) => c.formulaId === f.id);
    const ids = new Set(myCards.map((c) => c.id));
    const myQs = questions.filter((q) => q.formulaId === f.id);
    const qIds = new Set(myQs.map((q) => q.id));
    const evidence = gatherEvidence({
      cardLogs: logs.filter((l) => ids.has(l.cardId)),
      quiz: results.filter((r) => qIds.has(r.questionId)),
      mistakes: mistakes.filter((m) => m.formulaId === f.id),
    });
    out.set(f.id, {
      mastery: computeMastery(evidence, now),
      dueCards: myCards.filter((c) => c.sched.phase !== 'new' && c.sched.due <= now).length,
      cards: myCards.length,
      questions: myQs.length,
    });
  }
  return out;
}

export function recommendations(
  formulas: FormulaRow[],
  statuses: Map<string, FormulaStatus>,
): Recommendation[] {
  return recommendForReview(
    formulas.flatMap((f) => {
      const s = statuses.get(f.id);
      return s ? [{ id: f.id, name: f.name, mastery: s.mastery, dueCards: s.dueCards }] : [];
    }),
  );
}
