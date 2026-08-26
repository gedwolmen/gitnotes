/**
 * FileTreeScreen — repository file browser with staging support.
 *
 * Displays a hierarchical file tree with stage/unstage actions per file.
 * Tapping a file navigates to FileViewerScreen; tapping a directory expands/collapses it.
 *
 * Repository-aware deep links: gitnotes://repo/:repoId/file/:path
 *
 * GPL-3.0 derivative of GitSync.
 */

import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFileTreeStore, FileNode } from './fileTreeStore';
import { useTheme } from '../../../contexts/ThemeContext';
import { SafeAreaView } from '../../../components/ui/SafeAreaView';
import { HapticService } from '../../../utils/haptics';
import type { StatusEntry } from '../../../../modules/expo-git2-rs/src/types';

// ─── Navigation types ──────────────────────────────────────────────────────────

type FileTreeRouteProp = RouteProp<{ FileTree: { repoId: string; repoPath: string; branch: string } }, 'FileTree'>;

type FileTreeStackParamList = {
  FileTree: { repoId: string; repoPath: string; branch: string };
  FileViewer: { repoId: string; repoPath: string; branch: string; path: string };
  CommitHistory: { repoId: string; repoPath: string; branch: string };
  Diff: { repoId: string; repoPath: string; branch: string; commitOid?: string; path?: string };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico']);
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'ttf', 'otf', 'woff', 'woff2',
  'eot', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'dmg', 'exe', 'app',
  'a', 'o', 'so', 'dylib', 'class', 'pyc', 'parquet',
]);

function isImage(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

function isBinary(ext: string): boolean {
  return BINARY_EXTS.has(ext.toLowerCase());
}

function getFileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getStatusIcon(entry: StatusEntry | undefined): string {
  if (!entry) return 'document-outline';
  if (entry.isNew) return 'add-circle-outline';
  if (entry.isModified) return 'pencil-outline';
  if (entry.isDeleted) return 'trash-outline';
  if (entry.isRenamed) return 'git-rename-outline';
  return 'document-outline';
}

function getStatusColor(entry: StatusEntry | undefined, colors: { primary: string; error: string }): string {
  if (!entry) return colors.primary;
  if (entry.isNew) return '#22c55e';
  if (entry.isModified) return colors.primary;
  if (entry.isDeleted) return colors.error;
  return colors.primary;
}

// ─── Tree item component ───────────────────────────────────────────────────────

interface TreeItemProps {
  node: FileNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  statusEntry: StatusEntry | undefined;
  onToggle: (path: string) => void;
  onSelect: (node: FileNode) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  isStaged: boolean;
  colors: { text: string; textSecondary: string; border: string; primary: string; error: string; surface: string };
}

function TreeItem({
  node,
  depth,
  isExpanded,
  isSelected,
  statusEntry,
  onToggle,
  onSelect,
  onStage,
  onUnstage,
  isStaged,
  colors,
}: TreeItemProps) {
  const isDir = node.kind === 'tree';
  const ext = getFileExt(node.name);
  const isBinaryFile = !isDir && isBinary(ext);
  const statusColor = getStatusColor(statusEntry, colors);
  const statusIcon = getStatusIcon(statusEntry);

  const handlePress = () => {
    HapticService.light();
    if (isDir) {
      onToggle(node.path);
    } else {
      onSelect(node);
    }
  };

  const handleLongPress = () => {
    HapticService.medium();
    if (isDir || isBinaryFile) return;
    if (isStaged) {
      onUnstage(node.path);
    } else {
      onStage(node.path);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.treeItem,
        { paddingLeft: 16 + depth * 20, backgroundColor: isSelected ? colors.surface : 'transparent' },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {isDir ? (
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
          style={styles.chevron}
        />
      ) : (
        <View style={styles.chevron} />
      )}

      <Ionicons
        name={isDir ? 'folder-outline' : 'document-outline'}
        size={20}
        color={isDir ? '#f59e0b' : colors.textSecondary}
        style={styles.fileIcon}
      />

      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
        {node.name}
      </Text>

      {statusEntry && !isDir && (
        <View style={styles.statusBadge}>
          <Ionicons name={statusIcon as any} size={14} color={statusColor} />
        </View>
      )}

      {isStaged && !isDir && (
        <View style={[styles.stagedBadge, { backgroundColor: '#22c55e20' }]}>
          <Text style={[styles.stagedText, { color: '#22c55e' }]}>S</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function FileTreeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FileTreeStackParamList>>();
  const route = useRoute<FileTreeRouteProp>();
  const { repoId, repoPath, branch } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const rootNodes = useFileTreeStore((s) => s.rootNodes);
  const expandedPaths = useFileTreeStore((s) => s.expandedPaths);
  const selectedPath = useFileTreeStore((s) => s.selectedPath);
  const stagedPaths = useFileTreeStore((s) => s.stagedPaths);
  const statusEntries = useFileTreeStore((s) => s.statusEntries);
  const isLoadingTree = useFileTreeStore((s) => s.isLoadingTree);
  const isLoadingStatus = useFileTreeStore((s) => s.isLoadingStatus);
  const treeError = useFileTreeStore((s) => s.treeError);
  const toggleExpanded = useFileTreeStore((s) => s.toggleExpanded);
  const selectFile = useFileTreeStore((s) => s.selectFile);
  const stageFile = useFileTreeStore((s) => s.stageFile);
  const unstageFile = useFileTreeStore((s) => s.unstageFile);
  const refreshStatus = useFileTreeStore((s) => s.refreshStatus);
  const setRepo = useFileTreeStore((s) => s.setRepo);

  useEffect(() => {
    setRepo(repoPath, branch);
  }, [repoPath, branch, setRepo]);

  const flatData = React.useMemo(() => {
    const items: { node: FileNode; depth: number }[] = [];
    function traverse(nodes: FileNode[], depth: number) {
      for (const node of nodes) {
        items.push({ node, depth });
        if (node.kind === 'tree' && expandedPaths.has(node.path)) {
          traverse(node.children ?? [], depth + 1);
        }
      }
    }
    traverse(rootNodes, 0);
    return items;
  }, [rootNodes, expandedPaths]);

  const getStatusForPath = useCallback(
    (path: string) => statusEntries.find((e) => e.path === path),
    [statusEntries],
  );

  const handleSelectFile = useCallback(
    (node: FileNode) => {
      selectFile(node.path);
      navigation.navigate('FileViewer', { repoId, repoPath, branch, path: node.path });
    },
    [navigation, repoId, repoPath, branch, selectFile],
  );

  const handleToggle = useCallback(
    (path: string) => {
      toggleExpanded(path);
    },
    [toggleExpanded],
  );

  const handleStage = useCallback(
    (path: string) => {
      stageFile(path);
    },
    [stageFile],
  );

  const handleUnstage = useCallback(
    (path: string) => {
      unstageFile(path);
    },
    [unstageFile],
  );

  const handleHistory = useCallback(() => {
    navigation.navigate('CommitHistory', { repoId, repoPath, branch });
  }, [navigation, repoId, repoPath, branch]);

  const handleDiff = useCallback(() => {
    navigation.navigate('Diff', { repoId, repoPath, branch });
  }, [navigation, repoId, repoPath, branch]);

  const renderItem = useCallback(
    ({ item }: { item: { node: FileNode; depth: number } }) => {
      const { node, depth } = item;
      const isExpanded = expandedPaths.has(node.path);
      const isSelected = selectedPath === node.path;
      const statusEntry = getStatusForPath(node.path);
      const isStaged = stagedPaths.has(node.path);

      return (
        <TreeItem
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          isSelected={isSelected}
          statusEntry={statusEntry}
          onToggle={handleToggle}
          onSelect={handleSelectFile}
          onStage={handleStage}
          onUnstage={handleUnstage}
          isStaged={isStaged}
          colors={colors}
        />
      );
    },
    [expandedPaths, selectedPath, getStatusForPath, stagedPaths, handleToggle, handleSelectFile, handleStage, handleUnstage, colors],
  );

  if (treeError) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{treeError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {branch}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={handleHistory}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleDiff}>
            <Ionicons name="git-compare-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Staged banner */}
      {stagedPaths.size > 0 && (
        <TouchableOpacity
          style={[styles.stagedBanner, { backgroundColor: '#22c55e15', borderColor: '#22c55e40' }]}
          onPress={handleDiff}
        >
          <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          <Text style={styles.stagedBannerText}>
            {stagedPaths.size} file{stagedPaths.size > 1 ? 's' : ''} staged
          </Text>
        </TouchableOpacity>
      )}

      {/* File tree */}
      {isLoadingTree ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading repository...
          </Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item) => item.node.path}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingStatus}
              onRefresh={refreshStatus}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No files in repository
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 6,
  },
  stagedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stagedBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  treeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 16,
    minHeight: 44,
  },
  chevron: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  fileIcon: {
    marginRight: 8,
  },
  fileName: {
    fontSize: 15,
    flex: 1,
  },
  statusBadge: {
    marginLeft: 6,
  },
  stagedBadge: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },
});
