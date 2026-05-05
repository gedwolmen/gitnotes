import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { useAuth } from '../contexts/AuthContext';
import { useRepos } from '../contexts/RepoContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTodos } from '../contexts/TodoContext';
import { useBiometricLock } from '../contexts/BiometricLockContext';
import type { RootStackParamList } from '../navigation/types';
import { GitHubService, type GitHubRepository } from '../services/GitHubService';
import { RepoFileSyncService } from '../services/RepoFileSyncService';
import { pullFromSingleRepo } from '../services/RepoPullService';
import { TemplateRepoPreferenceService, type TemplateRepoPreference } from '../services/TemplateRepoPreferenceService';
import { syncTemplateToGitHub } from '../services/TemplateGitHubSyncService';
import { SyncEngineService, type SyncEngineMode } from '../services/SyncEngineService';
import { GitFsService } from '../services/git/GitFsService';
import { CloneMigrationService } from '../services/git/CloneMigrationService';
import { AuthService } from '../services/AuthService';
import { OnboardingService } from '../services/OnboardingService';
import { HapticService } from '../utils/haptics';
import { useResponsive } from '../hooks/useResponsive';
import { useTemplateStore } from '../stores/templateStore';
import { useAIStore } from '../stores/aiStore';
import type { AIProviderConfig } from '../models/AIProvider';
import { ModelSelector } from '../components/ai/ModelSelector';
import { ProviderConfigModal } from '../components/ai/ProviderConfigModal';
import { ChatRepoPickerModal } from '../components/ai/ChatRepoPickerModal';
import { ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SettingsContent } from '../components/settings/SettingsContent';
import { SettingsModals } from '../components/settings/SettingsModals';
import { settingsStyles as styles } from '../components/settings/settingsStyles';
import type { GitRepository } from '../services/GitService';

export default function SettingsScreen() {
  const { theme, colors, setTheme, style: uiStyle, setStyle } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isTablet, maxContentWidth } = useResponsive();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { clearAllNotes, refreshNotes } = useNotes();
  const { refreshCanvases } = useCanvases();
  const { refreshTodos } = useTodos();
  const { authState, accounts, activeAccountId, setToken, clearToken, addAccount, removeAccount, switchAccount } = useAuth();
  const { repositories, addRepository: addRepo, removeRepository: removeRepo } = useRepos();
  const { isLockEnabled: isBiometricLockEnabled, isBiometricAvailable, lockTimeout, setIsLockEnabled, setLockTimeout } = useBiometricLock();
  const isAIEnabled = useAIStore((state) => state.isEnabled);
  const selectedModelId = useAIStore((state) => state.selectedModelId);
  const actionMode = useAIStore((state) => state.actionMode);
  const chatRepoOwner = useAIStore((state) => state.chatRepoOwner);
  const chatRepoName = useAIStore((state) => state.chatRepoName);
  const providers = useAIStore((state) => state.providers);
  const toggleAI = useAIStore((state) => state.toggleAI);
  const setActionMode = useAIStore((state) => state.setActionMode);

  const [showRepoPickerModal, setShowRepoPickerModal] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false);
  const [manualRepoInput, setManualRepoInput] = useState('');
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenModalMode, setTokenModalMode] = useState<'connect' | 'add'>('connect');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [showChatRepoPicker, setShowChatRepoPicker] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | undefined>();
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [templatesRepoPref, setTemplatesRepoPref] = useState<TemplateRepoPreference | null>(null);
  const [showTemplatesRepoPicker, setShowTemplatesRepoPicker] = useState(false);
  const [syncModes, setSyncModes] = useState<Record<string, SyncEngineMode>>({});
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);
  const [isSyncingExistingTemplates, setIsSyncingExistingTemplates] = useState(false);

  useEffect(() => {
    TemplateRepoPreferenceService.get().then(setTemplatesRepoPref);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, SyncEngineMode> = {};
      for (const repo of repositories) {
        next[repo.path] = await SyncEngineService.getMode(repo.path);
      }
      if (!cancelled) setSyncModes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [repositories]);

  const handlePasteToken = useCallback(async () => {
    try {
      const { getStringAsync } = await import('expo-clipboard');
      const text = await getStringAsync();
      if (text.trim()) {
        setTokenInput(text.trim());
        setTokenError(null);
        HapticService.success();
      }
    } catch (error) {
      void error;
      HapticService.error();
    }
  }, []);

  const handleCopyToken = useCallback(async () => {
    if (!tokenInput.trim()) return;
    try {
      const { setStringAsync } = await import('expo-clipboard');
      await setStringAsync(tokenInput.trim());
      HapticService.success();
    } catch (error) {
      void error;
      HapticService.error();
    }
  }, [tokenInput]);

  const handlePickTemplatesRepo = useCallback(async (repo: GitRepository) => {
    const next = { repoPath: repo.path, branch: repo.branch || 'main' };
    await TemplateRepoPreferenceService.set(next);
    setTemplatesRepoPref(next);
    setShowTemplatesRepoPicker(false);
    HapticService.success();
  }, []);

  const handleClearTemplatesRepo = useCallback(async () => {
    await TemplateRepoPreferenceService.clear();
    setTemplatesRepoPref(null);
    HapticService.success();
  }, []);

  const handleEnableCloneMode = useCallback(async (repo: GitRepository) => {
    if (!GitHubService.isAuthenticated()) {
      Alert.alert('GitHub required', 'Connect a GitHub account before enabling clone mode.');
      return;
    }
    setCloningRepo(repo.path);
    try {
      const token = (await AuthService.getToken()) ?? undefined;
      const branch = repo.branch || 'main';
      if (!(await GitFsService.isCloned({ repoPath: repo.path }))) {
        await GitFsService.clone({ repoPath: repo.path, branch, token });
      }
      await SyncEngineService.setMode(repo.path, 'clone');
      setSyncModes((prev) => ({ ...prev, [repo.path]: 'clone' }));
      HapticService.success();
      Alert.alert('Clone mode enabled', `${repo.name} now syncs through a local working tree.\n\nPush any offline edits up to this clone now?`, [
        { text: 'Skip', style: 'cancel' },
        {
          text: 'Push edits',
          onPress: async () => {
            try {
              const report = await CloneMigrationService.migrateRepo(repo.path, branch);
              const total = report.notes + report.todos + report.canvases + report.templates;
              if (report.failures.length > 0) {
                HapticService.error();
                Alert.alert('Migration finished with issues', `Pushed ${total} item(s); ${report.failures.length} failed (see console).`);
                report.failures.forEach((failure) => console.warn('[CloneMigration]', failure.kind, failure.filePath, failure.error));
              } else {
                HapticService.success();
                Alert.alert('Pushed offline edits', `${total} item(s) committed and pushed to ${repo.name}.`);
              }
            } catch (error) {
              HapticService.error();
              Alert.alert('Migration failed', error instanceof Error ? error.message : String(error));
            }
          },
        },
      ]);
    } catch (error) {
      HapticService.error();
      Alert.alert('Clone failed', error instanceof Error ? error.message : String(error));
    } finally {
      setCloningRepo(null);
    }
  }, []);

  const handleDisableCloneMode = useCallback((repo: GitRepository) => {
    Alert.alert('Switch to API mode?', `This will remove the local clone of ${repo.name} and revert to the GitHub Contents API.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Switch',
        style: 'destructive',
        onPress: async () => {
          await GitFsService.removeRepo({ repoPath: repo.path });
          await SyncEngineService.setMode(repo.path, 'api');
          setSyncModes((prev) => ({ ...prev, [repo.path]: 'api' }));
          HapticService.success();
        },
      },
    ]);
  }, []);

  const handleSyncExistingTemplates = useCallback(async () => {
    if (!templatesRepoPref) return;
    const unsynced = useTemplateStore.getState().customTemplates.filter((template) => !template.filePath);
    if (unsynced.length === 0) {
      Alert.alert('Nothing to sync', 'All custom templates are already in the templates repo.');
      return;
    }
    setIsSyncingExistingTemplates(true);
    let synced = 0;
    let failed = 0;
    try {
      for (const template of unsynced) {
        const result = await syncTemplateToGitHub({ repoPath: templatesRepoPref.repoPath, branch: templatesRepoPref.branch, template });
        if (result.success && result.filePath) {
          await useTemplateStore.getState().updateTemplate(template.id, { filePath: result.filePath });
          synced++;
        } else {
          failed++;
        }
      }
    } finally {
      setIsSyncingExistingTemplates(false);
    }
    if (failed === 0) HapticService.success();
    else HapticService.error();
    Alert.alert('Done', failed === 0 ? `Synced ${synced} template(s) to ${templatesRepoPref.repoPath}.` : `Synced ${synced} template(s); ${failed} failed.`);
  }, [templatesRepoPref]);

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

  const autoSyncAfterAdd = useCallback(async (repoPath: string, repoName: string) => {
    if (!GitHubService.isAuthenticated()) return;
    try {
      const result = await pullFromSingleRepo(repoPath);
      if (result.notes + result.canvases + result.todos > 0) {
        await Promise.all([refreshNotes(), refreshCanvases(), refreshTodos()]);
        HapticService.success();
      }
    } catch (error) {
      console.warn('[Settings] auto-sync after add failed:', error);
      Alert.alert('Auto-sync Failed', `Couldn't pull existing files from ${repoName}. You can retry from the Sync button.`);
    }
  }, [refreshCanvases, refreshNotes, refreshTodos]);

  const openRepoPicker = useCallback(async () => {
    setRepoSearchQuery('');
    setShowRepoPickerModal(true);
    if (authState.isAuthenticated && GitHubService.isAuthenticated()) {
      setIsLoadingGithubRepos(true);
      try {
        setGithubRepos(await GitHubService.getRepositories());
      } catch (error) {
        void error;
        setGithubRepos([]);
      } finally {
        setIsLoadingGithubRepos(false);
      }
    }
  }, [authState.isAuthenticated]);

  const handleSelectGithubRepo = useCallback(async (repo: GitHubRepository) => {
    if (repositories.some((item) => item.path === repo.full_name)) {
      setShowRepoPickerModal(false);
      return;
    }
    setIsAddingRepo(true);
    try {
      await addRepo(repo.full_name, repo.name);
      HapticService.success();
      setShowRepoPickerModal(false);
      autoSyncAfterAdd(repo.full_name, repo.name);
    } catch (error) {
      void error;
      HapticService.error();
      Alert.alert('Error', 'Failed to add repository.');
    } finally {
      setIsAddingRepo(false);
    }
  }, [addRepo, autoSyncAfterAdd, repositories]);

  const handleAddManualRepo = useCallback(async () => {
    const value = manualRepoInput.trim();
    if (!value) return;
    setIsAddingRepo(true);
    try {
      await addRepo(value);
      setManualRepoInput('');
      HapticService.success();
      setShowRepoPickerModal(false);
      autoSyncAfterAdd(value, value);
    } catch (error) {
      void error;
      HapticService.error();
      Alert.alert('Error', 'Failed to add repository.');
    } finally {
      setIsAddingRepo(false);
    }
  }, [addRepo, autoSyncAfterAdd, manualRepoInput]);

  const handleRemoveRepo = useCallback((repo: GitRepository) => {
    HapticService.warning();
    Alert.alert('Remove Repository', `Remove "${repo.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeRepo(repo.path); HapticService.success(); } },
    ]);
  }, [removeRepo]);

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) {
      setTokenError('Please enter a token');
      return;
    }
    setIsVerifying(true);
    setTokenError(null);
    const ok = tokenModalMode === 'add' ? !!(await addAccount(tokenInput.trim())) : await setToken(tokenInput.trim());
    setIsVerifying(false);
    if (ok) {
      HapticService.success();
      setShowTokenModal(false);
      setTokenInput('');
      setTokenVisible(false);
      setTokenModalMode('connect');
    } else {
      HapticService.error();
      setTokenError('Invalid token. Please check and try again.');
    }
  }, [addAccount, setToken, tokenInput, tokenModalMode]);

  const handleSwitchAccount = useCallback(async (id: string) => {
    if (id === activeAccountId) return;
    HapticService.success();
    await switchAccount(id);
  }, [activeAccountId, switchAccount]);

  const handleRemoveAccount = useCallback((id: string, login: string) => {
    HapticService.warning();
    Alert.alert(`Remove @${login}?`, 'The token for this account will be deleted from this device. Notes/todos created under it stay locally.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await removeAccount(id); HapticService.success(); } },
    ]);
  }, [removeAccount]);

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
      { text: 'Reset', onPress: async () => { await OnboardingService.resetOnboarding(); HapticService.success(); Alert.alert('Success', 'Onboarding will show on next launch.'); } },
    ]);
  }, []);

  const clearData = useCallback(() => {
    HapticService.warning();
    Alert.alert('Clear All Data', 'Are you sure you want to clear all notes? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        const success = await clearAllNotes();
        if (success) {
          HapticService.success();
          Alert.alert('Success', 'All notes have been cleared.');
        } else {
          HapticService.error();
          Alert.alert('Error', 'Failed to clear notes.');
        }
      } },
    ]);
  }, [clearAllNotes]);

  const selectedModelName = providers.flatMap((provider) => provider.models).find((model) => model.id === selectedModelId)?.name ?? 'Not set';
  const chatStorageLabel = chatRepoName ? (chatRepoOwner ? `${chatRepoOwner}/${chatRepoName}` : chatRepoName) : 'Not set';

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: colors.background }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
      <SettingsContent
        colors={colors}
        headerHeight={headerHeight}
        tabBarHeight={tabBarHeight}
        theme={theme}
        uiStyle={uiStyle}
        accounts={accounts}
        activeAccountId={activeAccountId}
        authState={authState}
        repositories={repositories}
        syncingRepo={syncingRepo}
        syncModes={syncModes}
        cloningRepo={cloningRepo}
        templatesRepoPref={templatesRepoPref}
        isSyncingExistingTemplates={isSyncingExistingTemplates}
        isAIEnabled={isAIEnabled}
        selectedModelName={selectedModelName}
        actionMode={actionMode}
        chatStorageLabel={chatStorageLabel}
        providers={providers}
        setTheme={setTheme}
        setStyle={setStyle}
        onOpenConnectToken={() => { setTokenModalMode('connect'); setTokenInput(''); setTokenError(null); setTokenVisible(false); setShowTokenModal(true); }}
        onOpenAddAccount={() => { setTokenModalMode('add'); setTokenInput(''); setTokenError(null); setTokenVisible(false); setShowTokenModal(true); }}
        onSwitchAccount={handleSwitchAccount}
        onRemoveAccount={handleRemoveAccount}
        onRemoveToken={handleRemoveToken}
        onOpenRepoPicker={() => void openRepoPicker()}
        onSyncRepo={(repo) => void handleSyncRepo(repo)}
        onRemoveRepo={handleRemoveRepo}
        onEnableCloneMode={(repo) => void handleEnableCloneMode(repo)}
        onDisableCloneMode={handleDisableCloneMode}
        onOpenTemplatesRepoPicker={() => setShowTemplatesRepoPicker(true)}
        onSyncExistingTemplates={() => void handleSyncExistingTemplates()}
        onClearTemplatesRepo={() => void handleClearTemplatesRepo()}
        onOpenRenderStyleSettings={() => navigation.navigate('RenderStyleSettings')}
        onClearData={clearData}
        onResetOnboarding={handleResetOnboarding}
        onManageTemplates={() => navigation.navigate('TemplateManager' as never)}
        onToggleAI={() => { void toggleAI(); }}
        onOpenModelSelector={() => setShowModelSelector(true)}
        onToggleActionMode={() => { void setActionMode(actionMode === 'auto' ? 'confirm' : 'auto'); }}
        onOpenChatRepoPicker={() => setShowChatRepoPicker(true)}
        onProviderPress={(provider) => {
          if (provider.type === 'openai-compatible') {
            setEditingProvider(provider);
            setShowProviderConfig(true);
          } else {
            useAIStore.getState().updateProvider(provider.id, { isEnabled: !provider.isEnabled });
          }
        }}
        onAddProvider={() => { setEditingProvider(undefined); setShowProviderConfig(true); }}
        isBiometricLockEnabled={isBiometricLockEnabled}
        isBiometricAvailable={isBiometricAvailable}
        lockTimeout={lockTimeout}
        onToggleBiometricLock={(v) => void setIsLockEnabled(v)}
        onSetLockTimeout={(v) => void setLockTimeout(v)}
      />
      <SettingsModals
        colors={colors}
        authState={authState}
        repositories={repositories}
        githubRepos={githubRepos}
        templatesRepoPref={templatesRepoPref}
        showRepoPickerModal={showRepoPickerModal}
        showTemplatesRepoPicker={showTemplatesRepoPicker}
        showTokenModal={showTokenModal}
        repoSearchQuery={repoSearchQuery}
        manualRepoInput={manualRepoInput}
        isAddingRepo={isAddingRepo}
        isLoadingGithubRepos={isLoadingGithubRepos}
        tokenInput={tokenInput}
        tokenVisible={tokenVisible}
        tokenError={tokenError}
        isVerifying={isVerifying}
        tokenModalMode={tokenModalMode}
        onCloseRepoPicker={() => { setShowRepoPickerModal(false); setRepoSearchQuery(''); }}
        onSetRepoSearchQuery={setRepoSearchQuery}
        onSetManualRepoInput={setManualRepoInput}
        onAddManualRepo={() => void handleAddManualRepo()}
        onSelectGithubRepo={(repo) => void handleSelectGithubRepo(repo)}
        onCloseTemplatesRepoPicker={() => setShowTemplatesRepoPicker(false)}
        onPickTemplatesRepo={(repo) => void handlePickTemplatesRepo(repo)}
        onCloseTokenModal={() => { setShowTokenModal(false); setTokenVisible(false); }}
        onSetTokenInput={(value) => { setTokenInput(value); setTokenError(null); }}
        onToggleTokenVisible={() => setTokenVisible((value) => !value)}
        onPasteToken={() => void handlePasteToken()}
        onCopyToken={() => void handleCopyToken()}
        onSaveToken={() => void handleSaveToken()}
      />
      <ModelSelector visible={showModelSelector} onClose={() => setShowModelSelector(false)} />
      <ProviderConfigModal visible={showProviderConfig} provider={editingProvider} onClose={() => { setShowProviderConfig(false); setEditingProvider(undefined); }} />
      <ChatRepoPickerModal visible={showChatRepoPicker} onClose={() => setShowChatRepoPicker(false)} onSelected={() => setShowChatRepoPicker(false)} />
      <ScreenHeader title="Settings" />
    </SafeAreaView>
  );
}
