import { NoteFormat } from '../models/Note';
import type { MarkedStyles } from 'react-native-marked';

interface ColorPalette {
  text: string;
  textSecondary: string;
  primary: string;
  border: string;
  surface: string;
  background: string;
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

export function getMarkdownStyles(colors: ColorPalette, isDark: boolean): MarkedStyles {
  return {
    text: { fontSize: 16, lineHeight: 26, color: colors.text },
    h1: { fontSize: 28, lineHeight: 38, fontWeight: 'bold', marginBottom: 12, marginTop: 8, color: colors.text },
    h2: { fontSize: 22, lineHeight: 32, fontWeight: 'bold', marginBottom: 10, marginTop: 8, color: colors.text },
    h3: { fontSize: 18, lineHeight: 26, fontWeight: '600', marginBottom: 8, marginTop: 6, color: colors.text },
    paragraph: { marginTop: 0, marginBottom: 12 },
    codespan: {
      backgroundColor: isDark ? '#2c2c2e' : '#f0f0f0',
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 14,
      color: colors.text,
    },
    code: {
      backgroundColor: isDark ? '#2c2c2e' : '#f5f5f5',
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    blockquote: {
      backgroundColor: colors.primary + '15',
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    link: { color: colors.primary },
    li: { marginBottom: 4, color: colors.text },
    list: { marginBottom: 12 },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 16 },
    strong: { color: colors.text },
    em: { color: colors.text },
  };
}
