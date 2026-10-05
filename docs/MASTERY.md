# Formula mastery: the exact rules

Mastery is **derived, never set by hand**. It is recomputed from the user's own history whenever it is shown. The code is `src/engines/formula/mastery.ts` (the numbers below are the constants in `RULES`), `evidence.ts` and `recommend.ts`; each rule is pinned by a unit test in `mastery.test.ts` that uses a fake clock.

## 1. What counts as an answer ("evidence")

Only things **linked to the formula** (by `formulaId`):

| Source                                          | Counts as                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Review of a flashcard linked to the formula     | correct unless the rating was _Again_ (Hard/Good/Easy are correct) |
| Result of a quiz question linked to the formula | correct / incorrect as recorded                                    |
| A mistake logged against the formula            | incorrect                                                          |

A mistake logged within 24 hours after a wrong quiz answer **to the same question** is the same failure, so it is not counted twice. Nothing else (viewing a formula, reading notes) counts. Answers are ordered by time.

## 2. Earned level (from the answers alone)

Let _accuracy_ = share of correct answers among the **last 10** answers, _correct days_ = number of distinct calendar days with at least one correct answer, _span_ = days between the first and the last correct answer, _trailing_ = how many of the most recent answers in a row are correct.

| State           | Requires                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Not studied** | no answers at all                                                                                       |
| **Learning**    | at least one answer, and not enough for Reviewing                                                       |
| **Reviewing**   | ≥ 3 answers and accuracy ≥ 60%                                                                          |
| **Strong**      | ≥ 6 answers, correct on ≥ 3 different days, accuracy ≥ 80%, last 3 answers correct                      |
| **Mastered**    | Strong, and ≥ 10 answers, correct on ≥ 5 different days, span ≥ 14 days, accuracy ≥ 90%, last 5 correct |

Because levels need several different days, they cannot be reached by repeating an answer many times in one sitting.

## 3. Recent errors cap the level

- If the **last answer is wrong**, the level is at most **Reviewing**.
- If the **last two answers are wrong**, the level is at most **Learning**.

A later correct answer lifts the cap again.

## 4. Decay with time

Let _idle days_ = days since the **last answer** (of any kind).

- Up to **14 idle days**: no decay.
- After that: **one level down for the first period, then one more for every further 14 days** (steps = 1 + ⌊(idle − 14) / 14⌋).
- Decay never goes below **Learning** (a formula that has any history is never shown as Not studied again).

Studying again resets the clock.

Order of operations: earned level → recent-error cap → decay.

## 5. Recommended for review

Formulas with history (never "Not studied") that meet one of these, most urgent first, each with a plain reason built from the user's own data:

1. **Recent errors**: 2 or more of the last 5 answers wrong → "3 of your last 5 answers were wrong"
2. **Last answer wrong** → "Your last answer was wrong"
3. **Decayed** → "Not practised for 19 days, so it slipped from Strong to Reviewing"
4. **Linked flashcards due** → "2 linked flashcards are due"

Only the first matching reason is shown for a formula. Ties are broken alphabetically.

## 6. What it is not

It is a transparent summary of the user's own answers, not a prediction of exam performance and not an AI judgement. Numbers shown (answers so far, accuracy) come straight from the history.
