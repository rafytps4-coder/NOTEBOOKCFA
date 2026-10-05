import { create } from 'zustand';

interface StorageState {
  /** null = not checked yet */
  persisted: boolean | null;
}

export const useStorageStore = create<StorageState>(() => ({ persisted: null }));

/**
 * Ask the browser to keep our data from being evicted. Safe to call repeatedly.
 * Browsers may refuse silently; the UI explains why backups matter in that case.
 */
export async function requestPersistence(): Promise<boolean> {
  let granted = false;
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) granted = true;
    else if (navigator.storage?.persist) granted = await navigator.storage.persist();
  } catch {
    granted = false;
  }
  useStorageStore.setState({ persisted: granted });
  return granted;
}
