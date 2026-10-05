export type SortKey = 'name' | 'modified' | 'created';
export type SortDir = 'asc' | 'desc';
export interface SortOptions {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortOptions = { key: 'name', dir: 'asc' };

interface Sortable {
  name: string;
  createdAt: number;
  updatedAt: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortItems<T>(items: T[], pick: (t: T) => Sortable, opts: SortOptions): T[] {
  const sign = opts.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    const c =
      opts.key === 'name'
        ? collator.compare(x.name, y.name)
        : opts.key === 'modified'
          ? x.updatedAt - y.updatedAt
          : x.createdAt - y.createdAt;
    return sign * c;
  });
}
