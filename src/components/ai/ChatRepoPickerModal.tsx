import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '../../contexts/ThemeContext';
import { useRepoStore } from '../../stores/repoStore';
import { useAIStore } from '../../stores/aiStore';
import SearchBar from '../SearchBar';
import { HapticService } from '../../utils/haptics';
import * as ChatStorageService from '../../services/ChatStorageService';
import { Modal, Button, Input, Surface } from '../ui';

interface ChatRepoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelected: () => void;
  onGoToSettings?: () => void;
}

export const ChatRepoPickerModal: React.FC<ChatRepoPickerModalProps> = ({
  visible,
  onClose,
  onSelected,
  onGoToSettings,
}) => {
  const { colors, spacing } = useTokens();
  const repositories = useRepoStore((state) => state.repositories);
  const setChatRepo = useAIStore((state) => state.setChatRepo);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [isInitializing, setIsInitializing] = useState(false);

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repositories;
    const query = searchQuery.toLowerCase();
    return repositories.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.path.toLowerCase().includes(query)
    );
  }, [repositories, searchQuery]);

  const handleSelectRepo = (path: string) => {
    setSelectedRepoPath(path);
    HapticService.selection();
  };

  const handleConfirm = async () => {
    if (!selectedRepoPath) return;

    const repo = repositories.find((r) => r.path === selectedRepoPath);
    if (!repo) return;

    const owner = repo.path.split('/')[0] || '';
    const name = repo.path.split('/')[1] || repo.name;

    setIsInitializing(true);
    try {
      await setChatRepo(owner, name, branch);
      await ChatStorageService.initializeChatStorage(owner, name, branch);
      HapticService.success();
      onSelected();
    } catch (error) {
      console.error('[ChatRepoPickerModal] Error initializing chat storage:', error);
      HapticService.error();
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} bottomSheet fullWidth>
      <View style={styles.modalHeader}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Chat Storage</Text>
        <TouchableOpacity onPress={onClose} disabled={isInitializing}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Select a GitHub repository to store your AI chat conversations.
        </Text>

        {repositories.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} style={{ marginBottom: spacing[4] }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No repositories found. Add a repository in Settings first.
            </Text>
            {onGoToSettings && (
              <Button
                variant="primary"
                onPress={onGoToSettings}
              >
                Go to Settings
              </Button>
            )}
          </View>
        ) : (
          <>
            <View style={styles.searchContainer}>
              <SearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search repositories..."
              />
            </View>

            <ScrollView style={styles.repoList} keyboardShouldPersistTaps="handled">
              {filteredRepos.map((repo) => {
                const isSelected = repo.path === selectedRepoPath;
                return (
                  <TouchableOpacity
                    key={repo.path}
                    onPress={() => handleSelectRepo(repo.path)}
                    style={{ marginBottom: spacing[2] }}
                  >
                    <Surface
                      elevation="flat"
                      inset={isSelected}
                      radius="md"
                      style={[
                        styles.repoItem,
                        isSelected && { borderColor: colors.primary, borderWidth: 1 },
                        !isSelected && { borderWidth: 1, borderColor: 'transparent' }
                      ]}
                    >
                      <View style={styles.repoInfo}>
                        <Text style={[styles.repoName, { color: colors.text }]}>
                          {repo.path.includes('/') ? repo.path : repo.name}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      )}
                    </Surface>
                  </TouchableOpacity>
                );
              })}
              {filteredRepos.length === 0 && (
                <Text style={[styles.noResults, { color: colors.textSecondary }]}>
                  No matching repositories
                </Text>
              )}
            </ScrollView>

            {selectedRepoPath && (
              <View style={styles.branchConfig}>
                <Text style={[styles.branchLabel, { color: colors.text }]}>Branch:</Text>
                <View style={{ flex: 1 }}>
                  <Input
                    value={branch}
                    onChangeText={setBranch}
                    placeholder="main"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          variant="primary"
          onPress={handleConfirm}
          disabled={!selectedRepoPath || isInitializing}
        >
          {isInitializing ? 'Initializing...' : 'Confirm Selection'}
        </Button>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    maxHeight: 500,
  },
  description: {
    fontSize: 15,
    marginBottom: 20,
    lineHeight: 22,
  },
  searchContainer: {
    marginBottom: 16,
  },
  repoList: {
    maxHeight: 300,
  },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  repoInfo: {
    flex: 1,
  },
  repoName: {
    fontSize: 16,
    fontWeight: '500',
  },
  branchConfig: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  branchLabel: {
    fontSize: 16,
    marginRight: 10,
    fontWeight: '500',
  },
  footer: {
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  noResults: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 15,
  },
});
