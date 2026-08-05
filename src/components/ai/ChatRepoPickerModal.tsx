import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '../../contexts/ThemeContext';
import { useRepoStore } from '../../stores/repoStore';
import { useAIStore } from '../../stores/aiStore';
import { GitService, GitBranch } from '../../services/GitService';
import { LastUsedRepoService } from '../../services/LastUsedRepoService';
import SearchBar from '../SearchBar';
import { HapticService } from '../../utils/haptics';
import * as ChatStorageService from '../../services/ChatStorageService';
import { Modal, Button, Surface } from '../ui';
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
  const insets = useSafeAreaInsets();
  const repositories = useRepoStore((state) => state.repositories);
  const setChatRepo = useAIStore((state) => state.setChatRepo);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Auto-select repo when modal opens: single repo → select it, multiple → last used
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      didAutoSelectRef.current = false;
      return;
    }
    if (didAutoSelectRef.current) return;
    if (repositories.length === 0) return;
    didAutoSelectRef.current = true;

    if (repositories.length === 1) {
      void handleSelectRepo(repositories[0].path);
      return;
    }

    void LastUsedRepoService.get().then((lastPath) => {
      if (!lastPath) return;
      const stillExists = repositories.some((r) => r.path === lastPath);
      if (stillExists) void handleSelectRepo(lastPath);
    });
  }, [visible, repositories]);

  const filteredRepos = useMemo(() => {
    if (!searchQuery.trim()) return repositories;
    const query = searchQuery.toLowerCase();
    return repositories.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.path.toLowerCase().includes(query)
    );
  }, [repositories, searchQuery]);

  const handleSelectRepo = async (path: string) => {
    setSelectedRepoPath(path);
    setInitError(null);
    setLoadingBranches(true);
    try {
      const fetchedBranches = await GitService.getBranches(path);
      setBranches(fetchedBranches);
      const currentBranch = fetchedBranches.find((b) => b.isCurrent);
      setBranch(currentBranch?.name || 'main');
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
    HapticService.selection();
  };

  const handleBranchSelect = (branchName: string) => {
    setBranch(branchName);
    setShowBranchPicker(false);
    setInitError(null);
    HapticService.selection();
  };

  const handleConfirm = async () => {
    if (!selectedRepoPath) return;

    const repo = repositories.find((r) => r.path === selectedRepoPath);
    if (!repo) return;

    const owner = repo.path.split('/')[0] || '';
    const name = repo.path.split('/')[1] || repo.name;

    setIsInitializing(true);
    setInitError(null);
    try {
      await setChatRepo(owner, name, branch);
      await ChatStorageService.initializeChatStorage(owner, name, branch);
      HapticService.success();
      onSelected();
    } catch (error) {
      console.error('[ChatRepoPickerModal] Error initializing chat storage:', error);
      HapticService.error();
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setInitError(
        `Couldn't write to ${repo.path}/chats/. ${detail}. Check network and repository write access, then tap Retry.`,
      );
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      bottomSheet
      contentStyle={{ height: '85%' }}
    >
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-border" style={{ borderBottomWidth: StyleSheet.hairlineWidth }}>
          <View className="w-8 items-end" />
          <Text className="flex-1 text-md font-semibold text-center text-text" numberOfLines={1}>
            Choose Chat storage
          </Text>
          <TouchableOpacity
            testID="chat-repo-picker.button.close"
            onPress={onClose}
            disabled={isInitializing}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-8 items-end"
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View className="flex-1 px-4 pt-4">
          <Text className="text-sm mb-4 text-text-secondary" style={{ lineHeight: 20 }}>
            Select a GitHub repository to store your AI chat conversations.
          </Text>

          {repositories.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons
                name="folder-open-outline"
                size={48}
                color={colors.textSecondary}
                style={{ marginBottom: spacing[4] }}
              />
              <Text className="text-md text-center mb-6 text-text-secondary">
                No repositories found. Add a repository in Settings first.
              </Text>
              {onGoToSettings && (
                <Button variant="primary" onPress={onGoToSettings}>
                  Go to Settings
                </Button>
              )}
            </View>
          ) : (
            <>
              <View className="mb-3">
                <SearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search repositories..."
                />
              </View>

              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredRepos.map((repo) => {
                  const isSelected = repo.path === selectedRepoPath;
                  return (
                    <TouchableOpacity
                      key={repo.path}
                      testID={`chat-repo-picker.button.select-repo`}
                      onPress={() => handleSelectRepo(repo.path)}
                      className="mb-2"
                    >
                      <Surface
                        elevation="flat"
                        inset={isSelected}
                        radius="md"
                        className="flex-row items-center justify-between p-3.5"
                        style={[
                          isSelected && { borderColor: colors.primary, borderWidth: 1 },
                          !isSelected && { borderWidth: 1, borderColor: 'transparent' },
                        ]}
                      >
                        <View className="flex-1 mr-2">
                          <Text
                            className="text-md font-medium text-text"
                            numberOfLines={1}
                          >
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
                  <Text className="text-center py-5 text-sm text-text-secondary">
                    No matching repositories
                  </Text>
                )}
              </ScrollView>

              {selectedRepoPath && (
                <View className="flex-row items-center mt-3 mb-1">
                  <Text className="text-md font-medium mr-2.5 text-text">Branch:</Text>
                  <TouchableOpacity
                    testID="chat-repo-picker.button.select-branch"
                    className="flex-1 flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border min-h-11"
                    onPress={() => setShowBranchPicker(true)}
                    disabled={loadingBranches}
                  >
                    {loadingBranches ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text className="text-md flex-1 text-text">{branch}</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        <View
          className="px-4 pt-3 pb-1 border-t border-border"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          {initError && (
            <View
              className="flex-row items-start gap-2 p-2.5 rounded-lg mb-2.5"
              style={{
                backgroundColor: colors.error + '1A',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.error,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text
                testID="chat-repo-picker.text.error"
                className="flex-1 text-sm text-error"
                style={{ lineHeight: 18 }}
              >
                {initError}
              </Text>
            </View>
          )}
          <Button
            testID="chat-repo-picker.button.confirm"
            variant="primary"
            onPress={handleConfirm}
            disabled={!selectedRepoPath || isInitializing}
          >
            {isInitializing
              ? 'Initializing...'
              : initError
                ? 'Retry'
                : 'Confirm Selection'}
          </Button>
        </View>
      </View>

      {/* Branch Picker Modal */}
      <Modal visible={showBranchPicker} onRequestClose={() => setShowBranchPicker(false)} bottomSheet contentStyle={{ height: '50%' }}>
        <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-border" style={{ borderBottomWidth: StyleSheet.hairlineWidth }}>
          <Text className="text-md font-semibold text-text">Select Branch</Text>
          <TouchableOpacity onPress={() => setShowBranchPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={branches}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.name === branch;
            return (
              <TouchableOpacity
                testID={`chat-repo-picker.button.branch-${item.name}`}
                className="flex-row items-center justify-between px-4 py-3.5 border-b border-border"
                style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
                onPress={() => handleBranchSelect(item.name)}
              >
                <View className="flex-row items-center gap-2.5 flex-1">
                  <Ionicons name="git-branch-outline" size={18} color={isSelected ? colors.primary : colors.textSecondary} />
                  <Text className="text-md text-text">{item.name}</Text>
                  {item.isCurrent && (
                    <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.primary + '20' }}>
                      <Text className="text-xs font-semibold text-primary">default</Text>
                    </View>
                  )}
                </View>
                {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
        />
      </Modal>
    </Modal>
  );
};
