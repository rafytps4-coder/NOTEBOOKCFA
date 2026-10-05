import { db, removeFormulaPack } from '@/core';
import type { Helper } from '../types';
import { CfaDashboard } from './Dashboard';
import { CfaOnboarding } from './Onboarding';

const PACK_ID = 'cfa-l1-2027';

/**
 * CFA Helper (Level I): a registered shell. It declares what it will need (a content pack) and what
 * it stores, but builds no onboarding, planner or formula bank yet (prompts 11–13).
 */
const cfa: Helper = {
  id: 'cfa',
  name: 'CFA Helper',
  description:
    'Study tools for CFA Level I on top of your notebooks. Early shell: onboarding, planner and dashboard are planned, not built.',
  icon: '📈',
  version: '0.1.0',
  stores: [
    'Whether this Helper is on or off',
    'Formulas from its starter content pack, if you install them (your notes, flashcards and progress are stored separately and are not touched)',
  ],
  Onboarding: CfaOnboarding,
  Dashboard: CfaDashboard,
  packs: [
    {
      id: 'cfa-starter-formulas',
      packId: PACK_ID,
      title: 'Starter formula bank (original wording)',
      description: 'A few formulas written for this app. Contains no third-party curriculum text.',
      load: async () =>
        (await import('../../../content-packs/cfa-l1-2027/formulas.starter.json')).default,
    },
  ],
  data: [
    {
      id: 'formula-pack',
      label: 'Formulas installed from the CFA starter pack',
      count: () => db.formulas.where('packId').equals(PACK_ID).count(),
      remove: () => removeFormulaPack(PACK_ID),
    },
  ],
};

export default cfa;
