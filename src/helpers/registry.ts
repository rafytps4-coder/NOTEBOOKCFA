import type { Helper } from './types';

/**
 * The single place Helpers are registered. Every folder under `src/helpers/` that has an
 * `index.ts(x)` with a default-exported `Helper` is picked up automatically, so adding a Helper is
 * "add a folder" and removing one is "delete the folder": nothing else names it. The core only
 * ever talks to this list.
 */
const modules = import.meta.glob<{ default: Helper }>('./*/index.{ts,tsx}', { eager: true });

export const helpers: Helper[] = Object.values(modules)
  .map((m) => m.default)
  .filter((h): h is Helper => !!h && typeof h.id === 'string')
  .sort((a, b) => a.name.localeCompare(b.name));

export const getHelper = (id: string): Helper | undefined => helpers.find((h) => h.id === id);
