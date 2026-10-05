import type { ComponentType } from 'react';

/** What a Helper can offer for the currently selected notebook content. */
export interface SelectionContext {
  documentId: string;
  pageId: string;
  /** Text from selected text boxes (empty when none). */
  text: string;
  /** Snapshot (PNG) of the selected region, made on demand. */
  snapshot: () => Promise<Blob | null>;
}

export interface SelectionAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

/** A content pack a Helper brings (loaded on demand, validated before it is installed). */
export interface HelperPack {
  id: string;
  title: string;
  description: string;
  /** Resolves to the parsed JSON of the pack. */
  load: () => Promise<unknown>;
  /** Pack id inside the file, used to show whether it is installed. */
  packId: string;
}

/**
 * One piece of data a Helper stores, so the user can see what "Delete Helper data" will remove.
 * Disabling a Helper never deletes any of this.
 */
export interface HelperDataItem {
  id: string;
  label: string;
  count: () => Promise<number>;
  remove: () => Promise<void>;
}

export interface Helper {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  /** Plain-language list of what this Helper stores (shown on the Helpers screen). */
  stores: string[];
  /** Shown the first time the Helper is opened after enabling. */
  Onboarding: ComponentType<{ onDone: () => void }>;
  Dashboard: ComponentType;
  /** Actions for selected notebook content. Omit if the Helper has none. */
  selectionActions?: (selection: SelectionContext) => SelectionAction[];
  /** Content packs the Helper needs. */
  packs?: HelperPack[];
  /** What "Delete Helper data" removes. Empty/omitted: the Helper keeps no data of its own. */
  data?: HelperDataItem[];
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
}
