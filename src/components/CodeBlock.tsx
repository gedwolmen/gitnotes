import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getThemeColors, tokenize } from '../utils/syntaxHighlight';

interface CodeBlockProps {
  code: string;
  language?: string;
  isDark: boolean;
}

const FEEDBACK_DURATION_MS = 2000;

export function CodeBlock({ code, language, isDark }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const themeColors = useMemo(() => getThemeColors(isDark), [isDark]);
  const tokens = useMemo(() => tokenize(code, language ?? ''), [code, language]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      timeoutRef.current = null;
    }, FEEDBACK_DURATION_MS);
  };

  return (
    <View style={[styles.container, isDark ? styles.containerDark : styles.containerLight]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {language ? (
            <Text style={[styles.languageLabel, { color: isDark ? '#cbd5e1' : '#475569' }]}>
              {language.toUpperCase()}
            </Text>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Copy" onPress={handleCopy} style={styles.copyButton}>
          <Text style={[styles.copyText, { color: isDark ? '#93c5fd' : '#2563eb' }]}>{copied ? 'Copied!' : 'Copy'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal style={styles.scrollView} contentContainerStyle={styles.scrollContent} testID="code-block-scroll-view">
        <Text selectable style={[styles.codeText, { color: themeColors.plain }]}>
          {tokens.map((token, index) => (
            <Text key={`${token.type}-${index}-${token.text}`} style={{ color: themeColors[token.type] }} testID="code-block-token">
              {token.text}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
}

export default CodeBlock;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  containerLight: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4f0',
  },
  containerDark: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flex: 1,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  copyButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  copyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollView: {
    maxWidth: '100%',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 20,
  },
});
