import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGitHubAuth } from '../contexts/GitHubAuthContext';
import { GitHubService, GitHubRepository, GitHubIssue, GitHubMilestone } from '../services/GitHubService';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { Note } from '../models/Note';

interface GitHubPickerProps {
  value?: Note['github'];
  onChange: (github: Note['github'] | undefined) => void;
}

export default function GitHubPicker({ value, onChange }: GitHubPickerProps) {
  const { isAuthenticated, user, login, isLoading: authLoading } = useGitHubAuth();
  const { colors } = useTheme();
  
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [milestones, setMilestones] = useState<GitHubMilestone[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLogin = async () => {
    HapticService.medium();
    const success = await login();
    if (!success) {
      HapticService.error();
      Alert.alert('Authentication Failed', 'Failed to authenticate with GitHub. Please try again.');
    } else {
      HapticService.success();
    }
  };

  const loadRepositories = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const repos = await GitHubService.getRepositories();
      setRepositories(repos);
    } catch (error) {
      console.error('Error loading repositories:', error);
      Alert.alert('Error', 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadIssues = useCallback(async (owner: string, repo: string) => {
    setLoading(true);
    try {
      const [issuesData, milestonesData] = await Promise.all([
        GitHubService.getIssues(owner, repo),
        GitHubService.getMilestones(owner, repo),
      ]);
      setIssues(issuesData);
      setMilestones(milestonesData);
    } catch (error) {
      console.error('Error loading issues:', error);
      Alert.alert('Error', 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && showRepoModal) {
      loadRepositories();
    }
  }, [isAuthenticated, showRepoModal, loadRepositories]);

  useEffect(() => {
    if (selectedRepo && showIssueModal) {
      loadIssues(selectedRepo.owner.login, selectedRepo.name);
    }
  }, [selectedRepo, showIssueModal, loadIssues]);

  const handleRepoSelect = (repo: GitHubRepository) => {
    HapticService.selection();
    setSelectedRepo(repo);
    setShowRepoModal(false);
    setShowIssueModal(true);
  };

  const handleIssueSelect = (issue: GitHubIssue | null) => {
    HapticService.selection();
    setShowIssueModal(false);
    if (issue && selectedRepo) {
      onChange({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        issueNumber: issue.number,
        htmlUrl: issue.html_url,
      });
    }
  };

  const handleMilestoneSelect = (milestone: GitHubMilestone | null) => {
    HapticService.selection();
    setShowMilestoneModal(false);
    if (milestone && selectedRepo) {
      onChange({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        milestoneNumber: milestone.number,
        htmlUrl: milestone.html_url,
      });
    }
  };

  const handleClear = () => {
    HapticService.light();
    onChange(undefined);
    setSelectedRepo(null);
  };

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={authLoading}>
          <Ionicons name="logo-github" size={20} color="#fff" />
          <Text style={styles.loginButtonText}>
            {authLoading ? 'Connecting...' : 'Connect to GitHub'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: isExpanded ? colors.surface : 'transparent' }]}>
      <TouchableOpacity style={styles.header} onPress={() => setIsExpanded(!isExpanded)}>
        <View style={styles.headerLeft}>
          <Ionicons name="logo-github" size={18} color={colors.textSecondary} />
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>GitHub Integration</Text>
          {isAuthenticated && user && (
            <Text style={[styles.userInfo, { color: colors.text }]}>@{user.login}</Text>
          )}
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.content}>
          {value ? (
            <View>
              <View style={[styles.selectedInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {value.issueNumber && (
                  <Text style={[styles.selectedText, { color: colors.text }]}>
                    Issue #{value.issueNumber} in {value.owner}/{value.repo}
                  </Text>
                )}
                {value.milestoneNumber && (
                  <Text style={[styles.selectedText, { color: colors.text }]}>
                    Milestone #{value.milestoneNumber} in {value.owner}/{value.repo}
                  </Text>
                )}
                {value.htmlUrl && (
                  <Text style={[styles.urlText, { color: colors.primary }]} numberOfLines={1}>
                    {value.htmlUrl}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                <Ionicons name="close-circle" size={16} color={colors.error} />
                <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear GitHub Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowRepoModal(true)}
              >
                <Ionicons name="list-outline" size={20} color="#fff" />
                <Text style={styles.optionButtonText}>Link to Issue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 }]}
                onPress={() => setShowMilestoneModal(true)}
              >
                <Ionicons name="flag-outline" size={20} color={colors.primary} />
                <Text style={[styles.optionButtonText, { color: colors.primary }]}>Link to Milestone</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Repository Modal */}
      <Modal visible={showRepoModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Repository</Text>
              <TouchableOpacity onPress={() => setShowRepoModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : repositories.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.text }]}>No repositories found</Text>
              </View>
            ) : (
              <FlatList
                data={repositories}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.repoItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleRepoSelect(item)}
                  >
                    <Ionicons name="git-branch" size={20} color={colors.primary} />
                    <View style={styles.repoInfo}>
                      <Text style={[styles.repoName, { color: colors.text }]}>{item.full_name}</Text>
                      {item.description && (
                        <Text style={[styles.repoDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Issue Modal */}
      <Modal visible={showIssueModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Issue</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <FlatList
                data={issues}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.issueItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleIssueSelect(item)}
                  >
                    <View style={styles.issueHeader}>
                      <Ionicons name="alert-circle" size={16} color={item.state === 'open' ? '#28a745' : '#cb2431'} />
                      <Text style={[styles.issueNumber, { color: colors.text }]}>#{item.number}</Text>
                    </View>
                    <Text style={[styles.issueTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Milestone Modal */}
      <Modal visible={showMilestoneModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Milestone</Text>
              <TouchableOpacity onPress={() => setShowMilestoneModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <FlatList
                data={milestones}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.milestoneItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleMilestoneSelect(item)}
                  >
                    <View style={styles.milestoneHeader}>
                      <Ionicons name="flag" size={16} color={colors.primary} />
                      <Text style={[styles.milestoneNumber, { color: colors.text }]}>#{item.number}</Text>
                    </View>
                    <Text style={[styles.milestoneTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.milestoneStats}>
                      <Text style={[styles.milestoneStat, { color: colors.textSecondary }]}>
                        {item.open_issues} open / {item.closed_issues} closed
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
    flex: 1,
  },
  headerText: {
    fontSize: 14,
    marginLeft: 8,
  },
  userInfo: {
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  selectedInfo: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  urlText: {
    fontSize: 12,
    marginTop: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    marginLeft: 4,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  optionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
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
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  repoInfo: {
    marginLeft: 12,
    flex: 1,
  },
  repoName: {
    fontSize: 16,
    fontWeight: '600',
  },
  repoDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  issueItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  issueNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  issueTitle: {
    fontSize: 15,
  },
  milestoneItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  milestoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  milestoneNumber: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  milestoneTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  milestoneStats: {
    marginTop: 4,
  },
  milestoneStat: {
    fontSize: 12,
  },
});