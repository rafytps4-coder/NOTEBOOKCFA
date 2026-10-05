import { RULES, type MasteryResult } from './mastery';
import { MASTERY_LABEL } from './types';

export interface Recommendation {
  id: string;
  name: string;
  reason: string;
  /** Higher = more urgent. */
  priority: number;
}

export interface RecommendInput {
  id: string;
  name: string;
  mastery: MasteryResult;
  /** Linked flashcards that are due now. */
  dueCards: number;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Formulas worth revisiting, each with a plain reason built from the user's own history:
 * recent errors first, then decay, then linked flashcards that are due. Formulas never studied
 * are not recommended: there is nothing to review yet.
 */
export function recommendForReview(items: RecommendInput[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const it of items) {
    const m = it.mastery;
    if (m.state === 'not-studied') continue;
    if (m.wrongInLast5 >= 2) {
      out.push({
        id: it.id,
        name: it.name,
        priority: 300 + m.wrongInLast5,
        reason: `${m.wrongInLast5} of your last ${m.lastFive} answers were wrong`,
      });
    } else if (m.lastWasWrong) {
      out.push({ id: it.id, name: it.name, priority: 250, reason: 'Your last answer was wrong' });
    } else if (m.decaySteps > 0 && m.idleDays !== null) {
      out.push({
        id: it.id,
        name: it.name,
        priority: 200 + Math.min(m.idleDays, 99) / 100,
        reason: `Not practised for ${Math.floor(m.idleDays)} days, so it slipped from ${MASTERY_LABEL[m.beforeDecay]} to ${MASTERY_LABEL[m.state]}`,
      });
    } else if (it.dueCards > 0) {
      out.push({
        id: it.id,
        name: it.name,
        priority: 100 + it.dueCards,
        reason: `${plural(it.dueCards, 'linked flashcard')} ${it.dueCards === 1 ? 'is' : 'are'} due`,
      });
    }
  }
  return out.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

export { RULES };
