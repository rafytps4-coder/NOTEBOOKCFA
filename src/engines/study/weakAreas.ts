import { MISTAKE_CATEGORIES } from '@/core/studyModels';

export interface WeakArea {
  /** The tag, or "untagged". */
  tag: string;
  mistakes: number;
  unreviewed: number;
}

/** Tags ranked by how many mistakes the user logged under them (from the user's own data only). */
export function weakAreasByTag(mistakes: { tags: string[]; reviewed: boolean }[]): WeakArea[] {
  const m = new Map<string, WeakArea>();
  for (const x of mistakes) {
    for (const tag of x.tags.length ? x.tags : ['untagged']) {
      const w = m.get(tag) ?? { tag, mistakes: 0, unreviewed: 0 };
      w.mistakes++;
      if (!x.reviewed) w.unreviewed++;
      m.set(tag, w);
    }
  }
  return [...m.values()].sort((a, b) => b.mistakes - a.mistakes || a.tag.localeCompare(b.tag));
}

export function categoryLabel(id: string): string {
  return MISTAKE_CATEGORIES.find(([k]) => k === id)?.[1] ?? id;
}
