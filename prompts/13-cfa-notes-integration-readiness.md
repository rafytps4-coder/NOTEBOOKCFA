# Prompt 13: CFA notes integration, practice questions & Study Readiness

## Goal
Finish the CFA Helper: tie it into the user's notes, support their own practice questions, and show a transparent readiness estimate.

## Do
1. **Notes integration**: when CFA Helper is enabled, selecting content in any notebook shows a "CFA" group (through the Helper selection-action API). Actions that are really implemented:
   - Add to CFA notes (stores a link/snapshot under a chosen topic),
   - Create flashcard,
   - Link to formula (search picker),
   - Link to topic/concept (manual picker),
   - Add tag.
   Show "Identify topic automatically" as **Planned**, disabled with a label. When the Helper is disabled, none of this appears.
2. **Practice questions**: use the generic question system from prompt 08 with CFA metadata (topic, module, concept, formula, difficulty, type: conceptual/calculation/interpretation/scenario/ethics/valuation). Users create their own or import their own JSON. Ship **no** CFA Institute questions. Optionally ship up to 20 clearly original sample questions in a separate pack marked `source: original`; list them in `docs/SAMPLE-QUESTIONS-REVIEW.md` for me to approve before release.
3. Practice sessions by topic/formula/difficulty, with timing, results, and a one-tap "log mistake" with categories. Mistakes feed topic weakness, formula mastery, and the planner.
4. **Study Readiness** in `helpers/cfa/readiness` (pure, deterministic, unit-tested), documented in `docs/READINESS.md` with the exact formula. Inputs: topic coverage, formula mastery, recent practice accuracy, unresolved mistakes, review consistency, study hours vs plan. Requirements:
   - Show a score only when there is enough data; otherwise show what data is missing.
   - Show the biggest risks (topics) with the reason, and a concrete recommended next action.
   - Display this exact label: *"An estimate of study progress based on your activity. It is not a prediction of your CFA exam result."*
   - Never use words like "pass probability".
5. "My weak areas" screen from the user's own mistake and accuracy data.
6. Update backup/restore and tests for all new tables. Re-run the isolation check from prompt 10 and the full Core MVP checklist to prove nothing regressed.
7. Write `docs/CFA-HELPER-CHECKLIST.md`: enable → onboard → dashboard → topic tree → formula bank → study formulas → practice → log mistake → plan → readiness → disable Helper (core intact). Mark each item Verified (automated) / Verified (manual) / Not verified.

## Do not
Add mock exams, an AI tutor, or a financial calculator (future work).

## Done when
The full CFA flow works end to end, nothing is fabricated, the core is unaffected when the Helper is disabled or removed, and the checklist is honest. Tests pass.

Finish with the required report and STOP.
