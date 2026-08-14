import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../contexts/ThemeContext';
import { GitHubService } from '../../services/GitHubService';
import { HapticService } from '../../utils/haptics';
import { GitSyncGate } from '../../services/git/GitSyncGate';
import {
  gitOperationRegistry,
  useGitOperationStore,
  isPathLocked,
  hasActivePull,
} from '../../stores/gitOperationStore';
import type { GitOp } from '../../stores/gitOperationStore';
import { useNoteStore } from '../../stores/noteStore';
import ContextMenu from '../ContextMenu';
import { GroupRow } from '../ui';
import {
  deleteDirectoryModeAware,
  fetchChildren,
  formatBytes,
  getFileIcon,
  moveDirectory,
  TreeItemProps,
} from './repoTreeShared';
import { RepoTreeMoveDialog } from './RepoTreeMoveDialog';
import { RepoTreeRenameDialog } from './RepoTreeRenameDialog';
import { treeStyles } from './repoTreeStyles';

const DIVERGENCE_HINT =
  ' This usually means the branch has diverged from the remote — open the merge banner to resolve it.';

function normalizeBranch(branch: string | undefined): string {
  return branch || 'main';
}

function isActiveStatus(status: GitOp['status']): boolean {
  return status === 'queued' || status === 'running';
}

/** Appends the conflict-banner/merge hint when the error smells like a divergence. */
function divergenceHintFor(message: string): string {
  return /diverged|non-fast-forward|push rejected/i.test(message) ? DIVERGENCE_HINT : '';
}

/**
 * Single user-facing failure report for tree mutations: fails the registry
 * op (drives the row's failed state + Retry) and surfaces the immediate
 * alert. Isolated here so all mutation error paths share one funnel.
 */
function announceMutationFailure(opId: string | null, title: string, message: string): void {
  if (opId) gitOperationRegistry.fail(opId, message);
  const hint = message.includes(DIVERGENCE_HINT) ? '' : divergenceHintFor(message);
  Alert.alert(title, message + hint);
}

function failedTitleFor(kind: GitOp['kind']): string {
  switch (kind) {
    case 'rename':
      return 'Rename Failed';
    case 'move':
      return 'Move Failed';
    default:
      return 'Delete Failed';
  }
}

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

  const ops = useGitOperationStore((s) => s.ops);
  const repoPath = `${owner}/${repo}`;
  const isDir = node.type === 'dir';

  /** opId -> re-runnable mutation (same op id, so Retry keeps one registry op). */
  const retryRunners = useRef<Map<string, () => Promise<void>>>(new Map());

  const rowLocked =
    isPathLocked(ops, repoPath, branch, node.path) || hasActivePull(ops, repoPath);

  const failedOp = useMemo(
    () =>
      Object.values(ops).find(
        (op) =>
          op.status === 'failed' &&
          op.repo === repoPath &&
          normalizeBranch(op.branch) === normalizeBranch(branch) &&
          op.path === node.path,
      ),
    [branch, node.path, ops, repoPath],
  );

  const ownOpActive = useMemo(
    () =>
      Object.values(ops).some(
        (op) =>
          isActiveStatus(op.status) &&
          op.repo === repoPath &&
          normalizeBranch(op.branch) === normalizeBranch(branch) &&
          op.path === node.path,
      ),
    [branch, node.path, ops, repoPath],
  );

  /** Begin a mutation op, retiring any stale failed op on this path first. */
  const beginMutation = useCallback(
    (kind: GitOp['kind']) => {
      const current = useGitOperationStore.getState().ops;
      for (const [id, op] of Object.entries(current)) {
        if (
          op.status === 'failed' &&
          op.repo === repoPath &&
          normalizeBranch(op.branch) === normalizeBranch(branch) &&
          op.path === node.path
        ) {
          useGitOperationStore.getState().succeed(id);
          retryRunners.current.delete(id);
        }
      }
      return gitOperationRegistry.begin({
        kind,
        repo: repoPath,
        branch,
        path: node.path,
        entityIds: [],
        status: 'running',
        attempts: 0,
      });
    },
    [branch, node.path, repoPath],
  );

  const handleRetry = useCallback(
    (op: GitOp) => {
      gitOperationRegistry.retry(op.id);
      const run = retryRunners.current.get(op.id);
      if (run) void run();
    },
    [],
  );

  const handleFailedOpPress = useCallback(() => {
    if (!failedOp) return;
    const message = failedOp.error ?? 'Operation failed';
    const hint = message.includes(DIVERGENCE_HINT) ? '' : divergenceHintFor(message);
    Alert.alert(failedTitleFor(failedOp.kind), message + hint, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retry', onPress: () => handleRetry(failedOp) },
    ]);
  }, [failedOp, handleRetry]);

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
        console.warn('[RepoTreeItem] handlePress failed:', error);
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

  const runRename = useCallback(
    async (opId: string, oldPath: string, newName: string) => {
      const pathParts = oldPath.split('/');
      pathParts[pathParts.length - 1] = newName;
      const newPath = pathParts.join('/');

      setIsOperating(true);
      GitSyncGate.markPushActive(repoPath, branch);
      try {
        if (isDir) {
          await moveDirectory(owner, repo, branch, oldPath, newPath);
        } else {
          const content = await GitHubService.getFileContent(owner, repo, oldPath, branch);
          if (content === null) {
            Alert.alert('Error', 'Could not read file content.');
            return;
          }
          const shaResult = await GitHubService.getFileSha(owner, repo, oldPath, branch);
          if (shaResult.kind === 'error') {
            announceMutationFailure(opId, 'Rename Failed', shaResult.message);
            return;
          }
          const sha = shaResult.kind === 'found' ? shaResult.sha : '';
          const moved = await GitHubService.moveFile(owner, repo, oldPath, newPath, content, `Rename: ${oldPath} → ${newPath}`, sha, branch || 'main');
          if (!moved) {
            Alert.alert('Error', 'Failed to rename file.');
            return;
          }
        }
        gitOperationRegistry.succeed(opId);
        retryRunners.current.delete(opId);
        HapticService.success();
        onRefresh?.();
      } catch (error) {
        announceMutationFailure(opId, 'Rename Failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        GitSyncGate.clearPushActive(repoPath, branch);
        setIsOperating(false);
      }
    },
    [branch, isDir, onRefresh, owner, repo, repoPath],
  );

  const handleRename = useCallback(
    (oldPath: string, newName: string) => {
      const opId = beginMutation('rename');
      retryRunners.current.set(opId, () => runRename(opId, oldPath, newName));
      void runRename(opId, oldPath, newName);
    },
    [beginMutation, runRename],
  );

  const handleChildDeleted = useCallback((path: string) => {
    setChildren((prev) => prev.filter((c) => c.path !== path));
  }, []);

  const runMove = useCallback(
    async (opId: string, oldPath: string, newPath: string) => {
      setIsOperating(true);
      GitSyncGate.markPushActive(repoPath, branch);
      try {
        if (isDir) {
          await moveDirectory(owner, repo, branch, oldPath, newPath);
        } else {
          const content = await GitHubService.getFileContent(owner, repo, oldPath, branch);
          if (content === null) {
            Alert.alert('Error', 'Could not read file content.');
            return;
          }
          const shaResult = await GitHubService.getFileSha(owner, repo, oldPath, branch);
          if (shaResult.kind === 'error') {
            announceMutationFailure(opId, 'Move Failed', shaResult.message);
            return;
          }
          const sha = shaResult.kind === 'found' ? shaResult.sha : '';
          const moved = await GitHubService.moveFile(owner, repo, oldPath, newPath, content, `Move: ${oldPath} → ${newPath}`, sha, branch || 'main');
          if (!moved) {
            Alert.alert('Error', 'Failed to move file.');
            return;
          }
        }
        gitOperationRegistry.succeed(opId);
        retryRunners.current.delete(opId);
        HapticService.success();
        onRefresh?.();
      } catch (error) {
        announceMutationFailure(opId, 'Move Failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        GitSyncGate.clearPushActive(repoPath, branch);
        setIsOperating(false);
      }
    },
    [branch, isDir, onRefresh, owner, repo, repoPath],
  );

  const handleMove = useCallback(
    (oldPath: string, newPath: string) => {
      const opId = beginMutation('move');
      retryRunners.current.set(opId, () => runMove(opId, oldPath, newPath));
      void runMove(opId, oldPath, newPath);
    },
    [beginMutation, runMove],
  );

  const runDelete = useCallback(
    async (opId: string) => {
      setIsOperating(true);
      GitSyncGate.markPushActive(repoPath, branch);
      try {
        if (isDir) {
          const result = await deleteDirectoryModeAware(owner, repo, branch, node.path);
          if (result.failed.length > 0) {
            const aggregate = `Deleted ${result.deleted.length}, failed ${result.failed.length}`;
            const divergent = result.failed.some((failure) => /diverged|non-fast-forward|push rejected/i.test(failure.error));
            announceMutationFailure(opId, 'Delete Failed', divergent ? aggregate + DIVERGENCE_HINT : aggregate);
            onRefresh?.();
            return;
          }
          // Children are removed strictly per the aggregate `deleted` list:
          // full success removes the folder row, partial failure keeps it.
          onChildDeleted?.(node.path);
        } else {
          const shaResult = await GitHubService.getFileSha(owner, repo, node.path, branch);
          if (shaResult.kind === 'error') {
            announceMutationFailure(opId, 'Delete Failed', shaResult.message);
            return;
          }
          if (shaResult.kind === 'found') {
            await GitHubService.deleteFile(owner, repo, node.path, `Delete: ${node.path}`, shaResult.sha, branch || 'main');
          }
          onChildDeleted?.(node.path);
          void useNoteStore.getState().dropByFilePaths(repoPath, [node.path]);
        }
        gitOperationRegistry.succeed(opId);
        retryRunners.current.delete(opId);
        HapticService.success();
        onRefresh?.();
      } catch (error) {
        announceMutationFailure(opId, 'Delete Failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        GitSyncGate.clearPushActive(repoPath, branch);
        setIsOperating(false);
      }
    },
    [branch, isDir, node.path, onChildDeleted, onRefresh, owner, repo, repoPath],
  );

  const handleDelete = useCallback(() => {
    Alert.alert('Delete', `Are you sure you want to delete "${node.name}"?${isDir ? ' This will delete all contents.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const opId = beginMutation('delete');
          retryRunners.current.set(opId, () => runDelete(opId));
          void runDelete(opId);
        },
      },
    ]);
  }, [beginMutation, isDir, node.name, runDelete]);

  const iconName = isDir ? (expanded ? 'folder-open' : 'folder') : getFileIcon(node.name);
  const iconColor = isDir ? '#FF9500' : colors.textSecondary;

  const trailing = (() => {
    if (isOperating || ownOpActive) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }
    if (failedOp) {
      return (
        <Pressable testID="repo-tree-item.button.failed" onPress={handleFailedOpPress} hitSlop={8}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
        </Pressable>
      );
    }
    if (!isDir) {
      return (
        <View style={treeStyles.fileMetaRow}>
          {node.size != null ? <Text style={[treeStyles.size, { color: colors.textSecondary }]}>{formatBytes(node.size)}</Text> : null}
          <Text style={[treeStyles.ext, { color: colors.textSecondary }]}>{node.name.split('.').pop()}</Text>
        </View>
      );
    }
    return null;
  })();

  return (
    <View>
      <View testID="repo-tree-item.row" style={rowLocked || isOperating ? { opacity: 0.45 } : undefined}>
        <View testID="repo-tree-item.button.toggle">
          <View testID="repo-tree-item.button.file-press">
            <GroupRow
              testID={isDir ? "repo-tree-item.button.toggle" : "repo-tree-item.button.file-press"}
          onPress={isDir ? handleToggle : handleFileOnlyPress}
          onLongPress={() => { HapticService.medium(); setShowContextMenu(true); }}
          disabled={rowLocked || isOperating}
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
          trailing={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{trailing}</View>}
        >
          <Text style={[treeStyles.name, { color: colors.text }]} numberOfLines={1}>{node.name}</Text>
        </GroupRow>
          </View>
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
