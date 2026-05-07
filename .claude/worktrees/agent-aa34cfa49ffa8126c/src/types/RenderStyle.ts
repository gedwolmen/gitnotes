/**
 * User-customizable render style tokens per note format. All fields are
 * optional — anything missing falls back to the active theme defaults.
 *
 * The shape persists to GitHub under `settings/render.json` in the repo
 * the user picks for render-style storage. See RenderStyleService.
 */

export type RenderFormat = 'markdown' | 'org' | 'neorg';

export interface HeadingTokens {
  color?: string;
  fontWeight?: '400' | '500' | '600' | '700' | 'bold' | 'normal';
}

export interface FormatRenderStyle {
  h1?: HeadingTokens;
  h2?: HeadingTokens;
  h3?: HeadingTokens;
  body?: { color?: string };
  codeBlock?: { background?: string; text?: string };
  inlineCode?: { background?: string; text?: string };
  link?: { color?: string };
  blockquote?: { bar?: string; text?: string };
  divider?: { color?: string };
}

export interface RenderStyleSettings {
  version: 1;
  formats: Partial<Record<RenderFormat, FormatRenderStyle>>;
}

export const EMPTY_RENDER_STYLE_SETTINGS: RenderStyleSettings = {
  version: 1,
  formats: {},
};

export const RENDER_STYLE_PATH = 'settings/render.json';

export const RENDER_FORMATS: RenderFormat[] = ['markdown', 'org', 'neorg'];

export function formatLabel(format: RenderFormat): string {
  switch (format) {
    case 'markdown': return 'Markdown (.md)';
    case 'org': return 'Org (.org)';
    case 'neorg': return 'Neorg (.norg)';
  }
}

export function emptyFormatStyle(): FormatRenderStyle {
  return {};
}

export function mergeFormatStyle(
  base: FormatRenderStyle,
  override?: FormatRenderStyle,
): FormatRenderStyle {
  if (!override) return base;
  return {
    h1: { ...base.h1, ...override.h1 },
    h2: { ...base.h2, ...override.h2 },
    h3: { ...base.h3, ...override.h3 },
    body: { ...base.body, ...override.body },
    codeBlock: { ...base.codeBlock, ...override.codeBlock },
    inlineCode: { ...base.inlineCode, ...override.inlineCode },
    link: { ...base.link, ...override.link },
    blockquote: { ...base.blockquote, ...override.blockquote },
    divider: { ...base.divider, ...override.divider },
  };
}
