import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { GitHubService, GitHubContent } from '../services/GitHubService';
import { HapticService } from '../utils/haptics';
import { Group, GroupRow, IconButton, Modal, Input, Button } from './ui';

interface RepoFileItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

interface RepoFileBrowserProps {
  owner: string;
  repo: string;
  branch?: string;
  onFilePress: (filePath: string) => void;
  onCreateNoteInFolder: (folderPath: string) => void;
}

import { parseRepoPath } from '../utils/gitPathParser';

async function deleteFolderRecursive(
  owner: string,
  repo: string,
  folderPath: string,
  branch: string,
): Promise<void> {
  const contents = await GitHubService.getRepoContents(owner, repo, folderPath, branch);
  for (const item of contents) {
    if (item.type === 'dir') {
      await deleteFolderRecursive(owner, repo, item.path, branch);
    } else if (item.type === 'file' && item.sha) {
      try {
        await GitHubService.deleteFile(owner, repo, item.path, `Delete ${item.path}`, item.sha, branch);
      } catch (deleteError) {
        console.warn('[RepoFileBrowser] folder cleanup failed:', deleteError);
      }
    }
  }
}

async function moveFolderRecursive(
  owner: string,
  repo: string,
  oldBase: string,
  newBase: string,
  branch: string,
): Promise<void> {
  const contents = await GitHubService.getRepoContents(owner, repo, oldBase, branch);
  for (const item of contents) {
    if (item.type === 'dir') {
      await moveFolderRecursive(owner, repo, item.path, item.path.replace(oldBase, newBase), branch);
    } else if (item.type === 'file') {
      const fileContent = await GitHubService.getFileContent(owner, repo, item.path, branch);
      if (fileContent === null) continue;
      const newPath = item.path.replace(oldBase, newBase);
      await GitHubService.createFile(owner, repo, newPath, fileContent, `Move ${item.path} to ${newPath}`, branch);
      const sha = await GitHubService.getFileShaOrNull(owner, repo, item.path, branch);
      if (sha) {
        try {
          await GitHubService.deleteFile(owner, repo, item.path, `Remove old ${item.path}`, sha, branch);
        } catch (cleanupError) {
          console.warn('[RepoFileBrowser] move cleanup failed:', cleanupError);
        }
      }
    }
  }
}

export default function RepoFileBrowser({
  owner,
  repo,
  branch,
  onFilePress,
  onCreateNoteInFolder,
}: RepoFileBrowserProps) {
  const { colors } = useTheme();
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<RepoFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [browseMode, setBrowseMode] = useState<'folder' | 'all'>('folder');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [folderToMove, setFolderToMove] = useState<RepoFileItem | null>(null);
  const [showMoveFolderDialog, setShowMoveFolderDialog] = useState(false);
  const [moveDialogPath, setMoveDialogPath] = useState('');
  const [moveDialogFolders, setMoveDialogFolders] = useState<RepoFileItem[]>([]);
  const [moveDialogLoading, setMoveDialogLoading] = useState(false);
  const [isMovingFolder, setIsMovingFolder] = useState(false);

  const pathParts = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  const loadContents = useCallback(async () => {
    setIsLoading(true);
    try {
      const noteExts = ['.md', '.markdown', '.norg', '.org', '.pdf'];

      if (browseMode === 'all') {
        const ref = branch || 'main';
        const tree = await GitHubService.getTreeRecursive(owner, repo, ref);
        const files: RepoFileItem[] = tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => entry.path)
          .filter((p) => {
            const lower = p.toLowerCase();
            const dot = lower.lastIndexOf('.');
            if (dot < 0) return false;
            return noteExts.includes(lower.slice(dot));
          })
          .filter((p) => !p.startsWith('notes/images/') && !p.includes('/.git/'))
          .map((p) => ({
            name: p.slice(p.lastIndexOf('/') + 1) || p,
            path: p,
            type: 'file' as const,
          }))
          .sort((a, b) => a.path.localeCompare(b.path));
        setItems(files);
        return;
      }

      const contents = await GitHubService.getRepoContents(owner, repo, currentPath, branch);
      const filtered = contents
        .filter((item: GitHubContent) => {
          if (item.name === '.gitkeep') return false;
          if (item.type !== 'file' && item.type !== 'dir') return false;
          if (item.type === 'file') {
            const ext = item.name.toLowerCase().slice(item.name.lastIndexOf('.'));
            return noteExts.includes(ext);
          }
          return true;
        })
        .map((item: GitHubContent) => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
        }))
        .sort((a: RepoFileItem, b: RepoFileItem) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setItems(filtered);
    } catch (error) { void error;
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [owner, repo, currentPath, branch, browseMode]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const navigateToFolder = useCallback((path: string) => {
    HapticService.light();
    setCurrentPath(path);
  }, []);

  const navigateUp = useCallback(() => {
    HapticService.light();
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  }, [currentPath]);

  const navigateToBreadcrumb = useCallback((index: number) => {
    HapticService.light();
    if (index < 0) {
      setCurrentPath('');
      return;
    }
    const parts = currentPath.split('/').filter(Boolean);
    setCurrentPath(parts.slice(0, index + 1).join('/'));
  }, [currentPath]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const folderPath = currentPath ? `${currentPath}/${name}` : name;
      const result = await GitHubService.createFolder(owner, repo, folderPath, branch || 'main');
      if (result) {
        HapticService.success();
        setShowNewFolderModal(false);
        setNewFolderName('');
        loadContents();
      } else {
        Alert.alert('Error', 'Failed to create folder on GitHub.');
      }
    } catch (error) { void error;
      Alert.alert('Error', 'Failed to create folder.');
    } finally {
      setIsCreating(false);
    }
  }, [newFolderName, currentPath, owner, repo, branch, loadContents]);

  const handleFolderLongPress = useCallback((item: RepoFileItem) => {
    HapticService.medium();
    Alert.alert(
      item.name,
      'Choose an action',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move Folder',
          onPress: () => {
            setFolderToMove(item);
            setShowMoveFolderDialog(true);
          },
        },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Folder',
              `Delete "${item.name}" and all its contents from GitHub?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteFolderRecursive(owner, repo, item.path, branch || 'main');
                      HapticService.success();
                      loadContents();
                    } catch (error) { void error;
                      Alert.alert('Error', 'Failed to delete folder.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [owner, repo, branch, loadContents]);

  const loadMoveDialogFolders = useCallback(async (path: string) => {
    setMoveDialogLoading(true);
    try {
      const contents = await GitHubService.getRepoContents(owner, repo, path, branch);
      const dirs = contents
        .filter((item: GitHubContent) => item.type === 'dir' && item.path !== folderToMove?.path)
        .map((item: GitHubContent) => ({ name: item.name, path: item.path, type: 'dir' as const }))
        .sort((a: RepoFileItem, b: RepoFileItem) => a.name.localeCompare(b.name));
      setMoveDialogFolders(dirs);
      setMoveDialogPath(path);
    } catch (error) { void error;
      setMoveDialogFolders([]);
    } finally {
      setMoveDialogLoading(false);
    }
  }, [owner, repo, branch, folderToMove]);

  useEffect(() => {
    if (showMoveFolderDialog) {
      loadMoveDialogFolders('');
    }
  }, [showMoveFolderDialog, loadMoveDialogFolders]);

  const handleMoveFolderConfirm = useCallback(async () => {
    if (!folderToMove) return;
    const newPath = moveDialogPath ? `${moveDialogPath}/${folderToMove.name}` : folderToMove.name;
    if (newPath === folderToMove.path) {
      Alert.alert('Same Location', 'This folder is already here.');
      return;
    }
    setIsMovingFolder(true);
    try {
      await moveFolderRecursive(owner, repo, folderToMove.path, newPath, branch || 'main');
      HapticService.success();
      setShowMoveFolderDialog(false);
      setFolderToMove(null);
      loadContents();
    } catch (error) { void error;
      Alert.alert('Error', 'Failed to move folder. Some files may have been moved.');
    } finally {
      setIsMovingFolder(false);
    }
  }, [folderToMove, moveDialogPath, owner, repo, branch, loadContents]);

  const moveDialogPathParts = useMemo(() => {
    if (!moveDialogPath) return [];
    return moveDialogPath.split('/').filter(Boolean);
  }, [moveDialogPath]);

  const navigateMoveDialogBreadcrumb = useCallback((index: number) => {
    HapticService.light();
    if (index < 0) {
      loadMoveDialogFolders('');
      return;
    }
    const parts = moveDialogPath.split('/').filter(Boolean);
    loadMoveDialogFolders(parts.slice(0, index + 1).join('/'));
  }, [moveDialogPath, loadMoveDialogFolders]);

  const renderItem = useCallback(({ item }: { item: RepoFileItem }) => {
    const isDir = item.type === 'dir';
    return (
      <GroupRow
        onPress={() => {
          if (isDir) {
            navigateToFolder(item.path);
          } else {
            HapticService.light();
            onFilePress(item.path);
          }
        }}
        onLongPress={isDir ? () => handleFolderLongPress(item) : undefined}
        leading={
          <Ionicons
            name={isDir ? 'folder' : 'document-text'}
            size={22}
            color={isDir ? '#FF9500' : colors.primary}
          />
        }
        trailing={isDir ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : undefined}
        style={fileStyles.itemRow}
      >
        <View>
          <Text style={[fileStyles.itemName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[fileStyles.itemPath, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.path}
          </Text>
        </View>
      </GroupRow>
    );
  }, [colors, navigateToFolder, onFilePress, handleFolderLongPress]);

  const renderBreadcrumb = useCallback(() => {
    if (browseMode === 'all') {
      return (
        <View style={fileStyles.breadcrumbContent}>
          <Text style={[fileStyles.crumb, { color: colors.primary }]}>{repo} · All notes</Text>
        </View>
      );
    }
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fileStyles.breadcrumb} contentContainerStyle={fileStyles.breadcrumbContent}>
        <Button variant="ghost" label={repo} onPress={() => navigateToBreadcrumb(-1)} textStyle={[fileStyles.crumb, { color: !currentPath ? colors.primary : colors.textSecondary }]} />
        {pathParts.map((part, i) => (
          <View key={`crumb-${part}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[fileStyles.crumbSep, { color: colors.textSecondary }]}> / </Text>
            <Button variant="ghost" label={part} onPress={() => navigateToBreadcrumb(i)} textStyle={[fileStyles.crumb, { color: i === pathParts.length - 1 ? colors.primary : colors.textSecondary }]} />
          </View>
        ))}
      </ScrollView>
    );
  }, [colors, repo, currentPath, pathParts, navigateToBreadcrumb, browseMode]);

  return (
    <View style={fileStyles.container}>
      <View style={[fileStyles.header, { borderBottomColor: colors.border }]}>
        {renderBreadcrumb()}
        <View style={fileStyles.headerActions}>
          {currentPath && browseMode === 'folder' ? (
            <IconButton size="sm" testID="repo-file-browser.icon-button.back" onPress={navigateUp} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
            </IconButton>
          ) : null}
          <IconButton
            size="sm"
            testID="repo-file-browser.icon-button.browse-mode"
            onPress={() => {
              HapticService.light();
              setBrowseMode((m) => (m === 'folder' ? 'all' : 'folder'));
              setCurrentPath('');
            }}
            accessibilityLabel="Toggle browse mode"
          >
            <Ionicons
              name={browseMode === 'all' ? 'list' : 'folder'}
              size={20}
              color={browseMode === 'all' ? colors.primary : colors.textSecondary}
            />
          </IconButton>
          <IconButton
            size="sm"
            testID="repo-file-browser.icon-button.create-note"
            onPress={() => { HapticService.light(); onCreateNoteInFolder(currentPath); }}
            accessibilityLabel="Create note"
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </IconButton>
          <IconButton
            size="sm"
            testID="repo-file-browser.icon-button.new-folder"
            onPress={() => { HapticService.light(); setShowNewFolderModal(true); }}
            accessibilityLabel="New folder"
          >
            <Ionicons name="folder-outline" size={20} color={colors.primary} />
          </IconButton>
          <IconButton size="sm" testID="repo-file-browser.icon-button.refresh" onPress={loadContents} accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={20} color={colors.textSecondary} />
          </IconButton>
        </View>
      </View>

      {isLoading ? (
        <View style={fileStyles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <Group style={{ flex: 1 }}>
          <FlatList
            data={items}
            keyExtractor={(item) => item.path}
            renderItem={renderItem}
            contentContainerStyle={items.length === 0 ? fileStyles.emptyList : fileStyles.listContent}
            ListEmptyComponent={
              <View style={fileStyles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
                <Text style={[fileStyles.emptyTitle, { color: colors.text }]}>Empty Folder</Text>
                <Text style={[fileStyles.emptySub, { color: colors.textSecondary }]}>
                  Create a note or folder to get started
                </Text>
              </View>
            }
          />
        </Group>
      )}

      <Modal visible={showNewFolderModal} onRequestClose={() => { setShowNewFolderModal(false); setNewFolderName(''); }}>
        <Text style={[fileStyles.modalTitle, { color: colors.text }]}>New Folder</Text>
        <Input
          value={newFolderName}
          onChangeText={setNewFolderName}
          placeholder="Folder name"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleCreateFolder}
        />
        <View style={fileStyles.modalButtons}>
          <Button variant="secondary" label="Cancel" onPress={() => { setShowNewFolderModal(false); setNewFolderName(''); }} />
          <Button variant="primary" label="Create" onPress={handleCreateFolder} disabled={!newFolderName.trim() || isCreating} />
        </View>
      </Modal>

      <Modal visible={showMoveFolderDialog} onRequestClose={() => setShowMoveFolderDialog(false)} fullWidth>
        <View style={[fileStyles.moveDialogHeader, { borderBottomColor: colors.border }]}>
          <Button variant="ghost" label="Cancel" onPress={() => { setShowMoveFolderDialog(false); setFolderToMove(null); }} />
          <Text style={[fileStyles.moveDialogTitle, { color: colors.text }]}>Move "{folderToMove?.name}"</Text>
          <Button variant="ghost" label="Move" onPress={handleMoveFolderConfirm} disabled={isMovingFolder} textStyle={{ fontWeight: '600' }} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fileStyles.breadcrumb} contentContainerStyle={fileStyles.breadcrumbContent}>
          <Button variant="ghost" label={repo} onPress={() => navigateMoveDialogBreadcrumb(-1)} textStyle={[fileStyles.crumb, { color: !moveDialogPath ? colors.primary : colors.textSecondary }]} />
          {moveDialogPathParts.map((part, i) => (
            <View key={`mc-${part}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[fileStyles.crumbSep, { color: colors.textSecondary }]}> / </Text>
              <Button variant="ghost" label={part} onPress={() => navigateMoveDialogBreadcrumb(i)} textStyle={[fileStyles.crumb, { color: i === moveDialogPathParts.length - 1 ? colors.primary : colors.textSecondary }]} />
            </View>
          ))}
        </ScrollView>

        <View style={[fileStyles.moveDestination, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Ionicons name="folder-open-outline" size={18} color={colors.primary} />
          <Text style={[fileStyles.moveDestText, { color: colors.primary }]}>
            Move to: {moveDialogPath || '(root)'}
          </Text>
        </View>

        {moveDialogLoading ? (
          <View style={fileStyles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={moveDialogFolders}
            keyExtractor={(item) => item.path}
            renderItem={({ item }) => (
              <GroupRow
                onPress={() => loadMoveDialogFolders(item.path)}
                leading={<Ionicons name="folder" size={22} color="#FF9500" />}
                trailing={<Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
              >
                <Text style={[fileStyles.itemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              </GroupRow>
            )}
            contentContainerStyle={moveDialogFolders.length === 0 ? fileStyles.emptyList : undefined}
            ListEmptyComponent={
              <View style={fileStyles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={40} color={colors.textSecondary} />
                <Text style={[fileStyles.emptySub, { color: colors.textSecondary }]}>No subfolders</Text>
              </View>
            }
          />
        )}
      </Modal>
    </View>
  );
}

const fileStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumb: {
    flex: 1,
  },
  breadcrumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumb: {
    fontSize: 14,
    fontWeight: '600',
  },
  crumbSep: {
    fontSize: 14,
  },
  itemRow: {},
  itemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemPath: {
    fontSize: 12,
    marginTop: 2,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  moveDialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  moveDialogTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  moveDestination: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  moveDestText: { fontSize: 14, fontWeight: '500' },
});

