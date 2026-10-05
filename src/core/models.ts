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

export type StrokeTool = 'pen' | 'pencil' | 'highlighter';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t: number; // ms since the stroke started
}

/** Ink stroke in page space (CSS px at zoom 1). Immutable once committed. */
export interface Stroke {
  id: string;
  tool: StrokeTool;
  color: string;
  width: number;
  opacity: number;
  /** True when pressure is not real (mouse/finger) and should be simulated from speed. */
  sim?: boolean;
  points: StrokePoint[];
}

/** A4 at 96 dpi. Page sizes and templates are added in prompt 03. */
export const DEFAULT_PAGE_WIDTH = 794;
export const DEFAULT_PAGE_HEIGHT = 1123;

export interface Page {
  id: string;
  documentId: string;
  order: number;
  width: number;
  height: number;
  strokes: Stroke[];
  createdAt: number;
  updatedAt: number;
}

export type AssetKind = 'pdf' | 'image' | 'thumbnail';

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
