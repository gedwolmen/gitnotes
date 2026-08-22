import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../contexts/ThemeContext';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { useNotes } from '../contexts/NoteContext';
import { useAuth } from '../contexts/AuthContext';
import { useRepos } from '../contexts/RepoContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTodos } from '../contexts/TodoContext';
import { useBiometricLock } from '../contexts/BiometricLockContext';
import { useBackgroundSync } from '../hooks/useBackgroundSync';
import { useForegroundSyncSettings } from '../hooks/useForegroundSyncSettings';
import { useForegroundSyncHealth } from '../hooks/useForegroundSyncHealth';
import type { RootStackParamList } from '../navigation/types';
import { GitHubService, type GitHubRepository } from '../services/GitHubService';
import { RepoFileSyncService } from '../services/RepoFileSyncService';
import { TemplateRepoPreferenceService, type TemplateRepoPreference } from '../services/TemplateRepoPreferenceService';
import { serializeTemplate, templateSlug } from '../services/TemplateMarkdownService';
import { StagingService } from '../services/git/StagingService';
import { SyncEngineService, type SyncEngineMode } from '../services/SyncEngineService';
import { GitFsService } from '../services/git/GitFsService';
import { CloneMigrationService } from '../services/git/CloneMigrationService';
import { LfsService } from '../services/git/lfs';
import { AuthService } from '../services/AuthService';
import { OnboardingService } from '../services/OnboardingService';
import { HapticService } from '../utils/haptics';
import { createThrottledEmitter } from '../utils/progressThrottle';
import { useTemplateStore } from '../stores/templateStore';
import { useAIStore } from '../stores/aiStore';
import type { AIProviderConfig } from '../models/AIProvider';
import { GIT_HOST_LABELS, type GitHostProvider } from '../services/git/GitHost';
import { ModelSelector } from '../components/ai/ModelSelector';
import { ProviderConfigModal } from '../components/ai/ProviderConfigModal';
import { ChatRepoPickerModal } from '../components/ai/ChatRepoPickerModal';
import { ConnectHostModal } from '../components/ConnectHostModal';
import { ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SettingsContent } from '../components/settings/SettingsContent';
import { SettingsModals } from '../components/settings/SettingsModals';
import { CloneProgressModal, type CloneProgress } from '../components/settings/CloneProgressModal';
import type { GitRepository } from '../services/GitService';
import { reposAffectedByRemovedHosts, buildProviderAccountCount, type RemovedHostRef } from '../services/git/repoRemovalCascade';
import { useRepoStore } from '../stores/repoStore';
import { importRepoAtAdd } from '../services/RepoImportService';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { RepoAccessPreflightError } from '../services/git/repoAccessPreflight';
import { useProGate } from '../hooks/useProGate';
import { useProStore } from '../stores/proStore';
import { promptProUpgrade } from '../utils/proAlerts';

// Mirrors GitFsService's MAX_CLONE_RETRIES so a failing repo can't loop the outer flow.
const MAX_OUTER_CLONE_RETRIES = 1;
// The onProgress abort throw may never land (stuck transfer), so cancel force-closes after this.
const CLONE_CANCEL_GRACE_MS = 800;

type ImportAtAddOutcome = 'imported' | 'cancelled' | 'failed';

function confirmUnverifiedWrite(t: TFunction, onConfirm: () => void): void {
  Alert.alert(
    t('settings.writeAccessNotVerifiedTitle'),
    t('settings.writeAccessNotVerifiedBody'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.addAnyway'), onPress: onConfirm },
    ],
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { theme, colors, setTheme, style: uiStyle, setStyle } = useTheme();
  const { isPro, openPaywall } = useProGate();
  const trialActive = useProStore((s) => s.trialActive);
  const trialEndsAt = useProStore((s) => s.trialEndsAt);
  const proStatusLabel = useMemo(() => {
    if (isPro && trialActive && trialEndsAt) {
      const days = Math.max(1, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));
      return t('pro.statusTrial', { days: String(days) });
    }
    if (isPro) return t('pro.statusActive');
    return t('pro.statusUpgrade');
  }, [isPro, trialActive, trialEndsAt, t]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { clearAllNotes, refreshNotes } = useNotes();
  const { refreshCanvases } = useCanvases();
  const { refreshTodos } = useTodos();
  const { authState, accounts, activeAccountId, accountSummaries, setToken, clearToken, addAccount, removeAccount, switchAccount, disconnectHost } = useAuth();
  const { repositories, addRepository: addRepo, removeRepository: removeRepo } = useRepos();
  const {
    isLockEnabled: isBiometricLockEnabled,
    isBiometricAvailable,
    biometricKind,
    biometricLabel,
    lockTimeout,
    setIsLockEnabled,
    setLockTimeout,
  } = useBiometricLock();
  const { isEnabled: isBackgroundSyncEnabled, toggle: toggleBackgroundSync } = useBackgroundSync();
  const {
    syncFrequentlyEnabled,
    syncIntervalSeconds,
    setSyncFrequentlyEnabled,
    setSyncIntervalSeconds,
  } = useForegroundSyncSettings();
  const syncHealth = useForegroundSyncHealth();
  const isAIEnabled = useAIStore((state) => state.isEnabled);
  const selectedModelId = useAIStore((state) => state.selectedModelId);
  const actionMode = useAIStore((state) => state.actionMode);
  const chatRepoOwner = useAIStore((state) => state.chatRepoOwner);
  const chatRepoName = useAIStore((state) => state.chatRepoName);
  const providers = useAIStore((state) => state.providers);
  const toggleAI = useAIStore((state) => state.toggleAI);
  const dailyQuoteEnabled = useAIStore((state) => state.dailyQuoteEnabled);
  const toggleDailyQuote = useAIStore((state) => state.toggleDailyQuote);
  const aiPersonalizationEnabled = useAIStore((state) => state.aiPersonalizationEnabled);
  const toggleAiPersonalization = useAIStore((state) => state.toggleAiPersonalization);
  const githubToolsEnabled = useAIStore((state) => state.githubToolsEnabled);
  const toggleGithubTools = useAIStore((state) => state.toggleGithubTools);
  const dailyQuotePersonalizationEnabled = useAIStore((state) => state.dailyQuotePersonalizationEnabled);
  const toggleDailyQuotePersonalization = useAIStore((state) => state.toggleDailyQuotePersonalization);
  const dailyQuoteSourceVisible = useAIStore((state) => state.dailyQuoteSourceVisible);
  const toggleDailyQuoteSourceVisible = useAIStore((state) => state.toggleDailyQuoteSourceVisible);
  const setActionMode = useAIStore((state) => state.setActionMode);

  const [showRepoPickerModal, setShowRepoPickerModal] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GitHubRepository[]>([]);
  const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false);
  const [manualRepoInput, setManualRepoInput] = useState('');
  const [isAddingRepoPath, setIsAddingRepoPath] = useState<string | null>(null);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenModalMode, setTokenModalMode] = useState<'connect' | 'add'>('connect');
  const [showConnectHostModal, setShowConnectHostModal] = useState(false);
  const [connectHostPreset, setConnectHostPreset] = useState<GitHostProvider | undefined>(undefined);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [showChatRepoPicker, setShowChatRepoPicker] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | undefined>();
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [templatesRepoPref, setTemplatesRepoPref] = useState<TemplateRepoPreference | null>(null);
  const [showTemplatesRepoPicker, setShowTemplatesRepoPicker] = useState(false);
  const [syncModes, setSyncModes] = useState<Record<string, SyncEngineMode>>({});
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);
  const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(null);
  const cloneAbortedRef = useRef(false);
  const cloneProgressRef = useRef<CloneProgress | null>(null);
  cloneProgressRef.current = cloneProgress;
  const cloneOuterRetriesRef = useRef(0);
  const [isSyncingExistingTemplates, setIsSyncingExistingTemplates] = useState(false);
  const [lfsPending, setLfsPending] = useState<Record<string, { count: number; bytes: number }>>({});
  const [lfsDownloadingRepo, setLfsDownloadingRepo] = useState<string | null>(null);

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

  const refreshLfsPending = useCallback(async (repoPaths: string[]) => {
    const next: Record<string, { count: number; bytes: number }> = {};
    for (const path of repoPaths) {
      const items = await LfsService.listPending(path);
      if (items.length > 0) {
        const bytes = items.reduce((acc, item) => acc + item.pointer.size, 0);
        next[path] = { count: items.length, bytes };
      }
    }
    setLfsPending(next);
  }, []);

  useEffect(() => {
    const cloned = Object.entries(syncModes).filter(([, mode]) => mode === 'clone').map(([path]) => path);
    if (cloned.length === 0) {
      setLfsPending({});
      return;
    }
    void refreshLfsPending(cloned);
  }, [syncModes, refreshLfsPending]);

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
      console.warn('[SettingsScreen] handleTokenInput failed:', error);
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
      console.warn('[SettingsScreen] handleCopyToken failed:', error);
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

  const handleEnableCloneMode = useCallback(async (repo: GitRepository, isRetry = false) => {
    if (!GitHubService.isAuthenticated()) {
      Alert.alert(t('settings.githubRequiredTitle'), t('settings.githubRequiredBody'));
      return;
    }
    if (!isRetry) {
      cloneOuterRetriesRef.current = 0;
    }
    setCloningRepo(repo.path);
    cloneAbortedRef.current = false;
    setCloneProgress({ repoName: repo.name, phase: t('settings.clonePhasePreparing'), loaded: 0, total: null });
    const throttled = createThrottledEmitter((phase, loaded, total) => setCloneProgress({ repoName: repo.name, phase, loaded, total }));
    try {
      const token = (await AuthService.getToken()) ?? undefined;
      const branch = repo.branch || 'main';
      if (!(await GitFsService.isCloned({ repoPath: repo.path }))) {
        await GitFsService.clone({
          repoPath: repo.path,
          branch,
          token,
          onProgress: (phase, loaded, total) => {
            if (cloneAbortedRef.current) {
              throw new Error('CLONE_CANCELLED');
            }
            throttled.push(phase, loaded, total);
          },
        });
      }
      if (cloneAbortedRef.current) {
        await GitFsService.removeRepo({ repoPath: repo.path }).catch(() => undefined);
        return;
      }
      await SyncEngineService.setMode(repo.path, 'clone');
      setSyncModes((prev) => ({ ...prev, [repo.path]: 'clone' }));
      throttled.flush();
      setCloneProgress(null);
      void refreshLfsPending([repo.path]);
      HapticService.success();
      Alert.alert(t('settings.cloneEnabledTitle'), t('settings.cloneEnabledBody', { name: repo.name }), [
        { text: t('common.skip'), style: 'cancel' },
        {
          text: t('settings.pushEdits'),
          onPress: async () => {
            try {
              const report = await CloneMigrationService.migrateRepo(repo.path, branch);
              const total = report.notes + report.todos + report.canvases + report.templates;
              if (report.failures.length > 0) {
                HapticService.error();
                Alert.alert(t('settings.migrationIssuesTitle'), t('settings.migrationIssuesBody', { total, failures: report.failures.length }));
                report.failures.forEach((failure) => console.warn('[CloneMigration]', failure.kind, failure.filePath, failure.error));
              } else {
                HapticService.success();
                Alert.alert(t('settings.pushedEditsTitle'), t('settings.pushedEditsBody', { total, name: repo.name }));
              }
            } catch (error) {
              HapticService.error();
              Alert.alert(t('settings.migrationFailedTitle'), error instanceof Error ? error.message : String(error));
            }
          },
        },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (cloneAbortedRef.current) return;
      if (
        /Packfile trailer mismatch|packfile may be corrupted/i.test(errorMessage) &&
        cloneOuterRetriesRef.current < MAX_OUTER_CLONE_RETRIES
      ) {
        cloneOuterRetriesRef.current += 1;
        await GitFsService.removeRepo({ repoPath: repo.path }).catch(() => undefined);
        setCloneProgress({
          repoName: repo.name,
          phase: t('settings.clonePhaseRetrying'),
          loaded: 0,
          total: null,
          error: t('settings.cloneFailedRetryError', { error: errorMessage }),
        });
        setTimeout(() => {
          if (cloneAbortedRef.current) return;
          handleEnableCloneMode(repo, true).catch((retryError) => {
            setCloneProgress({
              repoName: repo.name,
              phase: t('settings.clonePhaseFailed'),
              loaded: 0,
              total: null,
              error: retryError instanceof Error ? retryError.message : String(retryError),
            });
          });
        }, 1500);
        return;
      }
      await GitFsService.removeRepo({ repoPath: repo.path }).catch(() => undefined);
      HapticService.error();
      setCloneProgress({
        repoName: repo.name,
        phase: t('settings.clonePhaseFailed'),
        loaded: 0,
        total: null,
        error: errorMessage,
      });
    } finally {
      setCloningRepo(null);
      if (cloneAbortedRef.current) {
        setCloneProgress(null);
      }
    }
  }, [refreshLfsPending, t]);

  const handleCancelClone = useCallback(() => {
    cloneAbortedRef.current = true;
    if (cloneProgressRef.current?.error) {
      setCloneProgress(null);
      return;
    }
    setCloneProgress((prev) => (prev ? { ...prev, phase: t('settings.clonePhaseCancelling') } : prev));
    setTimeout(() => {
      setCloneProgress((prev) =>
        prev && prev.phase === t('settings.clonePhaseCancelling') ? null : prev,
      );
    }, CLONE_CANCEL_GRACE_MS);
  }, [t]);

  const handleRetryClone = useCallback(() => {
    if (cloningRepo) {
      const repo = repositories.find((r) => r.path === cloningRepo);
      if (repo) {
        setCloneProgress(null);
        handleEnableCloneMode(repo, true).catch(() => {});
      }
    }
  }, [cloningRepo, repositories, handleEnableCloneMode]);

  const handleDownloadLfsObjects = useCallback(async (repo: GitRepository) => {
    const token = (await AuthService.getToken()) ?? undefined;
    if (!token) {
      Alert.alert(t('settings.lfsGithubRequiredTitle'), t('settings.lfsGithubRequiredBody'));
      return;
    }
    setLfsDownloadingRepo(repo.path);
    try {
      const items = await LfsService.listPending(repo.path);
      const workingTreeUri = GitFsService.workingTreeUri({ repoPath: repo.path });
      const root = workingTreeUri.endsWith('/') ? workingTreeUri : `${workingTreeUri}/`;
      let succeeded = 0;
      const failures: { path: string; error: string }[] = [];
      for (const item of items) {
        try {
          await LfsService.downloadObject({
            repoPath: repo.path,
            filePath: item.path,
            fileUri: `${root}${item.path}`,
            accessToken: token,
          });
          succeeded++;
        } catch (e) {
          failures.push({ path: item.path, error: e instanceof Error ? e.message : String(e) });
        }
      }
      await refreshLfsPending([repo.path]);
      if (failures.length === 0) {
        HapticService.success();
        Alert.alert(t('settings.lfsDoneTitle'), t('settings.lfsDoneBody', { count: succeeded, name: repo.name }));
      } else {
        HapticService.error();
        Alert.alert(
          t('settings.lfsFailedTitle'),
          t('settings.lfsFailedBody', { count: succeeded, failed: failures.length, details: failures[0].error }),
        );
      }
    } finally {
      setLfsDownloadingRepo(null);
    }
  }, [refreshLfsPending, t]);

  const handleDisableCloneMode = useCallback((repo: GitRepository) => {
    Alert.alert(t('settings.switchToApiTitle'), t('settings.switchToApiBody', { name: repo.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.switch'),
        style: 'destructive',
        onPress: async () => {
          await GitFsService.removeRepo({ repoPath: repo.path });
          await SyncEngineService.setMode(repo.path, 'api');
          setSyncModes((prev) => ({ ...prev, [repo.path]: 'api' }));
          HapticService.success();
          Alert.alert(
            t('settings.apiModeWarningTitle'),
            t('settings.apiModeWarningBody'),
            [{ text: t('common.ok') }],
          );
        },
      },
    ]);
  }, [t]);

  const handleSyncExistingTemplates = useCallback(async () => {
    if (!templatesRepoPref) return;
    const unsynced = useTemplateStore.getState().customTemplates.filter((template) => !template.filePath);
    if (unsynced.length === 0) {
      Alert.alert(t('settings.nothingToSyncTitle'), t('settings.nothingToSyncBody'));
      return;
    }
    setIsSyncingExistingTemplates(true);
    let synced = 0;
    let failed = 0;
    try {
      for (const template of unsynced) {
        const filePath = `templates/${templateSlug(template.name)}.md`;
        const staged = await StagingService.stageUpsert({
          repo: templatesRepoPref.repoPath,
          branch: templatesRepoPref.branch,
          filePath,
          title: template.name,
          content: serializeTemplate({ ...template, filePath: undefined }),
        });
        if (staged.success) {
          await useTemplateStore.getState().updateTemplate(template.id, { filePath });
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
    Alert.alert(
      t('settings.templatesSyncDoneTitle'),
      failed === 0
        ? t('settings.templatesSyncDoneBody', { count: synced, path: templatesRepoPref.repoPath })
        : t('settings.templatesSyncDonePartial', { count: synced, failed }),
    );
  }, [templatesRepoPref, t]);

  const handleSyncRepo = useCallback(async (repo: GitRepository) => {
    if (!GitHubService.isAuthenticated()) {
      Alert.alert(t('settings.githubRequiredSyncTitle'), t('settings.githubRequiredSyncBody'));
      return;
    }
    setSyncingRepo(repo.path);
    try {
      const result = await RepoFileSyncService.syncRepoFiles(repo.path);
      HapticService.success();
      if (result.created > 0) {
        await refreshNotes();
        Alert.alert(t('settings.syncCompleteImportedTitle'), t('settings.syncCompleteImportedBody', { count: result.created, name: repo.name }));
      } else if (result.skipped > 0) {
        Alert.alert(t('settings.syncCompleteImportedTitle'), t('settings.syncCompleteSkippedBody', { count: result.total }));
      } else if (result.errors.length > 0) {
        Alert.alert(t('settings.syncIssuesTitle'), t('settings.syncIssuesBody', { count: result.errors.length, details: result.errors.slice(0, 3).join('\n') }));
      } else {
        Alert.alert(t('settings.noFilesTitle'), t('settings.noFilesBody'));
      }
    } catch (error) {
      HapticService.error();
      Alert.alert(t('settings.syncFailedTitle'), error instanceof Error ? error.message : t('settings.syncFailedBody'));
    } finally {
      setSyncingRepo(null);
    }
  }, [refreshNotes, t]);

  /**
   * #938 — import repo contents right after the repo is added and AWAIT the
   * outcome, so the picker stays busy until contents actually land. The
   * picker closes from here on success/cancel only — never on failure.
   *
   * `importRepoAtAdd` acquires NO sync-gate cycle — it never waits on
   * StartupSyncGate. The only real interaction is a concurrent startup-pull
   * lazy clone on the same repoPath, already mitigated by the
   * GitFsService.clone in-flight promise dedup + `isCloned` short-circuit.
   * Cancel goes through `cloneAbortedRef` (same machinery as
   * handleEnableCloneMode); the one packfile-corruption retry happens inside
   * GitFsService.cloneExclusive.
   */
  const importRepoAfterAdd = useCallback(async (repoPath: string, repoName: string): Promise<ImportAtAddOutcome> => {
    const retryImport = async (): Promise<void> => {
      setIsAddingRepoPath(repoPath);
      try {
        await importRepoAfterAdd(repoPath, repoName);
      } finally {
        setIsAddingRepoPath(null);
      }
    };
    cloneAbortedRef.current = false;
    setCloneProgress({ repoName, phase: t('settings.clonePhasePreparing'), loaded: 0, total: null });
    const throttled = createThrottledEmitter((phase, loaded, total) => setCloneProgress({ repoName, phase, loaded, total }));
    const result = await importRepoAtAdd(repoPath, repoName, (phase, loaded, total) => {
      if (cloneAbortedRef.current) {
        throw new Error('CLONE_CANCELLED');
      }
      throttled.push(phase, loaded, total);
    });
    throttled.flush();
    setCloneProgress(null);
    if (cloneAbortedRef.current) {
      // Cancel: abort stops the import; the repo stays added and its
      // contents come in on the next pull.
      setShowRepoPickerModal(false);
      Alert.alert(t('common.success'), t('settings.autoSyncFailedBody', { name: repoName }), [
        { text: t('common.ok') },
      ]);
      return 'cancelled';
    }
    if (!result.ok) {
      HapticService.error();
      Alert.alert(
        t('settings.autoSyncFailedTitle'),
        result.error,
        result.retryable
          ? [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.retry'), onPress: () => void retryImport() },
            ]
          : [{ text: t('common.ok') }],
      );
      return 'failed';
    }
    await Promise.all([refreshNotes(), refreshCanvases(), refreshTodos()]);
    if (
      result.counts.notes === 0 &&
      result.counts.canvases === 0 &&
      result.counts.todos === 0 &&
      result.counts.templates === 0
    ) {
      try {
        const mode = await SyncEngineService.getMode(repoPath);
        if (mode === 'clone') {
          console.warn('[SettingsScreen] add-repo import pulled zero contents', { repoPath, counts: result.counts });
        }
      } catch {
      }
    }
    setShowRepoPickerModal(false);
    return 'imported';
  }, [refreshCanvases, refreshNotes, refreshTodos, t]);

  const openRepoPicker = useCallback(async () => {
    setRepoSearchQuery('');
    setShowRepoPickerModal(true);
    if (authState.isAuthenticated && GitHubService.isAuthenticated()) {
      setIsLoadingGithubRepos(true);
      try {
        setGithubRepos(await GitHubService.getRepositories());
      } catch (error) {
        console.warn('[SettingsScreen] getRepositories failed:', error);
        setGithubRepos([]);
      } finally {
        setIsLoadingGithubRepos(false);
      }
    }
  }, [authState.isAuthenticated]);

  const handleSelectGithubRepo = useCallback(async (repo: GitHubRepository) => {
    if (isAddingRepoPath !== null) return;
    if (repositories.length >= 1 && !isPro) {
      promptProUpgrade(t, openPaywall);
      return;
    }
    if (repositories.some((item) => item.path === repo.full_name)) {
      setShowRepoPickerModal(false);
      return;
    }
    const attemptAdd = async (allowUnverifiedWrite: boolean): Promise<void> => {
      setIsAddingRepoPath(repo.full_name);
      try {
        if (allowUnverifiedWrite) {
          await addRepo(repo.full_name, repo.name, 'github', { allowUnverifiedWrite: true });
        } else {
          await addRepo(repo.full_name, repo.name);
        }
        HapticService.success();
        await importRepoAfterAdd(repo.full_name, repo.name);
      } catch (error) {
        if (error instanceof RepoAccessPreflightError && error.canRetry && !allowUnverifiedWrite) {
          confirmUnverifiedWrite(t, () => void attemptAdd(true));
          return;
        }
        console.warn('[SettingsScreen] handleSelectGithubRepo failed:', error);
        HapticService.error();
        if (error instanceof RepoAccessPreflightError) {
          Alert.alert(t('settings.repositoryAccessTitle'), error.message);
          return;
        }
        Alert.alert(t('common.error'), t('settings.addRepoFailedBody'));
      } finally {
        setIsAddingRepoPath(null);
      }
    };
    await attemptAdd(false);
  }, [addRepo, importRepoAfterAdd, repositories, t, isPro, openPaywall, isAddingRepoPath]);

  const handleAddManualRepo = useCallback(async () => {
    if (isAddingRepoPath !== null) return;
    const value = manualRepoInput.trim();
    if (!value) return;
    if (repositories.length >= 1 && !isPro) {
      promptProUpgrade(t, openPaywall);
      return;
    }
    const attemptAdd = async (allowUnverifiedWrite: boolean): Promise<void> => {
      setIsAddingRepoPath(value);
      try {
        if (allowUnverifiedWrite) {
          await addRepo(value, { allowUnverifiedWrite: true });
        } else {
          await addRepo(value);
        }
        setManualRepoInput('');
        HapticService.success();
        await importRepoAfterAdd(value, value);
      } catch (error) {
        if (error instanceof RepoAccessPreflightError && error.canRetry && !allowUnverifiedWrite) {
          confirmUnverifiedWrite(t, () => void attemptAdd(true));
          return;
        }
        console.warn('[SettingsScreen] handleAddManualRepo failed:', error);
        HapticService.error();
        if (error instanceof RepoAccessPreflightError) {
          Alert.alert(t('settings.repositoryAccessTitle'), error.message);
          return;
        }
        Alert.alert(t('common.error'), t('settings.addRepoFailedBody'));
      } finally {
        setIsAddingRepoPath(null);
      }
    };
    await attemptAdd(false);
  }, [addRepo, importRepoAfterAdd, manualRepoInput, t, repositories, isPro, openPaywall, isAddingRepoPath]);

  const handleRemoveRepo = useCallback((repo: GitRepository) => {
    HapticService.warning();
    Alert.alert(t('settings.removeRepoTitle'), t('settings.removeRepoBody', { name: repo.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeRepo(repo.path);
            HapticService.success();
          } catch (err) {
            HapticService.error();
            Alert.alert(
              t('errors.somethingWrong'),
              err instanceof Error ? err.message : t('errors.somethingWrong'),
            );
          }
        },
      },
    ]);
  }, [removeRepo, t]);

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) {
      setTokenError(t('settings.tokenRequired'));
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
      setTokenError(t('settings.tokenInvalid'));
    }
  }, [addAccount, setToken, tokenInput, tokenModalMode, t]);

  const handleSwitchAccount = useCallback(async (id: string) => {
    if (id === activeAccountId) return;
    HapticService.success();
    await switchAccount(id);
  }, [activeAccountId, switchAccount]);

  const handleRemoveAccount = useCallback((id: string, login: string) => {
    HapticService.warning();
    const summary = accountSummaries.find((s) => s.account.id === id);
    const removedHosts: RemovedHostRef[] = summary
      ? summary.hosts.map((h) => ({ id: h.id, provider: h.provider }))
      : [];
    const providerAccountCount = buildProviderAccountCount(accountSummaries);
    const affectedCount = reposAffectedByRemovedHosts(repositories, removedHosts, providerAccountCount).length;
    const body = affectedCount > 0
      ? `${t('settings.removeAccountBody')}\n\n${t('settings.cascadeRemoveWarning', { count: affectedCount })}`
      : t('settings.removeAccountBody');
    Alert.alert(t('settings.removeAccountTitle', { login }), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAccount(id);
            await useRepoStore.getState().removeRepositoriesForHosts(removedHosts, providerAccountCount);
            HapticService.success();
          } catch (err) {
            HapticService.error();
            Alert.alert(
              t('errors.somethingWrong'),
              err instanceof Error ? err.message : t('errors.somethingWrong'),
            );
          }
        },
      },
    ]);
  }, [accountSummaries, repositories, removeAccount, t]);

  const handleRemoveToken = useCallback(() => {
    HapticService.warning();
    const summary = accountSummaries[0];
    const host = summary
      ? summary.hosts.find((h) => h.id === summary.activeHostId) ?? summary.hosts[0]
      : undefined;
    const removedHosts: RemovedHostRef[] = host ? [{ id: host.id, provider: host.provider }] : [];
    const providerAccountCount = buildProviderAccountCount(accountSummaries);
    const affectedCount = reposAffectedByRemovedHosts(repositories, removedHosts, providerAccountCount).length;
    const body = affectedCount > 0
      ? `${t('settings.removeTokenBody')}\n\n${t('settings.cascadeRemoveWarning', { count: affectedCount })}`
      : t('settings.removeTokenBody');
    Alert.alert(t('settings.removeTokenTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await clearToken();
            await useRepoStore.getState().removeRepositoriesForHosts(removedHosts, providerAccountCount);
            HapticService.success();
          } catch (err) {
            HapticService.error();
            Alert.alert(
              t('errors.somethingWrong'),
              err instanceof Error ? err.message : t('errors.somethingWrong'),
            );
          }
        },
      },
    ]);
  }, [accountSummaries, repositories, clearToken, t]);

  // Native-only "Connected hosts" UI: a single Alert lists each connected
  // host as a button; tapping one shows the disconnect confirmation Alert.
  // Triggered by the styled "Disconnect" button next to each host row in
  // SettingsContent. Looks up the host across all account summaries so the
  // caller only needs the host id, then shows the OS-native confirmation
  // Alert — which is the right primitive for a destructive confirm gate.
  const handleDisconnectHost = useCallback((hostId: string) => {
    // Find the host across accounts so the label in the confirmation Alert
    // matches what the user just tapped on.
    let label = hostId;
    let hostProvider: GitHostProvider = 'github';
    for (const summary of accountSummaries) {
      const host = summary.hosts.find((h) => h.id === hostId);
      if (host) {
        label = host.instanceBaseUrl
          ? `${GIT_HOST_LABELS[host.provider]} · ${host.instanceBaseUrl} (${host.hostLogin})`
          : `${GIT_HOST_LABELS[host.provider]} · ${host.hostLogin}`;
        hostProvider = host.provider;
        break;
      }
    }

    const removedHosts: RemovedHostRef[] = [{ id: hostId, provider: hostProvider }];
    const providerAccountCount = buildProviderAccountCount(accountSummaries);
    const affectedCount = reposAffectedByRemovedHosts(repositories, removedHosts, providerAccountCount).length;
    const body = affectedCount > 0
      ? `${t('accounts.disconnectBody', { label })}\n\n${t('settings.cascadeRemoveWarning', { count: affectedCount })}`
      : t('accounts.disconnectBody', { label });

    HapticService.warning();
    Alert.alert(
      t('accounts.disconnectTitle'),
      body,
      [
        { text: t('common.cancel'), style: 'cancel' as const },
        {
          text: t('accounts.disconnect'),
          style: 'destructive' as const,
          onPress: async () => {
            try {
              await disconnectHost(hostId);
              await useRepoStore.getState().removeRepositoriesForHosts(removedHosts, providerAccountCount);
              HapticService.success();
            } catch (err) {
              HapticService.error();
              Alert.alert(
                t('accounts.disconnectFailedTitle'),
                err instanceof Error ? err.message : t('accounts.disconnectFailedBody'),
              );
            }
          },
        },
      ],
    );
  }, [accountSummaries, repositories, disconnectHost, t]);

  const handleResetOnboarding = useCallback(() => {
    HapticService.warning();
    Alert.alert(t('settings.resetOnboardingTitle'), t('settings.resetOnboardingBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.reset'), onPress: async () => { await OnboardingService.resetOnboarding(); HapticService.success(); Alert.alert(t('common.success'), t('settings.resetOnboardingSuccess')); } },
    ]);
  }, [t]);

  const clearData = useCallback(() => {
    HapticService.warning();
    Alert.alert(t('settings.clearAllNotes'), t('settings.clearAllConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.clear'), style: 'destructive', onPress: async () => {
        const success = await clearAllNotes();
        if (success) {
          HapticService.success();
          Alert.alert(t('common.success'), t('settings.clearAllSuccess'));
        } else {
          HapticService.error();
          Alert.alert(t('common.error'), t('settings.clearAllFailed'));
        }
      } },
    ]);
  }, [clearAllNotes, t]);

  const selectedModelName = providers.flatMap((provider) => provider.models).find((model) => model.id === selectedModelId)?.name ?? t('settings.notSet');
  const chatStorageLabel = chatRepoName ? (chatRepoOwner ? `${chatRepoOwner}/${chatRepoName}` : chatRepoName) : t('settings.notSet');

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
      <SettingsContent
        colors={colors}
        headerHeight={headerHeight}
        tabBarHeight={tabBarHeight}
        theme={theme}
        uiStyle={uiStyle}
        accounts={accounts}
        activeAccountId={activeAccountId}
        accountSummaries={accountSummaries.map((s) => ({
          accountId: s.account.id,
          account: {
            id: s.account.id,
            login: s.account.login,
            name: s.account.name,
            avatarUrl: s.account.avatarUrl,
          },
          hosts: s.hosts.map((h) => ({
            id: h.id,
            provider: h.provider,
            hostLogin: h.hostLogin,
            instanceBaseUrl: h.instanceBaseUrl,
          })),
          activeHostId: s.activeHostId,
        }))}
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
        onOpenAddAccount={() => {
          if (accounts.length >= 1 && !isPro) {
            promptProUpgrade(t, openPaywall);
            return;
          }
          setTokenModalMode('add'); setTokenInput(''); setTokenError(null); setTokenVisible(false); setShowTokenModal(true);
        }}
        onSwitchAccount={handleSwitchAccount}
        onRemoveAccount={handleRemoveAccount}
        onRemoveToken={handleRemoveToken}
        onDisconnectHost={handleDisconnectHost}
        onAddHost={(preset) => {
          setConnectHostPreset(preset);
          setShowConnectHostModal(true);
        }}
        onAddHostLocked={() => {
          if (accounts.length >= 1 && !isPro) {
            promptProUpgrade(t, openPaywall);
          } else {
            setConnectHostPreset(undefined);
            setShowConnectHostModal(true);
          }
        }}
        onOpenRepoPicker={() => void openRepoPicker()}
        onSyncRepo={(repo) => void handleSyncRepo(repo)}
        onRemoveRepo={handleRemoveRepo}
        onEnableCloneMode={(repo) => void handleEnableCloneMode(repo)}
        onDisableCloneMode={handleDisableCloneMode}
        lfsPending={lfsPending}
        lfsDownloadingRepo={lfsDownloadingRepo}
        onDownloadLfsObjects={(repo) => void handleDownloadLfsObjects(repo)}
        onOpenTemplatesRepoPicker={() => { setShowChatRepoPicker(false); setShowTemplatesRepoPicker(true); }}
        onSyncExistingTemplates={() => void handleSyncExistingTemplates()}
        onClearTemplatesRepo={() => void handleClearTemplatesRepo()}
        onOpenRenderStyleSettings={() => navigation.navigate('RenderStyleSettings')}
        onClearData={clearData}
        onResetOnboarding={handleResetOnboarding}
        isPro={isPro}
        proStatusLabel={proStatusLabel}
        onOpenPaywall={openPaywall}
        onManageTemplates={() => navigation.navigate('TemplateManager' as never)}
        onToggleAI={() => { void toggleAI(); }}
        dailyQuoteEnabled={dailyQuoteEnabled}
        onToggleDailyQuote={() => { void toggleDailyQuote(); }}
        aiPersonalizationEnabled={aiPersonalizationEnabled}
        onToggleAiPersonalization={() => { void toggleAiPersonalization(); }}
        githubToolsEnabled={githubToolsEnabled}
        onToggleGithubTools={() => { void toggleGithubTools(); }}
        dailyQuotePersonalizationEnabled={dailyQuotePersonalizationEnabled}
        onToggleDailyQuotePersonalization={() => { void toggleDailyQuotePersonalization(); }}
        dailyQuoteSourceVisible={dailyQuoteSourceVisible}
        onToggleDailyQuoteSourceVisible={() => { void toggleDailyQuoteSourceVisible(); }}
        onOpenModelSelector={() => setShowModelSelector(true)}
        onToggleActionMode={() => { void setActionMode(actionMode === 'auto' ? 'confirm' : 'auto'); }}
        onOpenChatRepoPicker={() => { setShowTemplatesRepoPicker(false); setShowChatRepoPicker(true); }}
        onProviderPress={(provider) => {
          if (provider.type === 'openai-compatible' || provider.type === 'anthropic') {
            setEditingProvider(provider);
            setShowProviderConfig(true);
          } else {
            useAIStore.getState().updateProvider(provider.id, { isEnabled: !provider.isEnabled });
          }
        }}
        onAddProvider={() => { setEditingProvider(undefined); setShowProviderConfig(true); }}
        isBiometricLockEnabled={isBiometricLockEnabled}
        isBiometricAvailable={isBiometricAvailable}
        biometricKind={biometricKind}
        biometricLabel={biometricLabel}
        lockTimeout={lockTimeout}
        onToggleBiometricLock={(v) => void setIsLockEnabled(v)}
        onSetLockTimeout={(v) => void setLockTimeout(v)}
        isBackgroundSyncEnabled={isBackgroundSyncEnabled}
        onToggleBackgroundSync={() => void toggleBackgroundSync()}
        syncFrequentlyEnabled={syncFrequentlyEnabled}
        syncIntervalSeconds={syncIntervalSeconds}
        onToggleSyncFrequently={(value) => void setSyncFrequentlyEnabled(value)}
        onSetSyncIntervalSeconds={(value) => void setSyncIntervalSeconds(value)}
        syncHealth={syncHealth}
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
        isAddingRepoPath={isAddingRepoPath}
        isLoadingGithubRepos={isLoadingGithubRepos}
        cloneProgress={cloneProgress}
        onCancelClone={handleCancelClone}
        onRetryClone={handleRetryClone}
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
      <ChatRepoPickerModal
        visible={showChatRepoPicker}
        onClose={() => setShowChatRepoPicker(false)}
        onSelected={() => setShowChatRepoPicker(false)}
        onGoToSettings={() => { setShowChatRepoPicker(false); void openRepoPicker(); }}
      />
      {/* When the repo picker is open, clone progress renders inline inside
          the picker modal (iOS cannot stack a second native Modal on top of
          the picker). The standalone modal only presents for flows with no
          picker open (e.g. the sync-engine clone toggle). */}
      {!showRepoPickerModal ? (
        <CloneProgressModal progress={cloneProgress} onCancel={handleCancelClone} onRetry={handleRetryClone} />
      ) : null}
      <ConnectHostModal
        visible={showConnectHostModal}
        onClose={() => { setShowConnectHostModal(false); setConnectHostPreset(undefined); }}
        presetProvider={connectHostPreset}
        colors={colors}
      />
      </View>
      <ScreenHeader title={t('settings.title')} />
    </SafeAreaView>
  );
}
