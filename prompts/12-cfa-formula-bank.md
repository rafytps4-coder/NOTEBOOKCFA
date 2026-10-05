# Prompt 12: CFA formula bank

## Goal
Grow the starter pack to roughly 80-120 well-written formulas and wire it into mastery and review.

## Do
1. Extend `content-packs/cfa-l1-2027/formulas.starter.json` into `formulas.json` (keep the starter's quality bar). Cover these categories, every formula valid against the schema:
   - **Quantitative methods**: TVM (FV/PV, annuities, perpetuity, effective rate, continuous compounding), returns (HPR, arithmetic, geometric, money- and time-weighted), statistics (variance, standard deviation, coefficient of variation, skewness/kurtosis intuition, covariance, correlation), probability (Bayes, expected value, total probability), hypothesis testing (z/t statistic, confidence interval), regression (slope, R², standard error basics).
   - **Financial statement analysis**: liquidity, solvency, efficiency, profitability ratios, DuPont (3 and 5 step), EPS, cash conversion cycle, free cash flow.
   - **Corporate finance**: NPV, IRR concept, payback, WACC, cost of debt/equity, MM ideas, dividend and payout ratios, degree of operating/financial leverage.
   - **Equities**: CAPM, DDM variants, FCFE/FCFF, P/E and EV/EBITDA relationships, residual income basics.
   - **Fixed income**: bond price, current yield, YTM concept, duration, modified duration, convexity, PVBP, spread concepts.
   - **Derivatives**: forward pricing, futures basis, option payoffs, put-call parity, binomial one-step, swap value basics.
   - **Portfolio management**: expected return, portfolio variance (2 and 3 asset), Sharpe, Treynor, Jensen's alpha, information ratio, beta.
   Where a formula is only conceptual or non-standard, omit it rather than guess.
2. **Quality rules**: all wording original (no curriculum text); every formula has variables, purpose, when-to-use, a worked example with numbers you have **actually computed in code**, related formulas, and 2+ common mistakes. Write a script `scripts/verify-formulas` that recomputes each example's numeric answer where applicable and fails on mismatch.
3. Add a validation step in CI: schema validation, unique ids, all `topicId`/`conceptIds`/`relatedFormulaIds` resolve against the topics pack.
4. Add any missing concepts to `topics.json` so formulas link cleanly (keep original wording).
5. UI: CFA Formula Bank screen grouped by topic and category, with search, mastery badges (derived, not manual), "due for review" filter, and a "Study these formulas" button that creates/updates a flashcard deck (front: formula name + prompt, back: equation + variables) through the generic study system, without duplicating cards on re-run.
6. Flag any formula you are not highly confident about in `docs/FORMULA-REVIEW.md` for me to check. Do not hide uncertainty.

## Do not
Add practice questions or readiness.

## Done when
~80-120 validated formulas load, every worked example is verified by script, the bank is browsable, and studying formulas updates mastery. Tests pass.

Finish with the required report and STOP. (I will personally review the formulas flagged in `docs/FORMULA-REVIEW.md` before relying on them.)
