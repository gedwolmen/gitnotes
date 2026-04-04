import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GitRepository, GitBranch, GitCommit, GitService } from '../services/GitService';

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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Repository</Text>
            <TouchableOpacity onPress={() => setShowRepoModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
          ) : repositories.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No repositories found</Text>
              <Text style={styles.emptySubtext}>
                Connect a GitHub repository to link notes to your code
              </Text>
            </View>
          ) : (
            <FlatList
              data={repositories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => {
                    onRepoChange(item.path);
                    setShowRepoModal(false);
                  }}
                >
                  <Ionicons name="folder" size={20} color="#007AFF" />
                  <Text style={styles.listItemText}>{item.name}</Text>
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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Branch</Text>
            <TouchableOpacity onPress={() => setShowBranchModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
          ) : (
            <FlatList
              data={branches}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.listItem, item.isCurrent && styles.currentItem]}
                  onPress={() => {
                    onBranchChange(item.name);
                    setShowBranchModal(false);
                  }}
                >
                  <Ionicons
                    name={item.isCurrent ? 'checkmark-circle' : 'git-branch'}
                    size={20}
                    color={item.isCurrent ? '#34C759' : '#666'}
                  />
                  <Text style={styles.listItemText}>{item.name}</Text>
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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Commit</Text>
            <TouchableOpacity onPress={() => setShowCommitModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          {isLoading ? (
            <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
          ) : commits.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No commits found</Text>
            </View>
          ) : (
            <FlatList
              data={commits}
              keyExtractor={(item) => item.hash}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.commitItem}
                  onPress={() => {
                    onCommitChange(item.hash);
                    setShowCommitModal(false);
                  }}
                >
                  <Text style={styles.commitHash}>{item.shortHash}</Text>
                  <Text style={styles.commitMessage} numberOfLines={1}>
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
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setIsExpanded(!isExpanded)}>
        <View style={styles.headerLeft}>
          <Ionicons name="code-slash" size={18} color="#666" />
          <Text style={styles.headerText}>Git Context</Text>
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#666" />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          <TouchableOpacity style={styles.selector} onPress={handleRepoPress}>
            <Text style={styles.selectorLabel}>Repository</Text>
            <View style={styles.selectorValue}>
              <Text style={repo ? styles.valueText : styles.placeholderText}>
                {repo || 'Select repository'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#999" />
            </View>
          </TouchableOpacity>

          {repo && (
            <TouchableOpacity style={styles.selector} onPress={handleBranchPress}>
              <Text style={styles.selectorLabel}>Branch</Text>
              <View style={styles.selectorValue}>
                <Text style={branch ? styles.valueText : styles.placeholderText}>
                  {branch || 'Select branch'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#999" />
              </View>
            </TouchableOpacity>
          )}

          {repo && branch && (
            <TouchableOpacity style={styles.selector} onPress={handleCommitPress}>
              <Text style={styles.selectorLabel}>Commit</Text>
              <View style={styles.selectorValue}>
                <Text style={commit ? styles.valueText : styles.placeholderText}>
                  {commit ? commit.substring(0, 7) : 'Select commit (optional)'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#999" />
              </View>
            </TouchableOpacity>
          )}

          {(repo || branch || commit) && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClearAll}>
              <Ionicons name="trash-outline" size={16} color="#dc3545" />
              <Text style={styles.clearButtonText}>Clear Git Context</Text>
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
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fafafa',
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
    color: '#666',
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
    color: '#999',
    marginBottom: 4,
  },
  selectorValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  valueText: {
    fontSize: 15,
    color: '#333',
  },
  placeholderText: {
    fontSize: 15,
    color: '#999',
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
    color: '#dc3545',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
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
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  currentItem: {
    backgroundColor: '#f8f8f8',
  },
  listItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  commitItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  commitHash: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#007AFF',
    marginBottom: 4,
  },
  commitMessage: {
    fontSize: 15,
    color: '#333',
  },
});
