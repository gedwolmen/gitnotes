import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../SearchBar';
import { settingsStyles as styles } from './settingsStyles';
import type { GitRepository } from '../../services/GitService';
import type { GitHubRepository } from '../../services/GitHubService';
import type { TemplateRepoPreference } from '../../services/TemplateRepoPreferenceService';

type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
};

type AuthState = { isAuthenticated: boolean };

type SettingsModalsProps = {
  colors: ThemeColors;
  authState: AuthState;
  repositories: GitRepository[];
  githubRepos: GitHubRepository[];
  templatesRepoPref: TemplateRepoPreference | null;
  showRepoPickerModal: boolean;
  showTemplatesRepoPicker: boolean;
  showTokenModal: boolean;
  repoSearchQuery: string;
  manualRepoInput: string;
  isAddingRepo: boolean;
  isLoadingGithubRepos: boolean;
  tokenInput: string;
  tokenVisible: boolean;
  tokenError: string | null;
  isVerifying: boolean;
  tokenModalMode: 'connect' | 'add';
  onCloseRepoPicker: () => void;
  onSetRepoSearchQuery: (value: string) => void;
  onSetManualRepoInput: (value: string) => void;
  onAddManualRepo: () => void;
  onSelectGithubRepo: (repo: GitHubRepository) => void;
  onCloseTemplatesRepoPicker: () => void;
  onPickTemplatesRepo: (repo: GitRepository) => void;
  onCloseTokenModal: () => void;
  onSetTokenInput: (value: string) => void;
  onToggleTokenVisible: () => void;
  onPasteToken: () => void;
  onCopyToken: () => void;
  onSaveToken: () => void;
};

export function SettingsModals(props: SettingsModalsProps) {
  const {
    colors,
    authState,
    repositories,
    githubRepos,
    templatesRepoPref,
    showRepoPickerModal,
    showTemplatesRepoPicker,
    showTokenModal,
    repoSearchQuery,
    manualRepoInput,
    isAddingRepo,
    isLoadingGithubRepos,
    tokenInput,
    tokenVisible,
    tokenError,
    isVerifying,
    tokenModalMode,
    onCloseRepoPicker,
    onSetRepoSearchQuery,
    onSetManualRepoInput,
    onAddManualRepo,
    onSelectGithubRepo,
    onCloseTemplatesRepoPicker,
    onPickTemplatesRepo,
    onCloseTokenModal,
    onSetTokenInput,
    onToggleTokenVisible,
    onPasteToken,
    onCopyToken,
    onSaveToken,
  } = props;

  const filteredRepos = repoSearchQuery
    ? githubRepos.filter(
        (repo) =>
          repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase())
          || repo.description?.toLowerCase().includes(repoSearchQuery.toLowerCase()),
      )
    : githubRepos;

  return (
    <>
      <Modal visible={showRepoPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Repository</Text>
              <TouchableOpacity onPress={onCloseRepoPicker}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
              <View style={[styles.manualRepoRow, { borderBottomColor: colors.border }]}>
                <TextInput
                  testID="settings-modals.input.manual-repo"
                  style={[styles.manualRepoInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="owner/repo"
                  placeholderTextColor={colors.textSecondary}
                  value={manualRepoInput}
                  onChangeText={onSetManualRepoInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={onAddManualRepo}
                />
                <TouchableOpacity
                  testID="settings-modals.button.add-manual-repo"
                  style={[
                    { backgroundColor: colors.primary },
                    (!manualRepoInput.trim() || isAddingRepo) && styles.disabledButton,
                  ]}
                  onPress={onAddManualRepo}
                  disabled={!manualRepoInput.trim() || isAddingRepo}
                >
                  {isAddingRepo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.manualAddBtnText}>Add</Text>}
                </TouchableOpacity>
              </View>

              {authState.isAuthenticated ? (
                <>
                  <View style={styles.repoSearchContainer}>
                    <SearchBar value={repoSearchQuery} onChangeText={onSetRepoSearchQuery} placeholder="Search repositories..." />
                  </View>
                  <Text style={[styles.pickerSectionLabel, { color: colors.textSecondary, borderBottomColor: colors.border }]}>Your GitHub Repositories</Text>
                  {isLoadingGithubRepos ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ padding: 32 }} />
                  ) : filteredRepos.length === 0 ? (
                    <Text style={[styles.pickerEmpty, { color: colors.textSecondary }]}>
                      {repoSearchQuery ? 'No matching repositories' : 'No repositories found'}
                    </Text>
                  ) : (
                    filteredRepos.map((repo) => {
                      const alreadyAdded = repositories.some((item) => item.path === repo.full_name);
                      return (
                        <TouchableOpacity
                          key={repo.id}
                          testID="settings-modals.button.select-github-repo"
                          style={[styles.pickerItem, { borderBottomColor: colors.border }, alreadyAdded && { opacity: 0.4 }]}
                          onPress={() => onSelectGithubRepo(repo)}
                          disabled={alreadyAdded}
                        >
                          <Ionicons name={repo.private ? 'lock-closed-outline' : 'git-branch-outline'} size={18} color={colors.primary} />
                          <View style={styles.pickerItemInfo}>
                            <Text style={[styles.pickerItemName, { color: colors.text }]}>{repo.full_name}</Text>
                            {repo.description ? (
                              <Text style={[styles.pickerItemDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                                {repo.description}
                              </Text>
                            ) : null}
                          </View>
                          {alreadyAdded ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showTemplatesRepoPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Templates repository</Text>
              <TouchableOpacity testID="settings-modals.button.close-templates-repo" onPress={onCloseTemplatesRepoPicker}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
              {repositories.length === 0 ? (
                <Text style={[styles.pickerEmpty, { color: colors.textSecondary }]}>
                  Add a repository first under Repositories to choose it as the templates repo.
                </Text>
              ) : (
                repositories.map((repo) => {
                  const selected = templatesRepoPref?.repoPath === repo.path;
                  return (
                    <TouchableOpacity
                      key={repo.id}
                      testID={`templates-repo-option-${repo.path}`}
                      style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                      onPress={() => onPickTemplatesRepo(repo)}
                    >
                      <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                      <View style={styles.pickerItemInfo}>
                        <Text style={[styles.pickerItemName, { color: colors.text }]} numberOfLines={1}>{repo.path}</Text>
                        <Text style={[styles.pickerItemDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                          Branch: {repo.branch || 'main'}
                        </Text>
                      </View>
                      {selected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showTokenModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {tokenModalMode === 'add' ? 'Add GitHub Account' : authState.isAuthenticated ? 'Change Token' : 'Connect GitHub'}
              </Text>
              <TouchableOpacity onPress={onCloseTokenModal}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>Fine-grained Personal Access Token with read/write access to your repositories.</Text>
              <TouchableOpacity style={styles.generateLink} onPress={() => Linking.openURL('https://github.com/settings/personal-access-tokens/new?description=GitNotes')}>
                <Ionicons name="open-outline" size={14} color={colors.primary} />
                <Text style={[styles.generateLinkText, { color: colors.primary }]}>Open GitHub token settings</Text>
              </TouchableOpacity>
              <View style={[styles.tokenInputRow, { borderColor: tokenError ? '#FF3B30' : colors.border, backgroundColor: colors.background }]}>
                <TextInput
                  testID="settings-modals.input.token"
                  style={[styles.tokenInputInner, { color: colors.text }]}
                  placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
                  placeholderTextColor={colors.textSecondary}
                  value={tokenInput}
                  onChangeText={onSetTokenInput}
                  secureTextEntry={!tokenVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  testID="settings-modals.button.toggle-token-visible"
                  onPress={onToggleTokenVisible}
                  style={styles.tokenIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={tokenVisible ? 'Hide token' : 'Show token'}
                >
                  <Ionicons name={tokenVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.tokenActionsRow}>
                <TouchableOpacity testID="settings-modals.button.paste-token" style={[styles.tokenActionBtn, { borderColor: colors.border }]} onPress={onPasteToken} accessibilityLabel="Paste token from clipboard">
                  <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
                  <Text style={[styles.tokenActionLabel, { color: colors.primary }]}>Paste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="settings-modals.button.copy-token"
                  style={[styles.tokenActionBtn, { borderColor: colors.border, opacity: tokenInput.trim() ? 1 : 0.4 }]}
                  onPress={onCopyToken}
                  disabled={!tokenInput.trim()}
                  accessibilityLabel="Copy token to clipboard"
                >
                  <Ionicons name="copy-outline" size={16} color={colors.primary} />
                  <Text style={[styles.tokenActionLabel, { color: colors.primary }]}>Copy</Text>
                </TouchableOpacity>
              </View>
              {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}
              <TouchableOpacity testID="settings-modals.button.save-token" style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={onSaveToken} disabled={isVerifying}>
                {isVerifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>{tokenModalMode === 'add' ? 'Add Account' : 'Save Token'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
