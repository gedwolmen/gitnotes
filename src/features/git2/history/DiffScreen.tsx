/**
 * DiffScreen — view file, line, or commit diffs from a Git2 repository.
 *
 * Modes:
 * - commit diff: shows all files changed in a commit
 * - file diff: shows diff for a specific file at a commit
 *
 * Uses Git2Client.diffFile and Git2Client.diffCommit for native git2-rs diff.
 *
 * Repository-aware deep links: gitnotes://repo/:repoId/diff/:commitOid
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Git2Client } from '../../../../modules/expo-git2-rs/src/index';
import type { DiffFileEntry, LogEntry } from '../../../../modules/expo-git2-rs/src/types';
import { useTheme } from '../../../contexts/ThemeContext';
import { SafeAreaView } from '../../../components/ui/SafeAreaView';
import { HapticService } from '../../../utils/haptics';

// ─── Navigation types ──────────────────────────────────────────────────────────

type DiffRouteProp = RouteProp<{
  Diff: { repoId: string; repoPath: string; branch: string; commitOid?: string; path?: string };
}, 'Diff'>;

type DiffStackParamList = {
  Diff: { repoId: string; repoPath: string; branch: string; commitOid?: string; path?: string };
  FileViewer: { repoId: string; repoPath: string; branch: string; path: string };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOid(oid: string): string {
  return oid.slice(0, 7);
}

function getDiffStatusIcon(status: string): { icon: string; color: string } {
  switch (status.toLowerCase()) {
    case 'added':
    case 'new':
      return { icon: 'add-circle-outline', color: '#22c55e' };
    case 'deleted':
    case 'removed':
      return { icon: 'remove-circle-outline', color: '#ef4444' };
    case 'modified':
    case 'changed':
      return { icon: 'pencil-outline', color: '#f59e0b' };
    case 'renamed':
      return { icon: 'git-rename-outline', color: '#8b5cf6' };
    default:
      return { icon: 'ellipse-outline', color: '#6b7280' };
  }
}

// ─── Diff line parsing ─────────────────────────────────────────────────────────
// Simple unified diff parser for display purposes.
// Handles: +, -, space prefixes for add/remove/context lines.

interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseDiffContent(content: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = content.split('\n');

  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    if (raw.startsWith('@@')) {
      // Parse hunk header
      lines.push({ type: 'header', content: raw });
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
    } else if (raw.startsWith('+')) {
      lines.push({ type: 'add', content: raw.slice(1), newLineNo: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'delete', content: raw.slice(1), oldLineNo: oldLine });
      oldLine++;
    } else if (raw.startsWith(' ') || raw === '') {
      lines.push({ type: 'context', content: raw.slice(1), oldLineNo: oldLine, newLineNo: newLine });
      oldLine++;
      newLine++;
    } else if (raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('---') || raw.startsWith('+++')) {
      // Git diff header lines — skip but could show collapsible
      lines.push({ type: 'header', content: raw });
    } else {
      // Fallback
      lines.push({ type: 'context', content: raw });
    }
  }

  return lines;
}

// ─── Components ───────────────────────────────────────────────────────────────

interface DiffFileItemProps {
  entry: DiffFileEntry;
  onPress: (entry: DiffFileEntry) => void;
  colors: { text: string; textSecondary: string; border: string; primary: string; surface: string };
}

function DiffFileItem({ entry, onPress, colors }: DiffFileItemProps) {
  const { icon, color } = getDiffStatusIcon(entry.status);

  return (
    <TouchableOpacity
      style={[styles.fileItem, { backgroundColor: colors.surface }]}
      onPress={() => {
        HapticService.light();
        onPress(entry);
      }}
      activeOpacity={0.7}
    >
      <Ionicons name={icon as any} size={18} color={color} style={styles.fileIcon} />
      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
        {entry.path}
      </Text>
      <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
        <Text style={[styles.statusText, { color }]}>{entry.status}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface DiffLineItemProps {
  line: DiffLine;
  colors: { add: string; delete: string; context: string; header: string };
}

function DiffLineItem({ line, colors }: DiffLineItemProps) {
  const bgColor = useMemo(() => {
    switch (line.type) {
      case 'add':
        return colors.add;
      case 'delete':
        return colors.delete;
      case 'header':
        return colors.header;
      default:
        return 'transparent';
    }
  }, [line.type, colors]);

  const textColor = useMemo(() => {
    switch (line.type) {
      case 'add':
        return '#166534';
      case 'delete':
        return '#991b1b';
      case 'header':
        return '#6b7280';
      default:
        return '#374151';
    }
  }, [line.type]);

  const prefix = useMemo(() => {
    switch (line.type) {
      case 'add':
        return '+';
      case 'delete':
        return '-';
      case 'header':
        return ' ';
      default:
        return ' ';
    }
  }, [line.type]);

  const lineNoStyle = useMemo(() => {
    if (line.type === 'header') return null;
    return {
      oldNo: line.oldLineNo ?? '',
      newNo: line.newLineNo ?? '',
    };
  }, [line]);

  return (
    <View style={[styles.diffLine, { backgroundColor: bgColor }]}>
      {lineNoStyle && (
        <View style={styles.lineNumbers}>
          <Text style={[styles.lineNo, { color: '#9ca3af' }]}>
            {lineNoStyle.oldNo || ''}
          </Text>
          <Text style={[styles.lineNo, { color: '#9ca3af' }]}>
            {lineNoStyle.newNo || ''}
          </Text>
        </View>
      )}
      <Text style={[styles.linePrefix, { color: textColor }]}>{prefix}</Text>
      <Text style={[styles.lineContent, { color: textColor }]}>{line.content}</Text>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export function DiffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<DiffStackParamList>>();
  const route = useRoute<DiffRouteProp>();
  const { repoId, repoPath, branch, commitOid, path: filePath } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [diffEntries, setDiffEntries] = useState<DiffFileEntry[] | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DiffFileEntry | null>(null);

  // Load diff data
  useEffect(() => {
    if (!repoPath) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setDiffEntries(null);
    setDiffLines(null);

    (async () => {
      try {
        if (filePath && commitOid) {
          // File diff: specific file at a commit
          const result = await Git2Client.diffFile(repoPath, commitOid, filePath);
          if (cancelled) return;
          const entry: DiffFileEntry = { path: filePath, status: 'modified', content: result.data.content };
          setDiffEntries([entry]);
          setSelectedFile(entry);
          setDiffLines(parseDiffContent(result.data.content));
        } else if (commitOid) {
          // Commit diff: all files in a commit
          const result = await Git2Client.diffCommit(repoPath, commitOid);
          if (cancelled) return;
          setDiffEntries(result.data);
          // Auto-select first file
          if (result.data.length > 0) {
            setSelectedFile(result.data[0]);
          }
        } else {
          setError('No commit or file specified');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load diff');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repoPath, commitOid, filePath]);

  // Load file diff when selected file changes
  useEffect(() => {
    if (!selectedFile || !repoPath || !commitOid) return;

    let cancelled = false;
    setDiffLines(null);

    (async () => {
      try {
        const result = await Git2Client.diffFile(repoPath, commitOid, selectedFile.path);
        if (cancelled) return;
        const parsed = parseDiffContent(result.data.content);
        setDiffLines(parsed);
      } catch {
        // Keep existing lines on error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, repoPath, commitOid]);

  const handleBack = useCallback(() => {
    HapticService.light();
    navigation.goBack();
  }, [navigation]);

  const handleFilePress = useCallback((entry: DiffFileEntry) => {
    setSelectedFile(entry);
  }, []);

  const handleViewFile = useCallback(() => {
    if (!selectedFile || !repoPath) return;
    navigation.navigate('FileViewer', { repoId, repoPath, branch, path: selectedFile.path });
  }, [selectedFile, navigation, repoId, repoPath, branch]);

  const diffColors = useMemo(
    () => ({
      add: '#dcfce7',
      delete: '#fee2e2',
      context: 'transparent',
      header: '#f3f4f6',
    }),
    [],
  );

  const renderDiffEntry = useCallback(
    ({ item }: { item: DiffFileEntry }) => (
      <DiffFileItem
        entry={item}
        onPress={handleFilePress}
        colors={colors}
      />
    ),
    [handleFilePress, colors],
  );

  const renderDiffLine = useCallback(
    ({ item, index }: { item: DiffLine; index: number }) => (
      <DiffLineItem line={item} colors={diffColors} key={index} />
    ),
    [diffColors],
  );

  const headerTitle = useMemo(() => {
    if (filePath) return filePath.split('/').pop() ?? filePath;
    if (commitOid) return `Commit ${formatOid(commitOid)}`;
    return 'Diff';
  }, [filePath, commitOid]);

  const headerSubtitle = useMemo(() => {
    const parts = [branch];
    if (commitOid) parts.push(formatOid(commitOid));
    return parts.join(' · ');
  }, [branch, commitOid]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {headerTitle}
          </Text>
          {headerSubtitle && (
            <Text style={[styles.headerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          )}
        </View>
        {selectedFile && (
          <TouchableOpacity onPress={handleViewFile} style={styles.viewFileButton}>
            <Ionicons name="document-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error ?? '#c00'} />
          <Text style={[styles.errorText, { color: colors.error ?? '#c00' }]}>{error}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading diff...
          </Text>
        </View>
      ) : (
        <View style={styles.diffContainer}>
          {/* File list (for commit diff with multiple files) */}
          {diffEntries && diffEntries.length > 1 && (
            <View style={styles.fileList}>
              <Text style={[styles.fileListHeader, { color: colors.textSecondary }]}>
                {diffEntries.length} file{diffEntries.length !== 1 ? 's' : ''} changed
              </Text>
              <FlatList
                data={diffEntries}
                keyExtractor={(item) => item.path}
                renderItem={renderDiffEntry}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
              />
            </View>
          )}

          {/* Diff lines */}
          {diffLines ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              horizontal
            >
              <FlatList
                data={diffLines}
                keyExtractor={(_, index) => String(index)}
                renderItem={renderDiffLine}
                style={{ minWidth: '100%' }}
              />
            </ScrollView>
          ) : diffEntries && diffEntries.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="checkmark-outline" size={48} color="#22c55e" />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No changes in this commit
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  viewFileButton: {
    padding: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  diffContainer: {
    flex: 1,
  },
  fileList: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 10,
  },
  fileListHeader: {
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  fileIcon: {
    marginRight: 0,
  },
  fileName: {
    fontSize: 13,
    maxWidth: 150,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  diffLine: {
    flexDirection: 'row',
    minHeight: 22,
    alignItems: 'flex-start',
  },
  lineNumbers: {
    flexDirection: 'row',
    width: 72,
    justifyContent: 'flex-end',
    gap: 4,
    paddingRight: 8,
  },
  lineNo: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minWidth: 28,
    textAlign: 'right',
  },
  linePrefix: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    width: 16,
    textAlign: 'center',
  },
  lineContent: {
    flex: 1,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 22,
    paddingRight: 16,
  },
});
