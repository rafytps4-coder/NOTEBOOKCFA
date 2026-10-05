/**
 * Packs that ship inside the app, loaded on demand (so they cost nothing until used). Where a
 * Helper provides packs, they will be listed from the Helper instead (prompt 10).
 */
export interface BundledPack {
  id: string;
  title: string;
  description: string;
  load: () => Promise<unknown>;
}

export const BUNDLED_PACKS: BundledPack[] = [
  {
    id: 'starter',
    title: 'Starter formula bank',
    description: 'A small set of formulas written for this app (original wording).',
    load: async () =>
      (await import('../../../content-packs/cfa-l1-2027/formulas.starter.json')).default,
  },
];
