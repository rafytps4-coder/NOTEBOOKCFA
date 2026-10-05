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

export type TemplateKind = 'blank' | 'ruled' | 'grid' | 'dotted' | 'cornell';

/** Vector page background. Drawn behind the ink; never baked into strokes. */
export interface PageTemplate {
  kind: TemplateKind;
  /** Distance between lines/dots in page px. */
  spacing: number;
  color: string;
}

export type PageSizeName = 'A4' | 'Letter' | 'A5' | 'custom';

export const DEFAULT_TEMPLATE: PageTemplate = { kind: 'blank', spacing: 28, color: '#c5cfdc' };
export const DEFAULT_BACKGROUND = '#ffffff';

/** Page metadata. Ink lives in `PageContent` so listing pages never loads strokes. */
export interface Page {
  id: string;
  documentId: string;
  order: number;
  width: number; // page px at 96 dpi, already orientation-adjusted
  height: number;
  sizeName: PageSizeName;
  template: PageTemplate;
  background: string;
  bookmarked: boolean;
  deletedAt: number | null; // soft delete so page operations can be undone
  createdAt: number;
  updatedAt: number;
}

/** Fields every page object shares. Position is the centre; rotation is radians about the centre. */
export interface ObjectBase {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  z: number;
}

export interface TextObject extends ObjectBase {
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle';

export interface ShapeObject extends ObjectBase {
  type: 'shape';
  shape: ShapeKind;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  /** line/arrow only: endpoints as 0|1 fractions of the box (start x/y, end x/y). */
  ends?: [number, number, number, number];
}

export interface ImageObject extends ObjectBase {
  type: 'image';
  assetId: string;
  /** Visible part of the source image, as fractions trimmed from each side. */
  crop: { l: number; t: number; r: number; b: number };
}

export type PageObject = TextObject | ShapeObject | ImageObject;

export interface PageContent {
  pageId: string;
  strokes: Stroke[];
  /** Text boxes, shapes and images (absent in rows written before prompt 04). */
  objects?: PageObject[];
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
