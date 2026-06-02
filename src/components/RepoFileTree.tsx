import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui';
import { RepoTreeItem } from './repo/RepoTreeItem';
import { fetchChildren, TreeNode } from './repo/repoTreeShared';
import { treeStyles } from './repo/repoTreeStyles';

export type { TreeNode } from './repo/repoTreeShared';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RepoFileTreeProps {
  owner: string;
  repo: string;
  branch?: string;
  onFilePress?: (node: TreeNode) => void;
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
    } catch (error) {
      console.warn('[RepoFileTree] loadRoot failed:', error);
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
      <View style={[treeStyles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[treeStyles.loadingText, { color: colors.textSecondary }]}>
          Loading file tree…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[treeStyles.center]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={[treeStyles.emptyText, { color: colors.text }]}>Failed to load</Text>
        <Button variant="secondary" label="Retry" onPress={loadRoot} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (rootItems.length === 0) {
    return (
      <View style={[treeStyles.center]}>
        <Ionicons name="folder-open-outline" size={40} color={colors.textSecondary} />
        <Text style={[treeStyles.emptyText, { color: colors.text }]}>Empty Repository</Text>
        <Text style={[treeStyles.emptySub, { color: colors.textSecondary }]}>
          This repo has no files
        </Text>
      </View>
    );
  }

  return (
    <View testID="repo-file-tree-root" style={{ flex: 1 }}>
      {rootItems.map((item) => (
        <RepoTreeItem
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
