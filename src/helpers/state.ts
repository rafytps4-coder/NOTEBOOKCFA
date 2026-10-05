import {
  db,
  listHelperInstances,
  setHelperEnabled,
  setHelperOnboarded,
  type HelperInstance,
} from '@/core';
import { useLive } from '@/ui/useLive';
import { helpers as registered } from './registry';
import type { Helper, SelectionAction, SelectionContext } from './types';

export function useHelperInstances(): HelperInstance[] {
  return useLive(listHelperInstances, [], []);
}

/** Registered Helpers that are switched on. */
export function enabledHelpers(all: Helper[], instances: HelperInstance[]): Helper[] {
  const on = new Set(instances.filter((i) => i.enabled).map((i) => i.id));
  return all.filter((h) => on.has(h.id));
}

export function useEnabledHelpers(): Helper[] {
  const instances = useHelperInstances();
  return enabledHelpers(registered, instances);
}

/** Actions contributed by the given Helpers. A Helper that throws is skipped, never fatal. */
export function collectSelectionActions(
  list: Helper[],
  selection: SelectionContext,
): { helper: Helper; action: SelectionAction }[] {
  return list.flatMap((helper) => {
    try {
      return (helper.selectionActions?.(selection) ?? []).map((action) => ({ helper, action }));
    } catch (e) {
      console.warn(`Helper “${helper.id}” failed to provide selection actions`, e);
      return [];
    }
  });
}

/** Switch a Helper on. Its `onEnable` hook runs first; if it fails the Helper stays off. */
export async function enableHelper(h: Helper): Promise<void> {
  await h.onEnable?.();
  await setHelperEnabled(h.id, true, h.version);
}

/** Switch a Helper off. Its UI disappears; none of its data is touched. */
export async function disableHelper(h: Helper): Promise<void> {
  await h.onDisable?.();
  await setHelperEnabled(h.id, false, h.version);
}

export async function completeOnboarding(h: Helper): Promise<void> {
  await setHelperOnboarded(h.id, true);
}

/** What "Delete Helper data" would remove, with real counts. */
export async function describeHelperData(
  h: Helper,
): Promise<{ id: string; label: string; count: number }[]> {
  return Promise.all(
    (h.data ?? []).map(async (d) => ({ id: d.id, label: d.label, count: await d.count() })),
  );
}

/** Explicit user action only. Removes the Helper's own data; whether it is on or off is unchanged. */
export async function deleteHelperData(h: Helper): Promise<void> {
  for (const d of h.data ?? []) await d.remove();
  await db.helperInstances.update(h.id, { onboarded: false });
}
