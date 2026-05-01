import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { useAuth } from '../contexts/AuthContext';
import { useRepos } from '../contexts/RepoContext';
import { GitRepository } from '../services/GitService';
import { GitHubService, GitHubRepository } from '../services/GitHubService';
import { RepoFileSyncService } from '../services/RepoFileSyncService';
import { OnboardingService } from '../services/OnboardingService';
import { HapticService } from '../utils/haptics';
import SearchBar from '../components/SearchBar';
import { useResponsive } from '../hooks/useResponsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NGroup, NGroupRow, NToggle, NScreenHeader } from '../components/neumorphic';

export default function SettingsScreen() {
  const { theme, colors, setTheme, style: uiStyle, setStyle } = useTheme();
  const { isTablet, maxContentWidth } = useResponsive();
  const { clearAllNotes, refreshNotes } = useNotes();
  const { authState, setToken, clearToken } = useAuth();
  const { repositories, addRepository: addRepo, removeRepository: removeRepo } = useRepos();
  const [showRepoPickerModal, setShowRepoPickerModal] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false);
  const [manualRepoInput, setManualRepoInput] = useState('');
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');

  // GitHub token modal
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);

  const handleSyncRepo = useCallback(async (repo: GitRepository) => {
    if (!GitHubService.isAuthenticated()) {
      Alert.alert('GitHub Required', 'Please connect your GitHub account in Settings to sync repository files.');
      return;
    }
    setSyncingRepo(repo.path);
    try {
      const result = await RepoFileSyncService.syncRepoFiles(repo.path);
      HapticService.success();
      if (result.created > 0) {
        await refreshNotes();
        Alert.alert('Sync Complete', `Imported ${result.created} notes from ${repo.name}.`);
      } else if (result.skipped > 0) {
        Alert.alert('Sync Complete', `All ${result.total} files were already imported or skipped.`);
      } else if (result.errors.length > 0) {
        Alert.alert('Sync Issues', `Encountered ${result.errors.length} errors. ${result.errors.slice(0, 3).join('\n')}`);
      } else {
        Alert.alert('No Files Found', 'No .md, .norg, .org, or .pdf files found in this repository.');
      }
    } catch (error) {
      HapticService.error();
      Alert.alert('Sync Failed', error instanceof Error ? error.message : 'Failed to sync repository files.');
    } finally {
      setSyncingRepo(null);
    }
  }, [refreshNotes]);

  const openRepoPicker = useCallback(async () => {
    setRepoSearchQuery('');
    setShowRepoPickerModal(true);
    if (authState.isAuthenticated && GitHubService.isAuthenticated()) {
      setIsLoadingGithubRepos(true);
      try {
        const repos = await GitHubService.getRepositories();
        setGithubRepos(repos);
      } catch {
        setGithubRepos([]);
      } finally {
        setIsLoadingGithubRepos(false);
      }
    }
  }, [authState.isAuthenticated]);

  const closeRepoPicker = useCallback(() => {
    setShowRepoPickerModal(false);
    setRepoSearchQuery('');
  }, []);

  const handleSelectGithubRepo = useCallback(async (ghRepo: GitHubRepository) => {
    const alreadyAdded = repositories.some((r) => r.path === ghRepo.full_name);
    if (alreadyAdded) {
      setShowRepoPickerModal(false);
      return;
    }
    setIsAddingRepo(true);
    try {
      await addRepo(ghRepo.full_name, ghRepo.name);
      HapticService.success();
      setShowRepoPickerModal(false);
    } catch {
      HapticService.error();
      Alert.alert('Error', 'Failed to add repository.');
    } finally {
      setIsAddingRepo(false);
    }
  }, [repositories, addRepo]);

  const handleAddManualRepo = useCallback(async () => {
    const val = manualRepoInput.trim();
    if (!val) return;
    setIsAddingRepo(true);
    try {
      await addRepo(val);
      setManualRepoInput('');
      HapticService.success();
      setShowRepoPickerModal(false);
    } catch {
      HapticService.error();
      Alert.alert('Error', 'Failed to add repository.');
    } finally {
      setIsAddingRepo(false);
    }
  }, [manualRepoInput, addRepo]);

  const handleRemoveRepo = useCallback((repo: GitRepository) => {
    HapticService.warning();
    Alert.alert(
      'Remove Repository',
      `Remove "${repo.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeRepo(repo.path);
            HapticService.success();
          },
        },
      ]
    );
  }, [removeRepo]);

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) { setTokenError('Please enter a token'); return; }
    setIsVerifying(true);
    setTokenError(null);
    const success = await setToken(tokenInput.trim());
    setIsVerifying(false);
    if (success) {
      HapticService.success();
      setShowTokenModal(false);
      setTokenInput('');
    } else {
      HapticService.error();
      setTokenError('Invalid token. Please check and try again.');
    }
  }, [tokenInput, setToken]);

  const handleRemoveToken = useCallback(() => {
    HapticService.warning();
    Alert.alert('Remove GitHub Token', 'This will disconnect your GitHub account. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await clearToken(); HapticService.success(); } },
    ]);
  }, [clearToken]);

  const handleResetOnboarding = useCallback(() => {
    HapticService.warning();
    Alert.alert('Reset Onboarding', 'This will show the onboarding screen on next app launch.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: async () => {
          await OnboardingService.resetOnboarding();
          HapticService.success();
          Alert.alert('Success', 'Onboarding will show on next launch.');
        },
      },
    ]);
  }, []);

  const clearData = () => {
    HapticService.warning();
    Alert.alert('Clear All Data', 'Are you sure you want to clear all notes? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const success = await clearAllNotes();
          if (success) {
            HapticService.success();
            Alert.alert('Success', 'All notes have been cleared.');
          } else {
            HapticService.error();
            Alert.alert('Error', 'Failed to clear notes.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
      <NScreenHeader title="Settings" />
      <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, gap: 20 }}>

        <NGroup title="Appearance" footer={uiStyle === 'neumorphic' ? 'Soft-UI shadows. Toggle off for the classic flat look.' : 'Classic flat look. Toggle on for neumorphic styling.'}>
          <NGroupRow
            trailing={
              <NToggle
                value={uiStyle === 'neumorphic'}
                onValueChange={(v) => setStyle(v ? 'neumorphic' : 'flat')}
              />
            }
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Neumorphic UI</Text>
          </NGroupRow>
          <NGroupRow
            trailing={
              <NToggle
                value={theme === 'dark'}
                onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
              />
            }
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
          </NGroupRow>
          <NGroupRow
            onPress={() => setTheme('system')}
            trailing={
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                {theme === 'system' ? 'Active' : 'Inactive'}
              </Text>
            }
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Use System Theme</Text>
          </NGroupRow>
        </NGroup>

        {/* ── GitHub Account ── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GitHub Account</Text>

          {authState.isAuthenticated ? (
            <>
              <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
                <View style={styles.authUserRow}>
                  {authState.user?.avatar_url && (
                    <Image source={{ uri: authState.user.avatar_url }} style={styles.avatar} />
                  )}
                  <View>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>
                      {authState.user?.name || authState.user?.login}
                    </Text>
                    <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                      @{authState.user?.login}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.settingItem, { borderBottomColor: colors.border }]}
                onPress={() => { setTokenInput(''); setTokenError(null); setShowTokenModal(true); }}
              >
                <View style={styles.settingLeft}>
                  <Ionicons name="key-outline" size={20} color={colors.text} />
                  <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Change Token</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingItem, { borderBottomColor: colors.border }]}
                onPress={handleRemoveToken}
              >
                <Text style={[styles.settingLabel, { color: colors.error }]}>Remove GitHub Account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomColor: colors.border }]}
              onPress={() => { setTokenInput(''); setTokenError(null); setShowTokenModal(true); }}
            >
              <View style={styles.settingLeft}>
                <Ionicons name="logo-github" size={20} color={colors.text} />
                <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Connect GitHub</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Repositories ── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Repositories</Text>

          {repositories.length === 0 ? (
            <View style={styles.emptyRepos}>
              <Ionicons name="code-slash-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>
                No repositories added yet
              </Text>
            </View>
          ) : (
            repositories.map((repo) => (
              <View key={repo.id} style={[styles.repoItem, { borderBottomColor: colors.border }]}>
                <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                <View style={styles.repoInfo}>
                  <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
                  <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>{repo.path}</Text>
                </View>
                {syncingRepo === repo.path ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.syncSpinner} />
                ) : (
                  <TouchableOpacity
                    onPress={() => handleSyncRepo(repo)}
                    style={styles.syncButton}
                    disabled={!!syncingRepo}
                  >
                    <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => handleRemoveRepo(repo)} style={styles.removeButton}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={[styles.addRepoButton, { borderColor: colors.primary }]}
            onPress={openRepoPicker}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={[styles.addRepoButtonText, { color: colors.primary }]}>Add Repository</Text>
          </TouchableOpacity>
        </View>

        {/* ── Data ── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Data</Text>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
            onPress={clearData}
          >
            <Text style={[styles.settingLabel, { color: colors.error }]}>Clear All Notes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
            onPress={handleResetOnboarding}
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Reset Onboarding</Text>
          </TouchableOpacity>
        </View>

        {/* ── About ── */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About</Text>
          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Version</Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}>1.0.0</Text>
          </View>
          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Build</Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}>2026.04.07</Text>
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Repo picker modal */}
      <Modal visible={showRepoPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Repository</Text>
              <TouchableOpacity onPress={closeRepoPicker}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Manual entry */}
              <View style={[styles.manualRepoRow, { borderBottomColor: colors.border }]}>
                <TextInput
                  style={[styles.manualRepoInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="owner/repo"
                  placeholderTextColor={colors.textSecondary}
                  value={manualRepoInput}
                  onChangeText={setManualRepoInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleAddManualRepo}
                />
                <TouchableOpacity
                  style={[styles.manualAddBtn, { backgroundColor: colors.primary }, (!manualRepoInput.trim() || isAddingRepo) && styles.disabledButton]}
                  onPress={handleAddManualRepo}
                  disabled={!manualRepoInput.trim() || isAddingRepo}
                >
                  {isAddingRepo
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.manualAddBtnText}>Add</Text>
                  }
                </TouchableOpacity>
              </View>

              {/* GitHub repos list */}
              {authState.isAuthenticated && (
                <>
                  <View style={styles.repoSearchContainer}>
                    <SearchBar
                      value={repoSearchQuery}
                      onChangeText={setRepoSearchQuery}
                      placeholder="Search repositories..."
                    />
                  </View>
                  <Text style={[styles.pickerSectionLabel, { color: colors.textSecondary, borderBottomColor: colors.border }]}>
                    Your GitHub Repositories
                  </Text>
                  {isLoadingGithubRepos ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ padding: 32 }} />
                  ) : (() => {
                    const filteredRepos = repoSearchQuery
                      ? githubRepos.filter((r) =>
                          r.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
                          r.description?.toLowerCase().includes(repoSearchQuery.toLowerCase())
                        )
                      : githubRepos;
                    return filteredRepos.length === 0 ? (
                      <Text style={[styles.pickerEmpty, { color: colors.textSecondary }]}>
                        {repoSearchQuery ? 'No matching repositories' : 'No repositories found'}
                      </Text>
                    ) : (
                      filteredRepos.map((ghRepo) => {
                        const alreadyAdded = repositories.some((r) => r.path === ghRepo.full_name);
                        return (
                          <TouchableOpacity
                            key={ghRepo.id}
                            style={[styles.pickerItem, { borderBottomColor: colors.border }, alreadyAdded && { opacity: 0.4 }]}
                            onPress={() => handleSelectGithubRepo(ghRepo)}
                            disabled={alreadyAdded}
                          >
                            <Ionicons
                              name={ghRepo.private ? 'lock-closed-outline' : 'git-branch-outline'}
                              size={18}
                              color={colors.primary}
                            />
                            <View style={styles.pickerItemInfo}>
                              <Text style={[styles.pickerItemName, { color: colors.text }]}>{ghRepo.full_name}</Text>
                              {ghRepo.description ? (
                                <Text style={[styles.pickerItemDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {ghRepo.description}
                                </Text>
                              ) : null}
                            </View>
                            {alreadyAdded && (
                              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    );
                  })()}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GitHub token modal */}
      <Modal visible={showTokenModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {authState.isAuthenticated ? 'Change Token' : 'Connect GitHub'}
              </Text>
              <TouchableOpacity onPress={() => setShowTokenModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
                Personal Access Token with <Text style={{ fontWeight: '600' }}>repo</Text> and{' '}
                <Text style={{ fontWeight: '600' }}>read:user</Text> scopes.
              </Text>
              <TouchableOpacity
                style={styles.generateLink}
                onPress={() => Linking.openURL('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens')}
              >
                <Ionicons name="help-circle-outline" size={14} color={colors.primary} />
                <Text style={[styles.generateLinkText, { color: colors.primary }]}>Learn about access tokens</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.generateLink}
                onPress={() => Linking.openURL('https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitNotes')}
              >
                <Ionicons name="open-outline" size={14} color={colors.primary} />
                <Text style={[styles.generateLinkText, { color: colors.primary }]}>Generate token on GitHub</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.tokenInput, { color: colors.text, borderColor: tokenError ? '#FF3B30' : colors.border, backgroundColor: colors.background }]}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={colors.textSecondary}
                value={tokenInput}
                onChangeText={(t) => { setTokenInput(t); setTokenError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveToken}
                disabled={isVerifying}
              >
                {isVerifying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalButtonText}>Save Token</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
  },
  scrollContent: { flex: 1 },
  section: { marginTop: 20, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', paddingTop: 14, paddingBottom: 8, letterSpacing: 0.5 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  settingLabel: { fontSize: 16 },
  settingValue: { fontSize: 15 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  authUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  // Repos
  addRepoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  addRepoButtonText: { fontSize: 15, fontWeight: '600' },
  disabledButton: { opacity: 0.4 },
  emptyRepos: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  emptyReposText: { fontSize: 15, fontWeight: '500' },
  emptyReposSub: { fontSize: 13, textAlign: 'center' },
  repoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  repoName: { fontSize: 15, fontWeight: '500' },
  repoPath: { fontSize: 12 },
  repoInfo: { flex: 1 },
  syncButton: { padding: 8 },
  syncSpinner: { marginHorizontal: 8 },
  removeButton: { padding: 4 },
  repoSearchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  // Repo picker modal
  manualRepoRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, gap: 8 },
  manualRepoInput: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14 },
  manualAddBtn: { paddingHorizontal: 16, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  manualAddBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pickerSectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerEmpty: { padding: 24, textAlign: 'center', fontSize: 14 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  pickerItemInfo: { flex: 1 },
  pickerItemName: { fontSize: 15, fontWeight: '500' },
  pickerItemDesc: { fontSize: 13, marginTop: 2 },
  // Token modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34, maxHeight: SCREEN_HEIGHT * 0.75 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalBody: { padding: 16 },
  modalDesc: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  generateLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  generateLinkText: { fontSize: 14, fontWeight: '500' },
  tokenInput: { height: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginBottom: 8, fontSize: 14 },
  errorText: { color: '#FF3B30', fontSize: 13, marginBottom: 10 },
  modalButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomPad: { height: 40 },
});
