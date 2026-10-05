import { getSetting } from '@/core';
import { DEFAULT_BACKGROUND, type PageSizeName, type PageStyle, type TemplateKind } from '@/core';
import { pageDimensions } from '@/engines/drawing';

export interface PageDefaults {
  kind: TemplateKind;
  spacing: number;
  sizeName: Exclude<PageSizeName, 'custom'>;
  orientation: 'portrait' | 'landscape';
}

export const PAGE_DEFAULTS_KEY = 'pages.defaults';

export const FALLBACK_DEFAULTS: PageDefaults = {
  kind: 'blank',
  spacing: 28,
  sizeName: 'A4',
  orientation: 'portrait',
};

export function styleFromDefaults(d: PageDefaults): PageStyle {
  return {
    ...pageDimensions(d.sizeName, d.orientation),
    sizeName: d.sizeName,
    template: { kind: d.kind, spacing: d.spacing, color: '#c5cfdc' },
    background: DEFAULT_BACKGROUND,
  };
}

export async function loadDefaultStyle(): Promise<PageStyle> {
  return styleFromDefaults({
    ...FALLBACK_DEFAULTS,
    ...(await getSetting<Partial<PageDefaults>>(PAGE_DEFAULTS_KEY, {})),
  });
}
