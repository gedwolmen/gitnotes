import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService, GitHubContent } from '../services/GitHubService';
import { HapticService } from '../utils/haptics';
import ContextMenu from './ContextMenu';
import { Group, GroupRow, IconButton, Modal, Input, Button } from './ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
  size?: number;
}

interface RepoFileTreeProps {
  owner: string;
  repo: string;
  branch?: string;
  onFilePress?: (node: TreeNode) => void;
}

interface TreeItemProps {
  node: TreeNode;
  owner: string;
  repo: string;
  branch?: string;
  level: number;
  onFilePress?: (node: TreeNode) => void;
  onRefresh?: () => void;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

const FILE_ICON_MAP: Record<string, IoniconName> = {
  md: 'document-text',
  markdown: 'document-text',
  norg: 'document-text',
  org: 'document-text',
  pdf: 'document-text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  ts: 'code-slash',
  tsx: 'code-slash',
  js: 'code-slash',
  jsx: 'code-slash',
  json: 'settings',
  yaml: 'settings',
  yml: 'settings',
  toml: 'settings',
};

function getFileIcon(name: string): IoniconName {
  const ext = name.toLowerCase().split('.').pop() || '';
  return FILE_ICON_MAP[ext] || 'document';
}

async function fetchChildren(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<TreeNode[]> {
  const items = await GitHubService.getRepoContents(owner, repo, path, branch);
  return items
    .filter((item: GitHubContent) => item.type === 'dir' || item.type === 'file')
    .map((item: GitHubContent) => ({
      name: item.name,
      path: item.path,
      type: item.type as 'file' | 'dir',
      sha: item.sha,
      size: item.size,
    }))
    .sort((a: TreeNode, b: TreeNode) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

interface RenameDialogProps {
  visible: boolean;
  node: TreeNode | null;
  onClose: () => void;
  onRename: (oldPath: string, newName: string) => void;
}

function RenameDialog({ visible, node, onClose, onRename }: RenameDialogProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (visible && node) {
      const baseName = node.type === 'file' ? node.name.replace(/\.[^.]+$/, '') : node.name;
      setName(baseName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, node]);

  const handleRename = useCallback(() => {
    if (!node || !name.trim()) return;
    let newName = name.trim();
      if (node.type === 'file') {
        const ext = node.name.includes('.') ? '.' + node.name.split('.').pop() : '';
        if (ext && !newName.endsWith(ext)) {
          newName += ext;
        }
      }
    if (newName === node.name) {
      onClose();
      return;
    }
    onRename(node.path, newName);
    onClose();
  }, [node, name, onRename, onClose]);

  if (!node) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose}>
      <Text style={[dialogStyles.title, { color: colors.text }]}>Rename</Text>
      <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>
        {node.name}
      </Text>
      <Input
        ref={inputRef}
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={handleRename}
      />
      <View style={dialogStyles.buttons}>
        <Button variant="secondary" label="Cancel" onPress={onClose} />
        <Button
          variant="primary"
          label="Rename"
          onPress={handleRename}
          disabled={!name.trim() || name.trim() === (node.type === 'file' ? node.name.replace(/\.[^.]+$/, '') : node.name)}
        />
      </View>
    </Modal>
  );
}

interface MoveDialogProps {
  visible: boolean;
  node: TreeNode | null;
  owner: string;
  repo: string;
  branch?: string;
  onClose: () => void;
  onMove: (oldPath: string, newPath: string) => void;
}

function MoveDialog({ visible, node, owner, repo, branch, onClose, onMove }: MoveDialogProps) {
  const { colors } = useTheme();
  const [folders, setFolders] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (visible && node) {
      setSelectedPath('');
      setCustomPath('');
      setLoading(true);
      fetchChildren(owner, repo, '', branch)
        .then(items => setFolders(items.filter(i => i.type === 'dir')))
        .catch(() => setFolders([]))
        .finally(() => setLoading(false));
    }
  }, [visible, node, owner, repo, branch]);

  const handleMove = useCallback(() => {
    if (!node) return;
    const targetFolder = customPath.trim() || selectedPath;
    const newPath = targetFolder ? `${targetFolder}/${node.name}` : node.name;
    if (newPath === node.path) {
      onClose();
      return;
    }
    onMove(node.path, newPath);
    onClose();
  }, [node, selectedPath, customPath, onMove, onClose]);

  if (!node) return null;

  return (
    <Modal visible={visible} onRequestClose={onClose} contentStyle={{ maxHeight: '80%' }}>
      <Text style={[dialogStyles.title, { color: colors.text }]}>Move</Text>
      <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>
        {node.name}
      </Text>

      <Text style={[dialogStyles.label, { color: colors.textSecondary }]}>Destination folder</Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : (
        <ScrollView style={dialogStyles.folderList} keyboardShouldPersistTaps="handled">
          <GroupRow
            onPress={() => { setSelectedPath(''); setCustomPath(''); }}
            style={[
              selectedPath === '' && { backgroundColor: colors.primary + '15' },
            ]}
            leading={<Ionicons name="home-outline" size={16} color={selectedPath === '' ? colors.primary : colors.textSecondary} />}
          >
            <Text style={[dialogStyles.folderItemText, { color: selectedPath === '' ? colors.primary : colors.text }]}>
              / (root)
            </Text>
          </GroupRow>
          {folders.map(folder => (
            <GroupRow
              key={folder.path}
              onPress={() => { setSelectedPath(folder.path); setCustomPath(''); }}
              style={[
                selectedPath === folder.path && { backgroundColor: colors.primary + '15' },
              ]}
              leading={<Ionicons name="folder-outline" size={16} color={selectedPath === folder.path ? colors.primary : '#FF9500'} />}
            >
              <Text style={[dialogStyles.folderItemText, { color: selectedPath === folder.path ? colors.primary : colors.text }]}>
                {folder.path}
              </Text>
            </GroupRow>
          ))}
        </ScrollView>
      )}

      <Text style={[dialogStyles.label, { color: colors.textSecondary, marginTop: 8 }]}>Or type a path</Text>
      <Input
        ref={inputRef}
        value={customPath}
        onChangeText={(text) => { setCustomPath(text); if (text) setSelectedPath(''); }}
        placeholder="e.g. notes/archive"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />

      <View style={dialogStyles.buttons}>
        <Button variant="secondary" label="Cancel" onPress={onClose} />
        <Button
          variant="primary"
          label="Move"
          onPress={handleMove}
          disabled={!selectedPath && !customPath.trim()}
        />
      </View>
    </Modal>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function TreeItem({ node, owner, repo, branch, level, onFilePress, onRefresh }: TreeItemProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isOperating, setIsOperating] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showMove, setShowMove] = useState(false);

  const isDir = node.type === 'dir';

  const handleToggle = useCallback(async () => {
    if (!isDir) return;
    HapticService.light();

    if (!loaded) {
      setLoading(true);
      try {
        const kids = await fetchChildren(owner, repo, node.path, branch);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setChildren(kids);
        setLoaded(true);
        setExpanded(true);
      } catch {
      } finally {
        setLoading(false);
      }
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded((prev) => !prev);
    }
  }, [isDir, loaded, owner, repo, node.path, branch]);

  const handleFilePress = useCallback(() => {
    if (!isDir) {
      HapticService.light();
      onFilePress?.(node);
    }
  }, [isDir, onFilePress, node]);

  const handleLongPress = useCallback(() => {
    HapticService.medium();
    setShowContextMenu(true);
  }, []);

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/');

    setIsOperating(true);
    try {
      if (isDir) {
        await moveDirectory(owner, repo, branch, oldPath, newPath);
      } else {
        const content = await GitHubService.getFileContent(owner, repo, oldPath, branch);
        if (content === null) {
          Alert.alert('Error', 'Could not read file content.');
          setIsOperating(false);
          return;
        }
        const sha = await GitHubService.getFileSha(owner, repo, oldPath, branch);
        const moved = await GitHubService.moveFile(
          owner, repo, oldPath, newPath, content,
          `Rename: ${oldPath} → ${newPath}`,
          sha || '', branch || 'main',
        );
        if (!moved) {
          Alert.alert('Error', 'Failed to rename file.');
          setIsOperating(false);
          return;
        }
      }
      HapticService.success();
      onRefresh?.();
    } catch (error) {
      Alert.alert('Rename Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsOperating(false);
    }
  }, [owner, repo, branch, isDir, onRefresh]);

  const handleMove = useCallback(async (oldPath: string, newPath: string) => {
    setIsOperating(true);
    try {
      if (isDir) {
        await moveDirectory(owner, repo, branch, oldPath, newPath);
      } else {
        const content = await GitHubService.getFileContent(owner, repo, oldPath, branch);
        if (content === null) {
          Alert.alert('Error', 'Could not read file content.');
          setIsOperating(false);
          return;
        }
        const sha = await GitHubService.getFileSha(owner, repo, oldPath, branch);
        const moved = await GitHubService.moveFile(
          owner, repo, oldPath, newPath, content,
          `Move: ${oldPath} → ${newPath}`,
          sha || '', branch || 'main',
        );
        if (!moved) {
          Alert.alert('Error', 'Failed to move file.');
          setIsOperating(false);
          return;
        }
      }
      HapticService.success();
      onRefresh?.();
    } catch (error) {
      Alert.alert('Move Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsOperating(false);
    }
  }, [owner, repo, branch, isDir, onRefresh]);

  const handleDelete = useCallback(async () => {
    Alert.alert(
      'Delete',
      `Are you sure you want to delete "${node.name}"?${isDir ? ' This will delete all contents.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsOperating(true);
            try {
              if (isDir) {
                await deleteDirectory(owner, repo, branch, node.path);
              } else {
                const sha = await GitHubService.getFileSha(owner, repo, node.path, branch);
                if (sha) {
                  await GitHubService.deleteFile(
                    owner, repo, node.path,
                    `Delete: ${node.path}`, sha, branch || 'main',
                  );
                }
              }
              HapticService.success();
              onRefresh?.();
            } catch (error) {
              Alert.alert('Delete Failed', error instanceof Error ? error.message : 'Unknown error');
            } finally {
              setIsOperating(false);
            }
          },
        },
      ],
    );
  }, [owner, repo, branch, node, isDir, onRefresh]);

  const iconName = isDir
    ? expanded ? 'folder-open' : 'folder'
    : getFileIcon(node.name);

  const iconColor = isDir ? '#FF9500' : colors.textSecondary;

  return (
    <View>
      <GroupRow
        onPress={isDir ? handleToggle : handleFilePress}
        onLongPress={handleLongPress}
        disabled={isOperating}
        style={{ paddingLeft: 16 + level * 20 }}
        leading={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isDir ? (
              loading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} style={treeStyles.loader} />
              ) : (
                <IconButton size="sm" variant="ghost" onPress={handleToggle} accessibilityLabel={expanded ? 'Collapse' : 'Expand'}>
                  <Ionicons
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color={colors.textSecondary}
                  />
                </IconButton>
              )
            ) : (
              <View style={{ width: 36 }} />
            )}
            <Ionicons name={iconName} size={20} color={iconColor} />
          </View>
        }
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isOperating && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
            {!isDir && (
              <View style={treeStyles.fileMetaRow}>
                {node.size != null ? (
                  <Text style={[treeStyles.size, { color: colors.textSecondary }]}>
                    {formatBytes(node.size)}
                  </Text>
                ) : null}
                <Text style={[treeStyles.ext, { color: colors.textSecondary }]}>
                  {node.name.split('.').pop()}
                </Text>
              </View>
            )}
          </View>
        }
      >
        <Text style={[treeStyles.name, { color: colors.text }]} numberOfLines={1}>
          {node.name}
        </Text>
      </GroupRow>

      {expanded && children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          owner={owner}
          repo={repo}
          branch={branch}
          level={level + 1}
          onFilePress={onFilePress}
          onRefresh={onRefresh}
        />
      ))}

      <ContextMenu
        visible={showContextMenu}
        onClose={() => setShowContextMenu(false)}
        title={node.name}
        subtitle={node.path}
        headerIcon={isDir ? 'folder' : 'document'}
        sections={[
          {
            items: [
              ...(!isDir
                ? [
                    {
                      icon: 'eye-outline' as const,
                      label: 'View',
                      onPress: () => onFilePress?.(node),
                    },
                  ]
                : []),
              {
                icon: 'information-circle-outline' as const,
                label: 'Details',
                onPress: () => {
                  Alert.alert(
                    node.name,
                    [
                      `Type: ${node.type}`,
                      `Path: ${node.path}`,
                      !isDir ? `Size: ${formatBytes(node.size)}` : null,
                      node.sha ? `SHA: ${node.sha.slice(0, 10)}` : null,
                      `Branch: ${branch || 'main'}`,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  );
                },
              },
              {
                icon: 'create-outline' as const,
                label: 'Rename',
                onPress: () => setShowRename(true),
              },
              {
                icon: 'move-outline' as const,
                label: 'Move',
                onPress: () => setShowMove(true),
              },
            ],
          },
          {
            items: [
              {
                icon: 'trash-outline' as const,
                label: 'Delete',
                destructive: true,
                onPress: handleDelete,
              },
            ],
          },
        ]}
      />

      <RenameDialog
        visible={showRename}
        node={node}
        onClose={() => setShowRename(false)}
        onRename={handleRename}
      />

      <MoveDialog
        visible={showMove}
        node={node}
        owner={owner}
        repo={repo}
        branch={branch}
        onClose={() => setShowMove(false)}
        onMove={handleMove}
      />
    </View>
  );
}

async function moveDirectory(
  owner: string,
  repo: string,
  branch: string | undefined,
  oldDirPath: string,
  newDirPath: string,
): Promise<void> {
  const targetBranch = branch || 'main';
  const items = await fetchChildren(owner, repo, oldDirPath, branch);

  for (const item of items) {
    const relativePath = item.path.substring(oldDirPath.length + 1);
    const newPath = `${newDirPath}/${relativePath}`;

    if (item.type === 'dir') {
      await moveDirectory(owner, repo, branch, item.path, newPath);
    } else {
      const content = await GitHubService.getFileContent(owner, repo, item.path, branch);
      if (content === null) continue;
      const sha = await GitHubService.getFileSha(owner, repo, item.path, branch);
      await GitHubService.moveFile(
        owner, repo, item.path, newPath, content,
        `Move: ${item.path} → ${newPath}`,
        sha || '', targetBranch,
      );
    }
  }

  const oldSha = await GitHubService.getFileSha(owner, repo, oldDirPath, branch);
  if (oldSha) {
    const gitkeepPath = `${oldDirPath}/.gitkeep`;
    const gitkeepSha = await GitHubService.getFileSha(owner, repo, gitkeepPath, branch);
    if (gitkeepSha) {
      await GitHubService.deleteFile(owner, repo, gitkeepPath, `Clean up: ${gitkeepPath}`, gitkeepSha, targetBranch);
    }
  }
}

async function deleteDirectory(
  owner: string,
  repo: string,
  branch: string | undefined,
  dirPath: string,
): Promise<void> {
  const targetBranch = branch || 'main';
  const items = await fetchChildren(owner, repo, dirPath, branch);

  for (const item of items) {
    if (item.type === 'dir') {
      await deleteDirectory(owner, repo, branch, item.path);
    } else {
      const sha = await GitHubService.getFileSha(owner, repo, item.path, branch);
      if (sha) {
        await GitHubService.deleteFile(
          owner, repo, item.path,
          `Delete: ${item.path}`, sha, targetBranch,
        );
      }
    }
  }
}

export default function RepoFileTree({ owner, repo, branch, onFilePress }: RepoFileTreeProps) {
  const { colors } = useTheme();
  const [rootItems, setRootItems] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const items = await fetchChildren(owner, repo, '', branch);
      setRootItems(items);
    } catch {
      setError(true);
      setRootItems([]);
    } finally {
      setLoading(false);
    }
  }, [owner, repo, branch]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  if (loading) {
    return (
      <View style={treeStyles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[treeStyles.loadingText, { color: colors.textSecondary }]}>
          Loading file tree…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={treeStyles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={[treeStyles.emptyText, { color: colors.text }]}>Failed to load</Text>
        <Button variant="secondary" label="Retry" onPress={loadRoot} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (rootItems.length === 0) {
    return (
      <View style={treeStyles.center}>
        <Ionicons name="folder-open-outline" size={40} color={colors.textSecondary} />
        <Text style={[treeStyles.emptyText, { color: colors.text }]}>Empty Repository</Text>
        <Text style={[treeStyles.emptySub, { color: colors.textSecondary }]}>
          This repo has no files
        </Text>
      </View>
    );
  }

  return (
    <Group style={{ flex: 1 }}>
      {rootItems.map((item) => (
        <TreeItem
          key={item.path}
          node={item}
          owner={owner}
          repo={repo}
          branch={branch}
          level={0}
          onFilePress={onFilePress}
          onRefresh={loadRoot}
        />
      ))}
    </Group>
  );
}

const treeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 16,
  },
  loader: {
    transform: [{ scale: 0.7 }],
  },
  name: {
    fontSize: 15,
    flex: 1,
  },
  ext: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  size: {
    fontSize: 11,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
  },
});

const dialogStyles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 4,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  folderList: {
    maxHeight: 200,
  },
  folderItemText: {
    fontSize: 14,
  },
});

