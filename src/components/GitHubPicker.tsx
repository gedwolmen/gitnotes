import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GitHubService, GitHubRepository, GitHubIssue, GitHubMilestone } from '../services/GitHubService';
import { useTheme } from '../contexts/ThemeContext';
import { HapticService } from '../utils/haptics';
import { Note } from '../models/Note';

interface GitHubPickerProps {
  value?: Note['github'];
  onChange: (github: Note['github'] | undefined) => void;
}

type LinkType = 'issue' | 'milestone' | null;

export default function GitHubPicker({ value, onChange }: GitHubPickerProps) {
  const { colors, isDark } = useTheme();

  const [isExpanded, setIsExpanded] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [milestones, setMilestones] = useState<GitHubMilestone[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [linkType, setLinkType] = useState<LinkType>(null);
  const [loading, setLoading] = useState(false);

  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);

  const loadRepositories = useCallback(async () => {
    setLoading(true);
    try {
      setRepositories(await GitHubService.getRepositories());
    } catch {
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadIssues = useCallback(async (owner: string, repo: string) => {
    setLoading(true);
    try {
      const [issuesData, milestonesData] = await Promise.all([
        GitHubService.getIssues(owner, repo),
        GitHubService.getMilestones(owner, repo),
      ]);
      setIssues(issuesData);
      setMilestones(milestonesData);
    } catch {
      setIssues([]);
      setMilestones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showRepoModal) loadRepositories();
  }, [showRepoModal, loadRepositories]);

  useEffect(() => {
    if (selectedRepo && (showIssueModal || showMilestoneModal)) {
      loadIssues(selectedRepo.owner.login, selectedRepo.name);
    }
  }, [selectedRepo, showIssueModal, showMilestoneModal, loadIssues]);

  const handleRepoSelect = (repo: GitHubRepository) => {
    HapticService.selection();
    setSelectedRepo(repo);
    setLinkType(null);
    onChange(undefined);
    setShowRepoModal(false);
  };

  const handleIssueSelect = (issue: GitHubIssue) => {
    HapticService.selection();
    setShowIssueModal(false);
    if (selectedRepo) {
      onChange({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        issueNumber: issue.number,
        htmlUrl: issue.html_url,
      });
    }
  };

  const handleMilestoneSelect = (milestone: GitHubMilestone) => {
    HapticService.selection();
    setShowMilestoneModal(false);
    if (selectedRepo) {
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
    setLinkType(null);
  };

  const handleLinkTypeSelect = (type: LinkType) => {
    HapticService.selection();
    setLinkType(type);
    onChange(undefined);
    if (type === 'issue') setShowIssueModal(true);
    else if (type === 'milestone') setShowMilestoneModal(true);
  };

  const linkTypeLabel = value?.issueNumber
    ? `Issue #${value.issueNumber}`
    : value?.milestoneNumber
    ? `Milestone #${value.milestoneNumber}`
    : null;

  const repoLabel = selectedRepo?.full_name ?? (value ? `${value.owner}/${value.repo}` : null);

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {/* Header toggle */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="logo-github" size={18} color={colors.textSecondary} />
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>GitHub</Text>
          {repoLabel && (
            <Text style={[styles.headerBadge, { color: colors.primary }]} numberOfLines={1}>
              {linkTypeLabel ? `${repoLabel} · ${linkTypeLabel}` : repoLabel}
            </Text>
          )}
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={[styles.content, { backgroundColor: isDark ? colors.background : '#fafafa' }]}>
          {/* Repository selector */}
          <View style={styles.selectorRow}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Repository</Text>
            <TouchableOpacity
              style={[styles.selectorValue, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowRepoModal(true)}
            >
              <Text
                style={repoLabel
                  ? [styles.valueText, { color: colors.text }]
                  : [styles.placeholderText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {repoLabel ?? 'Select repository'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Link type: Issue or Milestone */}
          {selectedRepo && (
            <View style={styles.selectorRow}>
              <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>Link to</Text>
              <View style={styles.linkTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.linkTypeButton,
                    { borderColor: colors.border },
                    (linkType === 'issue' || !!value?.issueNumber) ? { borderColor: colors.primary, backgroundColor: colors.primary + '15' } : undefined,
                  ]}
                  onPress={() => handleLinkTypeSelect('issue')}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={(linkType === 'issue' || value?.issueNumber) ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.linkTypeText,
                      { color: (linkType === 'issue' || value?.issueNumber) ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    Issue
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.linkTypeButton,
                    { borderColor: colors.border },
                    (linkType === 'milestone' || !!value?.milestoneNumber) ? { borderColor: colors.primary, backgroundColor: colors.primary + '15' } : undefined,
                  ]}
                  onPress={() => handleLinkTypeSelect('milestone')}
                >
                  <Ionicons
                    name="flag-outline"
                    size={16}
                    color={(linkType === 'milestone' || value?.milestoneNumber) ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.linkTypeText,
                      { color: (linkType === 'milestone' || value?.milestoneNumber) ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    Milestone
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Selected link display */}
          {value && linkTypeLabel && (
            <View style={styles.selectorRow}>
              <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>
                {value.issueNumber ? 'Issue' : 'Milestone'}
              </Text>
              <View style={styles.linkValueRow}>
                <TouchableOpacity
                  style={[styles.selectorValue, styles.linkValueFlex, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => value.issueNumber ? setShowIssueModal(true) : setShowMilestoneModal(true)}
                >
                  <Text style={[styles.valueText, { color: colors.text }]} numberOfLines={1}>
                    {linkTypeLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                {value.htmlUrl ? (
                  <TouchableOpacity
                    style={[styles.openButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => Linking.openURL(value.htmlUrl!)}
                  >
                    <Ionicons name="open-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}

          {/* Clear */}
          {(selectedRepo || value) && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Ionicons name="close-circle-outline" size={16} color={colors.error} />
              <Text style={[styles.clearText, { color: colors.error }]}>Clear GitHub Link</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Repo modal */}
      <Modal visible={showRepoModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Repository</Text>
              <TouchableOpacity onPress={() => setShowRepoModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : repositories.length === 0 ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No repositories found</Text>
              </View>
            ) : (
              <FlatList
                data={repositories}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleRepoSelect(item)}
                  >
                    <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                    <View style={styles.listItemInfo}>
                      <Text style={[styles.listItemTitle, { color: colors.text }]}>{item.full_name}</Text>
                      {item.description ? (
                        <Text style={[styles.listItemSub, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {item.private && (
                      <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Issue modal */}
      <Modal visible={showIssueModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Issue</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : issues.length === 0 ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No open issues found</Text>
              </View>
            ) : (
              <FlatList
                data={issues}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleIssueSelect(item)}
                  >
                    <Ionicons name="alert-circle" size={16} color="#28a745" />
                    <Text style={[styles.issueNumber, { color: colors.textSecondary }]}>#{item.number}</Text>
                    <Text style={[styles.issueTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Milestone modal */}
      <Modal visible={showMilestoneModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Milestone</Text>
              <TouchableOpacity onPress={() => setShowMilestoneModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : milestones.length === 0 ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No open milestones found</Text>
              </View>
            ) : (
              <FlatList
                data={milestones}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleMilestoneSelect(item)}
                  >
                    <Ionicons name="flag" size={16} color={colors.primary} />
                    <Text style={[styles.listItemTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.listItemSub, { color: colors.textSecondary }]}>
                      {item.open_issues} open
                    </Text>
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
    gap: 8,
  },
  headerText: {
    fontSize: 14,
  },
  headerBadge: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectorRow: {
    marginBottom: 10,
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
    flex: 1,
  },
  placeholderText: {
    fontSize: 15,
    flex: 1,
  },
  linkTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  linkTypeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
    marginTop: 2,
  },
  clearText: {
    fontSize: 14,
  },
  linkValueRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkValueFlex: {
    flex: 1,
  },
  openButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
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
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  listItemSub: {
    fontSize: 13,
    marginTop: 2,
  },
  issueNumber: {
    fontSize: 13,
    fontFamily: 'monospace',
    minWidth: 36,
  },
  issueTitle: {
    flex: 1,
    fontSize: 14,
  },
});
