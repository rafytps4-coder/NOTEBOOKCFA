import { db } from './db';
import { now } from './ids';
import type { HelperInstance } from './studyModels';

/** Generic enabled/disabled state of Helpers. Knows nothing about any particular Helper. */

export async function listHelperInstances(): Promise<HelperInstance[]> {
  return db.helperInstances.toArray();
}

export async function setHelperEnabled(
  id: string,
  enabled: boolean,
  version: string,
): Promise<HelperInstance> {
  const t = now();
  const cur = await db.helperInstances.get(id);
  const next: HelperInstance = {
    id,
    onboarded: cur?.onboarded ?? false,
    version: enabled ? version : (cur?.version ?? version),
    enabled,
    enabledAt: enabled ? t : (cur?.enabledAt ?? null),
    disabledAt: enabled ? (cur?.disabledAt ?? null) : t,
  };
  await db.helperInstances.put(next);
  return next;
}

export async function setHelperOnboarded(id: string, onboarded = true): Promise<void> {
  await db.helperInstances.update(id, { onboarded });
}

/** Removes a formula pack's formulas (not notes, cards or history). Used by Helpers' "delete data". */
export async function removeFormulaPack(packId: string): Promise<void> {
  await db.transaction('rw', [db.formulas, db.settings], async () => {
    await db.formulas.where('packId').equals(packId).delete();
    const row = await db.settings.get('formulas.installedPacks');
    if (row)
      await db.settings.put({
        key: row.key,
        value: (row.value as { packId: string }[]).filter((p) => p.packId !== packId),
      });
  });
}
