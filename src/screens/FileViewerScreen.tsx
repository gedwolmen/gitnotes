import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MarkdownIt = require('markdown-it');

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService } from '../services/GitHubService';
import { NeorgContentParser } from '../services/NeorgContentParser';
import NeorgRenderer from '../components/NeorgRenderer';
import { HapticService } from '../utils/haptics';
import { getMarkdownStyles, stripTopMetadata } from '../utils/preview';

type Mode = 'markdown' | 'neorg' | 'org' | 'code' | 'plain';

const MARKDOWN_EXTS = ['md', 'markdown'];
const NEORG_EXTS = ['norg'];
const ORG_EXTS = ['org'];
const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs', 'php', 'scala', 'lua', 'sh', 'bash', 'zsh',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg',
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env',
  'sql', 'graphql', 'proto', 'dockerfile', 'makefile', 'gitignore',
]);

function detectMode(filename: string): Mode {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown';
  if (NEORG_EXTS.includes(ext)) return 'neorg';
  if (ORG_EXTS.includes(ext)) return 'org';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'plain';
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export default function FileViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'FileViewer'>>();
  const { owner, repo, branch, path, title, size } = route.params;
  const { colors, isDark } = useTheme();

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileName = useMemo(() => path.split('/').pop() ?? path, [path]);
  const mode: Mode = useMemo(() => detectMode(fileName), [fileName]);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    (async () => {
      const result = await GitHubService.getFileContent(owner, repo, path, branch);
      if (cancelled) return;
      if (result === null) {
        setError('Could not load file content from GitHub.');
        return;
      }
      setContent(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, path]);

  const renderContent = useMemo(() => {
    if (!content) return '';
    if (mode === 'markdown') return stripTopMetadata(content, 'markdown');
    if (mode === 'neorg') return stripTopMetadata(content, 'neorg');
    if (mode === 'org') return stripTopMetadata(content, 'org');
    return content;
  }, [content, mode]);

  const parsedNeorg = useMemo(() => {
    if (!renderContent) return null;
    if (mode !== 'neorg' && mode !== 'org') return null;
    const parsed = NeorgContentParser.parseContent(renderContent);
    return parsed.success && parsed.blocks ? parsed.blocks : null;
  }, [renderContent, mode]);

  const markdownStyles = useMemo(() => getMarkdownStyles(colors, isDark), [colors, isDark]);

  const markdownItInstance = useMemo(() => {
    const md = MarkdownIt({ typographer: true, linkify: true });
    // Allow only safe URL schemes. Reject javascript:, data:, vbscript:, etc.
    md.validateLink = (url: string) =>
      /^(https?:|mailto:|tel:|#)/i.test(url) ||
      !/^[a-z][a-z0-9+.-]*:/i.test(url);
    return md;
  }, []);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          onPress={() => { HapticService.light(); navigation.goBack(); }}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title || fileName}
          </Text>
          <Text style={[styles.metaLine, { color: colors.textSecondary }]} numberOfLines={1}>
            {[mode.toUpperCase(), formatBytes(size), branch ?? 'main'].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : content == null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          {mode === 'markdown' ? (
            <Markdown style={markdownStyles} markdownit={markdownItInstance}>{renderContent}</Markdown>
          ) : (mode === 'neorg' || mode === 'org') && parsedNeorg ? (
            <NeorgRenderer blocks={parsedNeorg} />
          ) : (
            <Text
              style={[
                mode === 'code' ? styles.codeText : styles.plainText,
                { color: colors.text },
              ]}
              selectable
            >
              {renderContent}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { padding: 8, width: 40 },
  headerTextContainer: { flex: 1, paddingHorizontal: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  metaLine: { fontSize: 11, marginTop: 2 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: { fontSize: 14, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  plainText: { fontSize: 14, lineHeight: 20 },
  codeText: { fontSize: 13, lineHeight: 18, fontFamily: 'Menlo' },
});
