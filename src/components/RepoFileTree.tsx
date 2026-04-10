import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService, GitHubContent } from '../services/GitHubService';
import { HapticService } from '../utils/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
}

interface RepoFileTreeProps {
  owner: string;
  repo: string;
  branch?: string;
  onFilePress?: (filePath: string) => void;
}

interface TreeItemProps {
  node: TreeNode;
  owner: string;
  repo: string;
  branch?: string;
  level: number;
  onFilePress?: (filePath: string) => void;
  onRefresh?: () => void;
}

const FILE_ICON_MAP: Record<string, string> = {
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

function getFileIcon(name: string): string {
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
  const inputRef = useRef<TextInput>(null);

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.overlay}>
        <View style={[dialogStyles.card, { backgroundColor: colors.surface }]}>
          <Text style={[dialogStyles.title, { color: colors.text }]}>Rename</Text>
          <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>
            {node.name}
          </Text>
          <TextInput
            ref={inputRef}
            style={[dialogStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleRename}
          />
          <View style={dialogStyles.buttons}>
            <TouchableOpacity onPress={onClose} style={dialogStyles.button}>
              <Text style={[dialogStyles.buttonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRename}
              style={[dialogStyles.button, dialogStyles.primaryButton, { backgroundColor: colors.primary }]}
              disabled={!name.trim() || name.trim() === (node.type === 'file' ? node.name.replace(/\.[^.]+$/, '') : node.name)}
            >
              <Text style={[dialogStyles.buttonText, { color: '#fff' }]}>Rename</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  const inputRef = useRef<TextInput>(null);

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.overlay}>
        <View style={[dialogStyles.card, { backgroundColor: colors.surface }, { maxHeight: '80%' }]}>
          <Text style={[dialogStyles.title, { color: colors.text }]}>Move</Text>
          <Text style={[dialogStyles.subtitle, { color: colors.textSecondary }]}>
            {node.name}
          </Text>

          <Text style={[dialogStyles.label, { color: colors.textSecondary }]}>Destination folder</Text>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <ScrollView style={dialogStyles.folderList} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[
                  dialogStyles.folderItem,
                  { borderColor: colors.border },
                  selectedPath === '' && { backgroundColor: colors.primary + '15', borderColor: colors.primary },
                ]}
                onPress={() => { setSelectedPath(''); setCustomPath(''); }}
              >
                <Ionicons name="home-outline" size={16} color={selectedPath === '' ? colors.primary : colors.textSecondary} />
                <Text style={[dialogStyles.folderItemText, { color: selectedPath === '' ? colors.primary : colors.text }]}>
                  / (root)
                </Text>
              </TouchableOpacity>
              {folders.map(folder => (
                <TouchableOpacity
                  key={folder.path}
                  style={[
                    dialogStyles.folderItem,
                    { borderColor: colors.border },
                    selectedPath === folder.path && { backgroundColor: colors.primary + '15', borderColor: colors.primary },
                  ]}
                  onPress={() => { setSelectedPath(folder.path); setCustomPath(''); }}
                >
                  <Ionicons name="folder-outline" size={16} color={selectedPath === folder.path ? colors.primary : '#FF9500'} />
                  <Text style={[dialogStyles.folderItemText, { color: selectedPath === folder.path ? colors.primary : colors.text }]}>
                    {folder.path}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={[dialogStyles.label, { color: colors.textSecondary, marginTop: 8 }]}>Or type a path</Text>
          <TextInput
            ref={inputRef}
            style={[dialogStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            placeholder="e.g. notes/archive"
            placeholderTextColor={colors.textSecondary}
            value={customPath}
            onChangeText={(text) => { setCustomPath(text); if (text) setSelectedPath(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />

          <View style={dialogStyles.buttons}>
            <TouchableOpacity onPress={onClose} style={dialogStyles.button}>
              <Text style={[dialogStyles.buttonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMove}
              style={[dialogStyles.button, dialogStyles.primaryButton, { backgroundColor: colors.primary }]}
              disabled={!selectedPath && !customPath.trim()}
            >
              <Text style={[dialogStyles.buttonText, { color: '#fff' }]}>Move</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface ContextMenuProps {
  visible: boolean;
  node: TreeNode | null;
  onClose: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}

function ContextMenu({ visible, node, onClose, onRename, onMove, onDelete }: ContextMenuProps) {
  const { colors } = useTheme();

  if (!node) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={contextStyles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={[contextStyles.menu, { backgroundColor: colors.surface }]}>
          <View style={[contextStyles.menuHeader, { borderBottomColor: colors.border }]}>
            <Ionicons name={node.type === 'dir' ? 'folder' : 'document'} size={16} color={colors.textSecondary} />
            <Text style={[contextStyles.menuHeaderTitle, { color: colors.text }]} numberOfLines={1}>
              {node.name}
            </Text>
          </View>
          <TouchableOpacity style={contextStyles.menuItem} onPress={() => { onClose(); onRename(); }}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={[contextStyles.menuItemText, { color: colors.text }]}>Rename</Text>
          </TouchableOpacity>
          <TouchableOpacity style={contextStyles.menuItem} onPress={() => { onClose(); onMove(); }}>
            <Ionicons name="move-outline" size={20} color={colors.primary} />
            <Text style={[contextStyles.menuItemText, { color: colors.text }]}>Move</Text>
          </TouchableOpacity>
          <View style={[contextStyles.menuDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={contextStyles.menuItem} onPress={() => { onClose(); onDelete(); }}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={[contextStyles.menuItemText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
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
      onFilePress?.(node.path);
    }
  }, [isDir, onFilePress, node.path]);

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
      <TouchableOpacity
        style={[
          treeStyles.row,
          { paddingLeft: 16 + level * 20 },
        ]}
        onPress={isDir ? handleToggle : handleFilePress}
        onLongPress={handleLongPress}
        activeOpacity={0.6}
        disabled={isOperating}
      >
        <View style={treeStyles.chevronSlot}>
          {isDir ? (
            loading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} style={treeStyles.loader} />
            ) : (
              <Ionicons
                name={expanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
            )
          ) : (
            <View style={treeStyles.chevronPlaceholder} />
          )}
        </View>
        <Ionicons name={iconName as any} size={20} color={iconColor} style={treeStyles.icon} />
        <Text style={[treeStyles.name, { color: colors.text }]} numberOfLines={1}>
          {node.name}
        </Text>
        {isOperating && (
          <ActivityIndicator size="small" color={colors.primary} style={treeStyles.opIndicator} />
        )}
        {!isDir && (
          <Text style={[treeStyles.ext, { color: colors.textSecondary }]}>
            {node.name.split('.').pop()}
          </Text>
        )}
      </TouchableOpacity>

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
        node={node}
        onClose={() => setShowContextMenu(false)}
        onRename={() => setShowRename(true)}
        onMove={() => setShowMove(true)}
        onDelete={handleDelete}
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
        <TouchableOpacity onPress={loadRoot} style={[treeStyles.retryBtn, { borderColor: colors.border }]}>
          <Text style={[treeStyles.retryText, { color: colors.primary }]}>Retry</Text>
        </TouchableOpacity>
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
    <View style={treeStyles.container}>
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
    </View>
  );
}

const treeStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingRight: 16,
  },
  chevronSlot: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronPlaceholder: {
    width: 16,
  },
  loader: {
    transform: [{ scale: 0.7 }],
  },
  icon: {
    marginHorizontal: 8,
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
  opIndicator: {
    marginHorizontal: 4,
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
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
  },
  primaryButton: {
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  folderList: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginVertical: 2,
  },
  folderItemText: {
    fontSize: 14,
  },
});

const contextStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menu: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  menuHeaderTitle: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
  },
});
