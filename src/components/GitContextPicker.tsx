import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GitRepository, GitBranch, GitCommit, GitService } from '../services/GitService';
import { useTheme } from '../contexts/ThemeContext';

interface GitContextPickerProps {
  repo?: string;
  branch?: string;
  commit?: string;
  onRepoChange: (repo: string | undefined) => void;
  onBranchChange: (branch: string | undefined) => void;
  onCommitChange: (commit: string | undefined) => void;
}

export default function GitContextPicker({
  repo,
  branch,
  commit,
  onRepoChange,
  onBranchChange,
  onCommitChange,
}: GitContextPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);

  const { colors, isDark } = useTheme();

  const loadRepositories = useCallback(async () => {
    setIsLoading(true);
    const repos = await GitService.getRepositories();
    setRepositories(repos);
    setIsLoading(false);
  }, []);

  const loadBranches = useCallback(async () => {
    if (!repo) return;
    setIsLoading(true);
    const branchList = await GitService.getBranches(repo);
    setBranches(branchList);
    setIsLoading(false);
  }, [repo]);

  const loadCommits = useCallback(async () => {
    if (!repo) return;
    setIsLoading(true);
    const commitList = await GitService.getCommits(repo, branch);
    setCommits(commitList);
    setIsLoading(false);
  }, [repo, branch]);

  const handleRepoPress = () => {
    loadRepositories();
    setShowRepoModal(true);
  };

  const handleBranchPress = () => {
    if (!repo) return;
    loadBranches();
    setShowBranchModal(true);
  };

  const handleCommitPress = () => {
    if (!repo) return;
    loadCommits();
    setShowCommitModal(true);
  };

  const handleClearAll = () => {
    onRepoChange(undefined);
    onBranchChange(undefined);
    onCommitChange(undefined);
  };

  const renderRepoModal = () => (
    <Modal visible={showRepoModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Repository</Text>
            <TouchableOpacity onPress={() => setShowRepoModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : repositories.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.text }]}>No repositories found</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Connect a GitHub repository to link notes to your code
              </Text>
            </View>
          ) : (
            <FlatList
              data={repositories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.listItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    onRepoChange(item.path);
                    setShowRepoModal(false);
                  }}
                >
                  <Ionicons name="folder" size={20} color={colors.primary} />
                  <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );

  const renderBranchModal = () => (
    <Modal visible={showBranchModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Branch</Text>
            <TouchableOpacity onPress={() => setShowBranchModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={branches}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.listItem,
                    { borderBottomColor: colors.border },
                    item.isCurrent && { backgroundColor: isDark ? '#2c2c2e' : '#f8f8f8' }
                  ]}
                  onPress={() => {
                    onBranchChange(item.name);
                    setShowBranchModal(false);
                  }}
                >
                  <Ionicons
                    name={item.isCurrent ? 'checkmark-circle' : 'git-branch'}
                    size={20}
                    color={item.isCurrent ? '#34C759' : colors.textSecondary}
                  />
                  <Text style={[styles.listItemText, { color: colors.text }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );

  const renderCommitModal = () => (
    <Modal visible={showCommitModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Commit</Text>
            <TouchableOpacity onPress={() => setShowCommitModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : commits.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.text }]}>No commits found</Text>
            </View>
          ) : (
            <FlatList
              data={commits}
              keyExtractor={(item) => item.hash}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.commitItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    onCommitChange(item.hash);
                    setShowCommitModal(false);
                  }}
                >
                  <Text style={[styles.commitHash, { color: colors.primary }]}>{item.shortHash}</Text>
                  <Text style={[styles.commitMessage, { color: colors.text }]} numberOfLines={1}>
                    {item.message}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: isDark ? colors.background : '#fafafa' }]}>
      <TouchableOpacity style={styles.header} onPress={() => setIsExpanded(!isExpanded)}>
        <View style={styles.headerLeft}>
          <Ionicons name="code-slash" size={18} color={colors.textSecondary} />
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>Git Context</Text>
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <TouchableOpacity style={styles.selector} onPress={handleRepoPress}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Repository</Text>
            <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={repo ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                {repo || 'Select repository'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          {repo && (
            <TouchableOpacity style={styles.selector} onPress={handleBranchPress}>
              <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Branch</Text>
              <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={branch ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                  {branch || 'Select branch'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          )}

          {repo && branch && (
            <TouchableOpacity style={styles.selector} onPress={handleCommitPress}>
              <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Commit</Text>
              <View style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={commit ? [styles.valueText, { color: colors.text }] : [styles.placeholderText, { color: colors.textSecondary }]}>
                  {commit ? commit.substring(0, 7) : 'Select commit (optional)'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          )}

          {(repo || branch || commit) && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear Git Context</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {renderRepoModal()}
      {renderBranchModal()}
      {renderCommitModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    marginLeft: 8,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selector: {
    marginBottom: 8,
  },
  selectorLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  selectorValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  valueText: {
    fontSize: 15,
  },
  placeholderText: {
    fontSize: 15,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  clearButtonText: {
    fontSize: 14,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    padding: 40,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  listItemText: {
    fontSize: 16,
    marginLeft: 12,
  },
  commitItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  commitHash: {
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  commitMessage: {
    fontSize: 15,
  },
});
