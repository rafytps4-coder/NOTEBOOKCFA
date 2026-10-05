/** A formula as shipped in a content pack (matches content-packs/schemas/formulas.schema.json). */
export interface PackFormula {
  id: string;
  name: string;
  topicId: string;
  conceptIds?: string[];
  category: string;
  equation: { latex: string; plain: string };
  variables: { symbol: string; name: string; description?: string; unit?: string }[];
  purpose: string;
  whenToUse: string;
  assumptions?: string[];
  workedExample: { problem: string; steps: string[]; answer: string };
  relatedFormulaIds?: string[];
  commonMistakes: string[];
  tags?: string[];
  difficulty: 'foundational' | 'intermediate' | 'advanced';
  isCalculationHeavy?: boolean;
  source: 'original';
}

export interface FormulaPack {
  schemaVersion: string;
  kind: 'formulas';
  packId: string;
  helperId: string;
  title: string;
  curriculumVersion: string;
  contentVersion: string;
  license: string;
  disclaimer: string;
  formulas: PackFormula[];
}

/** The mastery ladder, lowest first. */
export const MASTERY_STATES = [
  'not-studied',
  'learning',
  'reviewing',
  'strong',
  'mastered',
] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

export const MASTERY_LABEL: Record<MasteryState, string> = {
  'not-studied': 'Not studied',
  learning: 'Learning',
  reviewing: 'Reviewing',
  strong: 'Strong',
  mastered: 'Mastered',
};
