# Prompt 08: Study system (generic)

## Goal
A reusable flashcard / spaced-repetition / mistake-log system for ALL future Helpers. Nothing CFA-specific here.

## Do
1. Dexie tables (migration-safe, no data loss): `studySets`, `flashcards`, `reviewLogs`, `studySessions`, `questions`, `mistakes`, `tags`. Cards support text front/back, images, and an optional formula reference (formula engine arrives in prompt 09, so just allow a nullable `formulaId`). Cards can also link to a notebook page (`sourceRef`).
2. Scheduler in `engines/study` behind a `Scheduler` interface with an **SM-2-style** implementation: ratings Again / Hard / Good / Easy, adaptive ease factor, lapses, correct answers push further out, incorrect return soon. Pure functions, deterministic, injectable clock. Heavily unit-tested (including edge cases and long histories).
3. Study UI: create/edit/delete sets and cards, tags, a review session screen (one card at a time, keyboard and touch friendly), session summary, due-today counts, and per-set stats from real review history only.
4. Mistake log: record a mistake with question reference (or free text), user answer, correct answer, category (didn't know concept, forgot formula, calculation error, misread question, conceptual misunderstanding, time pressure, guess), notes, tags, date, reviewed flag. List, filter, and "review mistakes" mode. Weak areas summary by tag, computed from the user's data.
5. User-created questions: simple editor (multiple choice or short answer) with metadata fields (tags, difficulty, type) and a quiz mode that records results and offers to log mistakes. Import/export of the user's questions as JSON.
6. Add "Create flashcard" from a notebook selection (text boxes and a snapshot image of a selected region). Handwriting-to-text is not available yet, so handwriting is attached as an image.
7. Study tables must be included in prompt 06's backup/restore. Update and test it.

## Do not
Add CFA content, helpers, or AI. Don't claim "AI generated" anything.

## Done when
Create a set, add cards, study with spaced repetition across simulated days (use a fake clock in tests), log mistakes, back up and restore it all. Tests pass.

Finish with the required report and STOP.
