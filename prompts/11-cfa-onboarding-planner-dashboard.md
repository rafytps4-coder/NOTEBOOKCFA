# Prompt 11: CFA onboarding, topics, planner & dashboard

## Goal
A real, honest CFA Level I dashboard built only from user data and original content.

## Do
1. Load `content-packs/cfa-l1-2027/topics.json` via the validator. Support multiple curriculum versions side by side (the user picks which one; never assume an exam date or year). Topic weights come from the pack (`null` = unknown) and are **user-editable**; unknown weights fall back to equal.
2. Onboarding: curriculum version, exam date, weekly study hours, preferred study days, self-rated strength per topic (1-5). Editable later in CFA settings.
3. Topic browser: topic → module → concept tree, with per-concept status the user can set as "studied" and notes/linked notebooks. Show original summaries only.
4. **Study planner** (`helpers/cfa/planner`, pure and unit-tested): input exam date, hours/week, study days, self-ratings, weights, and logged performance (flashcard accuracy, mistakes, formula mastery by topic). Output a day-by-day schedule of sessions (topic focus, formula review, question practice, mistake review). It must:
   - allocate more time to weak/heavily-weighted topics and less to strong ones,
   - include a final review phase before the exam,
   - be recomputed when performance data changes, without wiping completed sessions,
   - never claim it guarantees a pass.
   Document the algorithm in `docs/PLANNER.md`. Test with several scenarios (short runway, many hours, weak topic, all-strong).
5. Dashboard shows only real data: exam date, days remaining, topic progress, logged study hours (user logs sessions manually or via the timer), formula mastery summary, weak and strong topics (from mistakes + review accuracy), questions completed and accuracy **only if** the user has logged any, and today's recommended session. Empty states ("No data yet. Do a flashcard session to see this") instead of invented numbers.
6. A study timer that logs sessions to `studySessions`, tagged by topic.
7. Show the CFA disclaimer on the dashboard and in Settings > About. Add all CFA state to backup/restore.
8. E2E: enable Helper → onboard → see dashboard → plan appears → complete a session → plan updates.

## Do not
Add Study Readiness (prompt 13), the full formula bank (prompt 12), or any CFA Institute text, outcomes or questions.

## Done when
A new user can onboard, browse topics, get a plan, log study time, and see a dashboard with no fabricated numbers. Tests pass.

Finish with the required report and STOP.
