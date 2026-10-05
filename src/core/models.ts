/** Parent id used for items that live at the top level of the library. */
export const ROOT_ID = 'root';

export type DocumentKind = 'notebook' | 'pdf' | 'quickNote';

export interface Folder {
  id: string;
  name: string;
  parentId: string; // ROOT_ID or another folder's id
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface NotebookDocument {
  id: string;
  kind: DocumentKind;
  title: string;
  folderId: string; // ROOT_ID or a folder id
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
  deletedAt: number | null;
}

/** Stub: page content (strokes, template, objects) arrives in prompts 02-04. */
export interface Page {
  id: string;
  documentId: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export type AssetKind = 'pdf' | 'image';

/** Large binary data. Kept in its own table so listing metadata never loads blobs. */
export interface Asset {
  id: string;
  documentId: string; // owner; removed together with the document
  kind: AssetKind;
  mime: string;
  name: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}
