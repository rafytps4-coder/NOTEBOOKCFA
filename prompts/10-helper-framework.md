# Prompt 10: Helper framework + empty CFA shell

## Goal
A clean plugin system so Helpers can be enabled/disabled without touching the core.

## Do
1. In `helpers/types.ts` define a `Helper` interface: id, name, description, icon, version, `Onboarding` component, `Dashboard` component, optional `selectionActions(selection)` returning actions for selected notebook content, optional content packs it needs, and `onEnable`/`onDisable` hooks.
2. `helpers/registry.ts`: register Helpers in one place; the core discovers them only through the registry. Enabled state stored in Dexie (`helperInstances`).
3. Helpers screen: list available Helpers with enable/disable, description, and what data they store. Disabling a Helper hides its UI but **keeps** its data unless the user explicitly chooses "Delete Helper data" (confirmation, shows what will be removed).
4. Notebook selection menu: a generic "Helpers" entry showing actions contributed by enabled Helpers. When none are enabled, nothing appears.
5. Create `helpers/cfa/` containing only a registered shell: name "CFA Helper", Level I, the required disclaimer visible, and honest "Planned" states for unbuilt parts. No fake dashboard numbers.
6. **Isolation proof**: add a test or script that builds the app with `helpers/cfa` removed (or the registry empty) and confirm the core still compiles and the core e2e tests pass. Add an ESLint rule (or script) that fails if `core`, `engines` or `features` import from `helpers/cfa`.
7. Document the Helper API in `docs/HELPERS.md` with a step-by-step "how to add a new Helper".

## Do not
Build CFA onboarding, planner, or formula bank yet.

## Done when
Enable and disable the CFA shell; the core works identically either way; the isolation check passes. Tests pass.

Finish with the required report and STOP.
