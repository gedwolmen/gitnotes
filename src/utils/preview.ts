import { NoteFormat } from '../models/Note';
import type { MarkedStyles } from 'react-native-marked';
import type { FormatRenderStyle } from '../types/RenderStyle';

interface ColorPalette {
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  surface: string;
  background: string;
}

export interface ExtendedMarkdownStyles extends MarkedStyles {
  /** Resolved token overrides for new rendering features. Consumers read these
   *  to apply table / math / frontmatter / checkbox / imageCaption / wikiLink /
   *  syntaxHighlight colours in their own renderers. */
  _tokens?: Pick<
    FormatRenderStyle,
    'table' | 'math' | 'frontmatter' | 'checkbox' | 'imageCaption' | 'wikiLink' | 'syntaxHighlight'
  >;
}

export function stripTopMetadata(raw: string, format: NoteFormat): string {
  if (format === 'markdown') {
    const lines = raw.split('\n');
    if (lines[0]?.trim() !== '---') return raw;
    const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    if (closingIndex === -1) return raw;
    return lines.slice(closingIndex + 1).join('\n').trimStart();
  }

  if (format === 'org') {
    const lines = raw.split('\n');
    let i = 0;
    while (i < lines.length && /^\s*#\+[A-Za-z0-9_]+:\s*.*$/.test(lines[i])) {
      i += 1;
    }
    while (i < lines.length && lines[i].trim() === '') {
      i += 1;
    }
    return i > 0 ? lines.slice(i).join('\n') : raw;
  }

  if (format === 'neorg') {
    const lines = raw.split('\n');
    if (!lines[0]?.trim().startsWith('@document.meta')) return raw;
    const endIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '@end');
    if (endIndex === -1) return raw;
    return lines.slice(endIndex + 1).join('\n').trimStart();
  }

  return raw;
}

export function getMarkdownStyles(
  colors: ColorPalette,
  isDark: boolean,
  overrides?: FormatRenderStyle,
): ExtendedMarkdownStyles {
  const bodyColor = overrides?.body?.color ?? colors.text;
  const h1Color = overrides?.h1?.color ?? colors.text;
  const h2Color = overrides?.h2?.color ?? colors.text;
  const h3Color = overrides?.h3?.color ?? colors.text;
  const h1Weight = (overrides?.h1?.fontWeight ?? 'bold') as 'bold';
  const h2Weight = (overrides?.h2?.fontWeight ?? 'bold') as 'bold';
  const h3Weight = (overrides?.h3?.fontWeight ?? '600') as '600';
  const codeBg = overrides?.codeBlock?.background ?? (isDark ? '#2c2c2e' : '#f5f5f5');
  // Note: react-native-marked's `code` style is ViewStyle-only, so the
  // codeBlock.text override does not apply to markdown fenced blocks.
  // It still applies in NeorgRenderer where we render the text node
  // directly. Markdown code text inherits the body color.
  const inlineBg = overrides?.inlineCode?.background ?? (isDark ? '#2c2c2e' : '#f0f0f0');
  const inlineText = overrides?.inlineCode?.text ?? colors.text;
  const linkColor = overrides?.link?.color ?? colors.primary;
  const quoteBar = overrides?.blockquote?.bar ?? colors.primary;
  const quoteText = overrides?.blockquote?.text ?? colors.text;
  const dividerColor = overrides?.divider?.color ?? colors.border;

  return {
    text: { fontSize: 16, lineHeight: 26, color: bodyColor },
    h1: { fontSize: 28, lineHeight: 38, fontWeight: h1Weight, marginBottom: 12, marginTop: 8, color: h1Color },
    h2: { fontSize: 22, lineHeight: 32, fontWeight: h2Weight, marginBottom: 10, marginTop: 8, color: h2Color },
    h3: { fontSize: 18, lineHeight: 26, fontWeight: h3Weight, marginBottom: 8, marginTop: 6, color: h3Color },
    paragraph: { marginTop: 0, marginBottom: 12 },
    codespan: {
      backgroundColor: inlineBg,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 14,
      color: inlineText,
    },
    code: {
      backgroundColor: codeBg,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: quoteBar + '15',
      borderLeftWidth: 4,
      borderLeftColor: quoteBar,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    link: { color: linkColor },
    li: { marginBottom: 4, color: bodyColor },
    list: { marginBottom: 12 },
    hr: { backgroundColor: dividerColor, height: 1, marginVertical: 16 },
    strong: { color: bodyColor },
    strikethrough: { color: colors.textSecondary, textDecorationLine: 'line-through' },
    em: { color: quoteText },
    _tokens: {
      table: overrides?.table,
      math: overrides?.math,
      frontmatter: overrides?.frontmatter,
      checkbox: overrides?.checkbox,
      imageCaption: overrides?.imageCaption,
      wikiLink: overrides?.wikiLink,
      syntaxHighlight: overrides?.syntaxHighlight,
    },
  };
}
