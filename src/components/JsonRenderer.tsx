import React, { ReactNode, useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';

import { useTheme } from '../contexts/ThemeContext';

interface JsonRendererProps {
  content: string;
}

const KEY_LINE_RE = /^(\s*)"((?:\\.|[^"\\])+)":\s*(.*)$/;
const VALUE_TOKEN_RE = /"((?:\\.|[^"\\])*)"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b|true|false|null/g;

function renderValueTokens(segment: string, valueColor: string, scalarColor: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  VALUE_TOKEN_RE.lastIndex = 0;

  for (;;) {
    const match = VALUE_TOKEN_RE.exec(segment);
    if (!match) break;

    if (match.index > lastIndex) {
      nodes.push(segment.slice(lastIndex, match.index));
    }

    const token = match[0];
    const isString = token.startsWith('"');
    nodes.push(
      <Text key={`${match.index}-${token}`} style={{ color: isString ? valueColor : scalarColor }}>
        {token}
      </Text>
    );

    lastIndex = match.index + token.length;
  }

  if (lastIndex < segment.length) {
    nodes.push(segment.slice(lastIndex));
  }

  VALUE_TOKEN_RE.lastIndex = 0;
  return nodes;
}

function renderLine(line: string, colors: { text: string; textSecondary: string; primary: string }): ReactNode[] {
  const keyMatch = line.match(KEY_LINE_RE);
  if (!keyMatch) {
    return renderValueTokens(line, colors.text, colors.primary);
  }

  const [, indent, key, rest] = keyMatch;
  return [
    indent,
    <Text key={key} style={{ color: colors.textSecondary }}>
      {`"${key}"`}
    </Text>,
    ': ',
    ...renderValueTokens(rest, colors.text, colors.primary),
  ];
}

export function JsonRenderer({ content }: JsonRendererProps) {
  const { colors } = useTheme();

  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch (error) {
      console.warn('[JsonRenderer] JSON.parse failed:', error);
      return null;
    }
  }, [content]);

  if (!formatted) {
    return (
      <Text selectable style={[styles.raw, { color: colors.text }]}>
        {content}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {formatted.split('\n').map((line, index) => (
        <Text key={`${index}-${line}`} selectable style={[styles.line, { color: colors.text }]}>
          {renderLine(line, colors)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  line: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Menlo',
  },
  raw: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Menlo',
  },
});

export default JsonRenderer;
