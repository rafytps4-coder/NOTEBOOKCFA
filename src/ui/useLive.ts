import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/core';

/** Re-runs a Dexie query whenever the tables it reads change. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: setValue,
      error: (e) => console.error('liveQuery failed', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** A persisted setting (settings table) with an immediate fallback value. */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useLive(() => getSetting<T>(key, fallback), [key], fallback);
  return [value, (v: T) => void setSetting(key, v)];
}
