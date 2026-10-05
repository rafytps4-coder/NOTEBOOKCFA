# Helpers: the plugin API

A **Helper** is an optional add-on for one subject (the first is the CFA Helper). The core notebook never depends on any Helper: with none installed, or every one switched off, the app behaves exactly the same.

## How it fits together

```
src/helpers/
  types.ts       the Helper interface (what a Helper provides)
  registry.ts    discovers Helpers (every src/helpers/<name>/index.ts default-exports one)
  state.ts       enable / disable / onboarding / data helpers + React hooks
  cfa/           the CFA Helper (an example; deleting this folder leaves the app working)
src/core/helperInstances.ts   generic enabled/disabled state (Dexie table `helperInstances`)
src/features/helpers/         the Helpers screen and each Helper's route (/helpers, /helpers/:id)
```

Rules (enforced):

- `core` and `engines` never import from `helpers` (ESLint `no-restricted-imports`).
- `features` and `ui` may use `helpers/registry`, `helpers/types` and `helpers/state`, but **never `helpers/cfa`** (or any specific Helper): they only see Helpers through the registry. Also an ESLint rule, with a unit test that proves it fires (`src/helpers/isolation.test.ts`).
- A Helper may use `core`, `engines`, `features` and `ui`.

## The `Helper` interface

```ts
interface Helper {
  id: string; // unique, stable (stored in the database)
  name: string;
  description: string;
  icon: string; // an emoji or short glyph
  version: string;
  stores: string[]; // plain-language list of what it stores (shown to the user)
  Onboarding: ComponentType<{ onDone: () => void }>; // first time it is opened
  Dashboard: ComponentType; // its main screen
  selectionActions?(selection: SelectionContext): SelectionAction[];
  packs?: HelperPack[]; // content packs it needs (offered under Study → Formulas → Packs)
  data?: HelperDataItem[]; // what "Delete Helper data" removes (label, count(), remove())
  onEnable?(): void | Promise<void>;
  onDisable?(): void | Promise<void>;
}
```

- **Enabled state** lives in `helperInstances` (`id`, `enabled`, `onboarded`, timestamps). A Helper with no row is off.
- **Disabling** hides the Helper (its route, its packs, its selection actions) and runs `onDisable`. It deletes **nothing**.
- **Delete Helper data** is a separate, explicit action on the Helpers screen. A confirmation dialog lists each `data` item with its real count first; only then are the items removed. Notebooks, flashcards, questions, mistakes and notes are never part of a Helper's data unless the Helper declares them (and they should not be).
- **Selection actions**: in the notebook toolbar a generic **Helpers ▾** menu appears only when an enabled Helper defines `selectionActions`. It is asked for actions when opened; if none apply it says so. A Helper that throws is skipped.
- **Packs** are validated (Ajv, `content-packs/schemas`) before anything is written; an invalid pack changes nothing.

## How to add a new Helper

1. **Create the folder** `src/helpers/<id>/` with an `index.ts` (or `.tsx`) whose **default export** is a `Helper`:

   ```ts
   // src/helpers/spanish/index.ts
   import type { Helper } from '../types';
   import { Dashboard } from './Dashboard';
   import { Onboarding } from './Onboarding';

   const spanish: Helper = {
     id: 'spanish',
     name: 'Spanish Helper',
     description: 'Vocabulary tools on top of your notebooks.',
     icon: '🇪🇸',
     version: '0.1.0',
     stores: ['Whether this Helper is on or off'],
     Onboarding,
     Dashboard,
   };
   export default spanish;
   ```

2. **Write `Onboarding` and `Dashboard`** as ordinary React components. Use `core`/`engines`/`ui` and the generic study and formula features (e.g. link to `/study`). Show only real data; label anything unbuilt "Planned".
3. **Declare your data.** List what you store in `stores`, and give `data` items (with `count` and `remove`) for anything that "Delete Helper data" should remove. Keep your own data in your own Dexie tables only if you must (that needs a migration and a backup entry, see `docs/ARCHITECTURE.md` §6b); prefer the generic tables.
4. **Optional:** add `selectionActions`, `packs`, `onEnable`/`onDisable`.
5. **Nothing else to register**: the registry finds the folder, the Helpers screen lists it, and the nav shows **Helpers** as soon as one exists.
6. **Keep the rules**: do not import your Helper from `core`, `engines`, `features` or `ui`. Run `npm run lint`, `npm test`, and `npm run check:isolation`.
7. **Test it**: unit-test pure logic; add an e2e test tagged `@helpers` in its title (these are skipped by the isolation check, which runs the core tests without `src/helpers/cfa`).

## The isolation check

`npm run check:isolation` copies the project to a temporary folder, **deletes `src/helpers/cfa`** there, then typechecks, lints and builds it. With `--e2e` it also runs every end-to-end test that is not tagged `@helpers`. If the core ever starts to depend on the CFA Helper, this fails.
