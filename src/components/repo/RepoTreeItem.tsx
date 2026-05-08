import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { GitHubService } from '../../services/GitHubService';
import { HapticService } from '../../utils/haptics';
import ContextMenu from '../ContextMenu';
import { GroupRow } from '../ui';
import { deleteDirectory, fetchChildren, formatBytes, getFileIcon, moveDirectory, TreeItemProps } from './repoTreeShared';
import { RepoTreeMoveDialog } from './RepoTreeMoveDialog';
import { RepoTreeRenameDialog } from './RepoTreeRenameDialog';
import { treeStyles } from './repoTreeStyles';

export function RepoTreeItem({ node, owner, repo, branch, level, onFilePress, onRefresh, onChildDeleted }: TreeItemProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeItemProps['node'][]>([]);
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
      } catch (error) {
        void error;
      } finally {
        setLoading(false);
      }
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, [branch, isDir, loaded, node.path, owner, repo]);

  const handleFileOnlyPress = useCallback(() => {
    if (isDir) return;
    HapticService.light();
    onFilePress?.(node);
  }, [isDir, node, onFilePress]);

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
          return;
        }
        const sha = await GitHubService.getFileShaOrNull(owner, repo, oldPath, branch);
        const moved = await GitHubService.moveFile(owner, repo, oldPath, newPath, content, `Rename: ${oldPath} → ${newPath}`, sha || '', branch || 'main');
        if (!moved) {
          Alert.alert('Error', 'Failed to rename file.');
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
  }, [branch, isDir, onRefresh, owner, repo]);

  const handleChildDeleted = useCallback((path: string) => {
    setChildren((prev) => prev.filter((c) => c.path !== path));
  }, []);

  const handleMove = useCallback(async (oldPath: string, newPath: string) => {
    setIsOperating(true);
    try {
      if (isDir) {
        await moveDirectory(owner, repo, branch, oldPath, newPath);
      } else {
        const content = await GitHubService.getFileContent(owner, repo, oldPath, branch);
        if (content === null) {
          Alert.alert('Error', 'Could not read file content.');
          return;
        }
        const sha = await GitHubService.getFileShaOrNull(owner, repo, oldPath, branch);
        const moved = await GitHubService.moveFile(owner, repo, oldPath, newPath, content, `Move: ${oldPath} → ${newPath}`, sha || '', branch || 'main');
        if (!moved) {
          Alert.alert('Error', 'Failed to move file.');
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
  }, [branch, isDir, onRefresh, owner, repo]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete', `Are you sure you want to delete "${node.name}"?${isDir ? ' This will delete all contents.' : ''}`, [
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
              const sha = await GitHubService.getFileShaOrNull(owner, repo, node.path, branch);
              if (sha) {
                await GitHubService.deleteFile(owner, repo, node.path, `Delete: ${node.path}`, sha, branch || 'main');
              }
            }
            HapticService.success();
            onChildDeleted?.(node.path);
            onRefresh?.();
          } catch (error) {
            Alert.alert('Delete Failed', error instanceof Error ? error.message : 'Unknown error');
          } finally {
            setIsOperating(false);
          }
        },
      },
    ]);
  }, [branch, isDir, node, onRefresh, onChildDeleted, owner, repo]);

  const iconName = isDir ? (expanded ? 'folder-open' : 'folder') : getFileIcon(node.name);
  const iconColor = isDir ? '#FF9500' : colors.textSecondary;

  return (
    <View>
      <View testID="repo-tree-item.button.toggle">
        <View testID="repo-tree-item.button.file-press">
          <GroupRow
            testID={isDir ? "repo-tree-item.button.toggle" : "repo-tree-item.button.file-press"}
        onPress={isDir ? handleToggle : handleFileOnlyPress}
        onLongPress={() => { HapticService.medium(); setShowContextMenu(true); }}
        disabled={isOperating}
        style={{ paddingLeft: 16 + level * 20 }}
        leading={
          <View style={treeStyles.leading}>
            {isDir ? (
              loading ? (
                <View style={treeStyles.chevronSlot}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                </View>
              ) : (
                <Pressable onPress={handleToggle} hitSlop={8} style={treeStyles.chevronSlot} accessibilityLabel={expanded ? 'Collapse' : 'Expand'}>
                  <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textSecondary} />
                </Pressable>
              )
            ) : (
              <View style={treeStyles.chevronSlot} />
            )}
            <Ionicons name={iconName} size={20} color={iconColor} />
          </View>
        }
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isOperating ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            {!isDir ? (
              <View style={treeStyles.fileMetaRow}>
                {node.size != null ? <Text style={[treeStyles.size, { color: colors.textSecondary }]}>{formatBytes(node.size)}</Text> : null}
                <Text style={[treeStyles.ext, { color: colors.textSecondary }]}>{node.name.split('.').pop()}</Text>
              </View>
            ) : null}
          </View>
        }
      >
        <Text style={[treeStyles.name, { color: colors.text }]} numberOfLines={1}>{node.name}</Text>
      </GroupRow>
        </View>
      </View>

      {expanded
        ? children.map((child) => (
            <RepoTreeItem
              key={child.path}
              node={child}
              owner={owner}
              repo={repo}
              branch={branch}
              level={level + 1}
              onFilePress={onFilePress}
              onRefresh={onRefresh}
              onChildDeleted={handleChildDeleted}
            />
          ))
        : null}

      <ContextMenu
        visible={showContextMenu}
        onClose={() => setShowContextMenu(false)}
        title={node.name}
        subtitle={node.path}
        headerIcon={isDir ? 'folder' : 'document'}
        sections={[
          {
            items: [
              ...(!isDir ? [{ icon: 'eye-outline' as const, label: 'View', onPress: () => onFilePress?.(node) }] : []),
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
                    ].filter(Boolean).join('\n'),
                  );
                },
              },
              { icon: 'create-outline' as const, label: 'Rename', onPress: () => setShowRename(true) },
              { icon: 'move-outline' as const, label: 'Move', onPress: () => setShowMove(true) },
            ],
          },
          {
            items: [{ icon: 'trash-outline' as const, label: 'Delete', destructive: true, onPress: handleDelete }],
          },
        ]}
      />

      <RepoTreeRenameDialog visible={showRename} node={node} onClose={() => setShowRename(false)} onRename={handleRename} />
      <RepoTreeMoveDialog visible={showMove} node={node} owner={owner} repo={repo} branch={branch} onClose={() => setShowMove(false)} onMove={handleMove} />
    </View>
  );
}
