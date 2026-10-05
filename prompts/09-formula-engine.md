# Prompt 09: Formula engine (generic)

## Goal
A generic formula library with rendering, notes, flashcards and behaviour-driven mastery. Not CFA-specific.

## Install
`katex`.

## Do
1. Dexie tables: `formulas` (user + pack-provided), `formulaProgress` (per-user state keyed by formula id). Pack content is static; user data (notes, mastery inputs, custom formulas) is stored separately so updating a pack never overwrites user data.
2. Model matches `content-packs/schemas/formulas.schema.json` (id, name, category, equation latex/plain, variables, purpose, whenToUse, assumptions, worked example, related ids, common mistakes, tags, difficulty). Users can also create their own formulas (manual entry; no handwriting recognition).
3. Formula UI: searchable/filterable list by category and tag, detail view with KaTeX rendering, variable table, worked example (steps), related formulas as links, user notes, "Create flashcard" and "Create practice question" buttons wired to the study system. Provide an accessible plain-text equation for screen readers.
4. **Mastery** in `engines/formula`: states Not Studied → Learning → Reviewing → Strong → Mastered, derived from review logs of linked flashcards, linked question results, linked mistakes, and time since last review (decay). Pure, deterministic, documented in `docs/MASTERY.md` with the exact rules, and unit-tested with a fake clock. Users cannot set mastery by hand.
5. "Recommended for review" list: formulas whose mastery has decayed or with recent errors, with a plain reason ("3 of your last 5 answers were wrong").
6. Add formulas to backup/restore and the search index.
7. Load packs through a validator using Ajv and the schemas in `content-packs/schemas`. Invalid packs fail safely with a readable error and never touch user data. Include tests with valid, invalid and wrong-version packs, and a test that loads the existing `formulas.starter.json`.

## Do not
Implement handwriting formula recognition. Don't add the CFA Helper yet.

## Done when
Load the starter pack, browse formulas, make flashcards from them, study, and watch mastery change according to the documented rules. Tests pass.

Finish with the required report and STOP.
