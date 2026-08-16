import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Group, GroupRow, Modal, Toggle } from '../ui';
import { HintIcon } from '../ui/HintIcon';
import { aiMemoryIndex } from '../../services/ai/AIMemoryIndexService';
import { HapticService } from '../../utils/haptics';
import {
  SUPPORTED_LANGUAGES,
  getLanguagePreference,
  setLanguage,
  type LanguageCode,
} from '../../i18n';
import { ImportSection } from './ImportSection';
import { ReminderSection } from './ReminderSection';
import { settingsStyles as styles } from './settingsStyles';
import type { GitRepository } from '../../services/GitService';
import type { TemplateRepoPreference } from '../../services/TemplateRepoPreferenceService';
import type { AIProviderConfig } from '../../models/AIProvider';
import { TIMEOUT_OPTIONS, type BiometricKind, type LockTimeout } from '../../contexts/BiometricLockContext';
import { SYNC_INTERVAL_OPTIONS, type SyncIntervalSeconds } from '../../hooks/useForegroundSyncSettings';
import { useProvidersAvailability } from '../../hooks/useProviderAvailability';
import { describeAvailability } from '../../services/ai/providerAvailabilityCopy';
import type { GitHostProvider } from '../../services/git/GitHost';
import { GIT_HOST_LABELS } from '../../services/git/GitHost';
import { useTokens } from '../../contexts/ThemeContext';

type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  accent: string;
};

type Account = {
  id: string;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type AccountSummaryViewModel = {
  accountId: string;
  account: Account;
  hosts: Array<{
    id: string;
    provider: GitHostProvider;
    hostLogin: string;
    instanceBaseUrl: string | null;
  }>;
  activeHostId: string | null;
};

type AuthState = {
  isAuthenticated: boolean;
  user?: { login?: string | null; name?: string | null; avatar_url?: string | null } | null;
};

type SettingsContentProps = {
  colors: ThemeColors;
  headerHeight: number;
  tabBarHeight: number;
  theme: 'light' | 'dark' | 'system';
  uiStyle: 'flat' | 'neumorphic';
  accounts: Account[];
  activeAccountId: string | null;
  authState: AuthState;
  repositories: GitRepository[];
  syncingRepo: string | null;
  syncModes: Record<string, 'api' | 'clone'>;
  cloningRepo: string | null;
  templatesRepoPref: TemplateRepoPreference | null;
  isSyncingExistingTemplates: boolean;
  isAIEnabled: boolean;
  selectedModelName: string;
  actionMode: 'auto' | 'confirm';
  chatStorageLabel: string;
  providers: AIProviderConfig[];
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setStyle: (style: 'flat' | 'neumorphic') => void;
  onOpenConnectToken: () => void;
  onOpenAddAccount: () => void;
  onSwitchAccount: (id: string) => void | Promise<void>;
onRemoveAccount: (id: string, login: string) => void;
  onRemoveToken: () => void;
  /**
   * Disconnect a single host connection. Confirmation flow lives in the
   * parent screen — this just fires the request.
   */
  onDisconnectHost: (hostId: string) => void;
  /** Open Connect Host modal. Optional preset focuses the host picker. */
  onAddHost: (preset?: GitHostProvider) => void;
  accountSummaries: AccountSummaryViewModel[];
  onOpenRepoPicker: () => void;
  onSyncRepo: (repo: GitRepository) => void;
  onRemoveRepo: (repo: GitRepository) => void;
  onEnableCloneMode: (repo: GitRepository) => void;
  onDisableCloneMode: (repo: GitRepository) => void;
  lfsPending: Record<string, { count: number; bytes: number }>;
  lfsDownloadingRepo: string | null;
  onDownloadLfsObjects: (repo: GitRepository) => void;
  onOpenTemplatesRepoPicker: () => void;
  onSyncExistingTemplates: () => void;
  onClearTemplatesRepo: () => void;
  onOpenRenderStyleSettings: () => void;
  onClearData: () => void;
  onResetOnboarding: () => void;
  onManageTemplates: () => void;
  onToggleAI: () => void;
  onOpenModelSelector: () => void;
  onToggleActionMode: () => void;
  onOpenChatRepoPicker: () => void;
  onProviderPress: (provider: AIProviderConfig) => void;
  onAddProvider: () => void;
  dailyQuoteEnabled: boolean;
  onToggleDailyQuote: () => void;
  aiPersonalizationEnabled: boolean;
  onToggleAiPersonalization: () => void;
  githubToolsEnabled: boolean;
  onToggleGithubTools: () => void;
  isBiometricLockEnabled: boolean;
  isBiometricAvailable: boolean;
  biometricKind: BiometricKind;
  biometricLabel: string;
  lockTimeout: LockTimeout;
  onToggleBiometricLock: (v: boolean) => void;
  onSetLockTimeout: (v: LockTimeout) => void;
  isBackgroundSyncEnabled: boolean;
  onToggleBackgroundSync: () => void;
  syncFrequentlyEnabled: boolean;
  syncIntervalSeconds: SyncIntervalSeconds;
  onToggleSyncFrequently: (value: boolean) => void;
  onSetSyncIntervalSeconds: (value: SyncIntervalSeconds) => void;
};

function formatLfsBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SettingsContent(props: SettingsContentProps) {
  const {
    colors,
    headerHeight,
    tabBarHeight,
    theme,
    uiStyle,
    accounts,
    activeAccountId,
    authState,
    accountSummaries,
    repositories,
    syncingRepo,
    syncModes,
    cloningRepo,
    templatesRepoPref,
    isSyncingExistingTemplates,
    isAIEnabled,
    selectedModelName,
    actionMode,
    chatStorageLabel,
    providers,
    setTheme,
    setStyle,
    onOpenConnectToken,
    onOpenAddAccount,
    onSwitchAccount,
    onRemoveAccount,
    onRemoveToken,
    onDisconnectHost,
    onAddHost,
    onOpenRepoPicker,
    onSyncRepo,
    onRemoveRepo,
    onEnableCloneMode,
    onDisableCloneMode,
    lfsPending,
    lfsDownloadingRepo,
    onDownloadLfsObjects,
    onOpenTemplatesRepoPicker,
    onSyncExistingTemplates,
    onClearTemplatesRepo,
    onOpenRenderStyleSettings,
    onClearData,
    onResetOnboarding,
    onManageTemplates,
    onToggleAI,
    onOpenModelSelector,
    onToggleActionMode,
    onOpenChatRepoPicker,
    onProviderPress,
    onAddProvider,
    dailyQuoteEnabled,
    onToggleDailyQuote,
    aiPersonalizationEnabled,
    onToggleAiPersonalization,
    githubToolsEnabled,
    onToggleGithubTools,
    isBiometricLockEnabled,
    isBiometricAvailable,
    biometricKind,
    biometricLabel,
    lockTimeout,
    onToggleBiometricLock,
    onSetLockTimeout,
    isBackgroundSyncEnabled,
    onToggleBackgroundSync,
    syncFrequentlyEnabled,
    syncIntervalSeconds,
    onToggleSyncFrequently,
onSetSyncIntervalSeconds,
  } = props;
  // Tokens hook gives us spacing/radii/type so the styled disconnect
  // button matches the rest of the app without hardcoded values.
  const { spacing, radii, type } = useTokens();
  const { t } = useTranslation();
  const [languagePref, setLanguagePref] = useState<string>('system');
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [showResetAIMemoryModal, setShowResetAIMemoryModal] = useState(false);
  // Drop providers whose `supportedPlatforms` excludes the current OS so a
  // provider that physically can't run here (e.g. on-device Llama on iOS) is
  // hidden entirely instead of showing as a permanently-disabled row.
  const visibleProviders = useMemo(
    () =>
      providers.filter((p) => {
        if (!p.supportedPlatforms || p.supportedPlatforms.length === 0) return true;
        const os = Platform.OS as 'ios' | 'android';
        return p.supportedPlatforms.includes(os);
      }),
    [providers],
  );
  const providerAvailability = useProvidersAvailability(visibleProviders);
  const intervalLabel =
    SYNC_INTERVAL_OPTIONS.find((opt) => opt.value === syncIntervalSeconds)?.label ?? t('settings.everyMinute');

  useEffect(() => {
    getLanguagePreference().then(setLanguagePref);
  }, []);

  const currentLangLabel = t(`settings.languageOptions.${languagePref}`);

  const handleResetAIMemory = useCallback(async () => {
    HapticService.warning();
    setShowResetAIMemoryModal(true);
  }, []);

  const confirmResetAIMemory = useCallback(async () => {
    try {
      await aiMemoryIndex.clear();
      const manifestUri = `${FileSystem.documentDirectory}thought-dump-manifest.json`;
      try {
        const exists = await FileSystem.getInfoAsync(manifestUri);
        if (exists.exists) {
          await FileSystem.deleteAsync(manifestUri);
        }
      } catch {
      }
      HapticService.success();
      Alert.alert(t('settings.resetAIMemorySuccess'));
    } catch {
      HapticService.error();
      Alert.alert(t('common.error'));
    } finally {
      setShowResetAIMemoryModal(false);
    }
  }, [t]);

  return (
    <>
    <ScrollView
      style={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: headerHeight + 16,
        paddingBottom: tabBarHeight + 16,
        gap: 20,
      }}
    >
      <Group
        title={t('settings.appearance')}
      >
        <GroupRow
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.neu"
                value={uiStyle === 'neumorphic'}
                onValueChange={(value) => setStyle(value ? 'neumorphic' : 'flat')}
              />
              <HintIcon hintKey="hints.settings.updatedUI" testID="hint.updated-ui" />
            </View>
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.updatedUI')}</Text>
        </GroupRow>
        <GroupRow
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.theme"
                value={theme === 'dark'}
                onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
              />
              <HintIcon hintKey="hints.settings.darkMode" testID="hint.dark-mode" />
            </View>
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.darkMode')}</Text>
        </GroupRow>
        <GroupRow
          testID="settings.button.theme"
          onPress={() => setTheme('system')}
          trailing={
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}> 
              {theme === 'system' ? t('settings.active') : t('settings.inactive')}
            </Text>
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.useSystemTheme')}</Text>
        </GroupRow>
      </Group>

      <Group title={t('settings.language')}>
        <GroupRow
          testID="settings.button.language-picker"
          onPress={() => setShowLanguagePicker(true)}
          trailing={
            <View className="flex-row items-center gap-1">
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                {currentLangLabel}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.language')}</Text>
        </GroupRow>
      </Group>

      <Group title={t('settings.security')}>
        <GroupRow
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.biometric-lock"
                value={isBiometricLockEnabled}
                onValueChange={onToggleBiometricLock}
                disabled={!isBiometricAvailable}
              />
              <HintIcon hintKey="hints.settings.biometricLock" testID="hint.biometric-lock" />
            </View>
          }
        >
          <View className="flex-row items-center gap-2">
            <Ionicons
            name={biometricKind === 'face' ? 'scan-outline' : 'finger-print-outline'}
              size={20}
              color={colors.text}
            />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.biometricLockLabel', { kind: biometricLabel })}</Text>
          </View>
        </GroupRow>
        {isBiometricLockEnabled ? (
          <GroupRow
            testID="settings.button.timeout-picker"
            onPress={() => setShowTimeoutPicker(true)}
            trailing={
              <View className="flex-row items-center gap-1">
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                  {TIMEOUT_OPTIONS.find((o) => o.value === lockTimeout)?.label ?? t('settings.lockTimeout5Min')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            }
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.lockTimeout')}</Text>
          </GroupRow>
        ) : null}
      </Group>

      <Group title={t('accounts.title')}>
        {accountSummaries.length === 0 ? (
          // No accounts AND no legacy authState: show the unified host picker
          // entry. This is the new first-run path — any host works.
          <GroupRow
            testID="settings.button.connect-host"
            onPress={() => onAddHost()}
            leading={<Ionicons name="add-circle-outline" size={20} color={colors.primary} />}
            trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          >
            <Text style={[styles.settingLabel, { color: colors.primary }]}>
              {t('connectHost.connectHost')}
            </Text>
          </GroupRow>
        ) : (
          <>
            {accountSummaries.map((summary) => {
              const isActive = summary.accountId === activeAccountId;
              return (
                <React.Fragment key={summary.accountId}>
                  <GroupRow
                    testID="settings.row.account"
                    leading={summary.account.avatarUrl ? <Image source={{ uri: summary.account.avatarUrl }} style={styles.avatar} /> : null}
                  >
                    <Text style={[styles.settingLabel, { color: colors.text }]}>
                      {summary.account.name || summary.account.login}
                      {isActive ? ` · ${t('accounts.active')}` : ''}
                    </Text>
                    <Text style={[styles.settingValue, { color: colors.textSecondary }]}>@{summary.account.login}</Text>
                  </GroupRow>
                  {/* Host rows live directly below the account row so the
                      info (provider + login@url) is visible at a glance and
                      the disconnect action sits next to the data it
                      operates on. */}
                  {summary.hosts.map((host) => {
                    const isHostActive = host.id === summary.activeHostId;
                    const idLabel = host.instanceBaseUrl
                      ? `${host.hostLogin}@${host.instanceBaseUrl.replace(/^https?:\/\//, '')}`
                      : host.hostLogin;
                    return (
                      <View
                        key={host.id}
                        testID={`settings.row.host.${host.id}`}
                        className="flex-row items-center px-4 py-3 gap-3"
                      >
                        <View className="flex-1 min-w-0">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: type.sm,
                                fontWeight: '600',
                                color: colors.text,
                              }}
                            >
                              {GIT_HOST_LABELS[host.provider]}
                            </Text>
                            {isHostActive ? (
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 1,
                                  borderRadius: 6,
                                  backgroundColor: colors.primary,
                                }}
                              >
                                <Text
                                  style={{
                                    color: '#ffffff',
                                    fontSize: 9,
                                    fontWeight: '800',
                                    letterSpacing: 0.6,
                                  }}
                                >
                                  {t('accounts.active').toUpperCase()}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: type.xs,
                              color: colors.textSecondary,
                              fontFamily: 'Menlo',
                              marginTop: 3,
                            }}
                          >
                            {idLabel}
                          </Text>
                        </View>
                        {/* Styled disconnect button — outlined in error
                            color with an unlink icon. Distinct from the
                            account row's neutral chrome so the destructive
                            intent is obvious without being alarming. */}
                        <TouchableOpacity
                          onPress={() => onDisconnectHost(host.id)}
                          testID={`settings.button.disconnect-host.${host.id}`}
                          activeOpacity={0.75}
                          className="flex-row items-center gap-1.5 px-3 py-2 border"
                          style={{ borderRadius: radii.md, borderColor: colors.error }}
                        >
                          <Ionicons name="unlink-outline" size={15} color={colors.error} />
                          <Text
                            style={{
                              color: colors.error,
                              fontSize: type.xs,
                              fontWeight: '700',
                              letterSpacing: 0.2,
                            }}
                          >
                            {t('accounts.disconnect')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </React.Fragment>
              );
            })}

            <GroupRow
              testID="settings.button.connect-host"
              onPress={() => onAddHost()}
              leading={<Ionicons name="add-circle-outline" size={20} color={colors.primary} />}
              trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
            >
              <Text style={[styles.settingLabel, { color: colors.primary }]}>
                {t('connectHost.connectHost')}
              </Text>
            </GroupRow>

            {accountSummaries.length < 2 ? (
              <GroupRow testID="settings.button.remove-token" onPress={onRemoveToken}>
                <Text style={[styles.settingLabel, { color: colors.error }]}>
                  {t('accounts.removeActiveConnection')}
                </Text>
              </GroupRow>
            ) : null}
          </>
        )}
      </Group>

      <Group title={t('settings.repositories')}>
        {repositories.length === 0 ? (
          <GroupRow>
            <View className="items-center gap-1.5 py-2">
              <Ionicons name="code-slash-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>{t('settings.noRepositories')}</Text>
            </View>
          </GroupRow>
        ) : (
          repositories.map((repo) => (
            <GroupRow
              key={repo.id}
              leading={<Ionicons name="git-branch-outline" size={18} color={colors.primary} />}
              trailing={
                <View className="flex-row items-center gap-1">
                  {syncingRepo === repo.path ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginHorizontal: 8 }} />
                  ) : (
                    <TouchableOpacity testID={`settings.button.sync-repo`} onPress={() => onSyncRepo(repo)} style={{ padding: 8 }} disabled={!!syncingRepo}>
                      <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity testID={`settings.button.remove-repo`} onPress={() => onRemoveRepo(repo)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              }
            >
              <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
              <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>{repo.path}</Text>
            </GroupRow>
          ))
        )}
        <GroupRow
          testID="settings.button.repo-picker"
          onPress={onOpenRepoPicker}
          leading={<Ionicons name="add" size={20} color={colors.primary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.primary, fontWeight: '600' }]}>{t('settings.addRepository')}</Text>
        </GroupRow>
      </Group>

      {repositories.length > 0 ? (
        <Group title={t('settings.syncEngine')}>
          {repositories.map((repo) => {
            const mode = syncModes[repo.path] ?? 'api';
            const isClone = mode === 'clone';
            const isCloning = cloningRepo === repo.path;
            const lfs = lfsPending[repo.path];
            const isDownloadingLfs = lfsDownloadingRepo === repo.path;
            return (
              <React.Fragment key={repo.id}>
                <GroupRow
                  testID={`sync-engine-row-${repo.path}`}
                  leading={<Ionicons name={isClone ? 'cloud-done-outline' : 'cloud-outline'} size={18} color={isClone ? colors.primary : colors.textSecondary} />}
                  trailing={
                    isCloning ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : isClone ? (
                      <View testID="settings.button.disable-clone">
                        <TouchableOpacity testID={`sync-engine-disable-${repo.path}`} onPress={() => onDisableCloneMode(repo)} style={{ padding: 4 }}>
                          <Text style={[styles.settingLabel, { color: colors.error }]}>{t('settings.useApi')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View testID="settings.button.enable-clone">
                        <TouchableOpacity testID={`settings.toggle.sync-engine-enable-${repo.path.replace('/', '-')}`} onPress={() => onEnableCloneMode(repo)} style={{ padding: 4 }}>
                          <Text style={[styles.settingLabel, { color: colors.primary }]}>{t('settings.clone')}</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  }
                >
                  <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
                  <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>
                    {isClone ? t('settings.cloneModeDescription') : t('settings.apiModeDescription')}
                  </Text>
                </GroupRow>
                {isClone && lfs && lfs.count > 0 ? (
                  <GroupRow
                    testID={`lfs-pending-row-${repo.path}`}
                    leading={<Ionicons name="document-attach-outline" size={18} color={colors.accent} />}
                    trailing={
                      isDownloadingLfs ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <View testID="settings.button.download-lfs">
                          <TouchableOpacity
                            testID={`lfs-download-${repo.path}`}
                          onPress={() => onDownloadLfsObjects(repo)}
                          style={{ padding: 4 }}
                          disabled={!!lfsDownloadingRepo}
                        >
                          <Text style={[styles.settingLabel, { color: colors.primary }]}>{t('settings.download')}</Text>
                        </TouchableOpacity>
                        </View>
                      )
                    }
                  >
                    <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>
                      {t('settings.lfsPending', { count: lfs.count })}
                    </Text>
                    <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>
                      {t('settings.lfsBytesPending', { size: formatLfsBytes(lfs.bytes) })}
                    </Text>
                  </GroupRow>
                ) : null}
              </React.Fragment>
            );
          })}
        </Group>
      ) : null}

      <Group title={t('settings.templates')}>
        <GroupRow
          testID="settings.button.templates-repo-picker"
          onPress={onOpenTemplatesRepoPicker}
          leading={<Ionicons name="document-text-outline" size={20} color={colors.text} />}
          trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.templatesRepository')}</Text>
          <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>
            {templatesRepoPref ? `${templatesRepoPref.repoPath}@${templatesRepoPref.branch}` : t('settings.notSet')}
          </Text>
        </GroupRow>

        {templatesRepoPref ? (
          <>
            <GroupRow
              testID="settings.button.sync-templates"
              onPress={onSyncExistingTemplates}
              disabled={isSyncingExistingTemplates}
              leading={<Ionicons name="cloud-upload-outline" size={20} color={colors.text} />}
              trailing={isSyncingExistingTemplates ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>{t('settings.syncCustomTemplates')}</Text>
            </GroupRow>
            <GroupRow testID="settings.button.clear-templates-repo" onPress={onClearTemplatesRepo}>
              <Text style={[styles.settingLabel, { color: colors.error }]}>{t('settings.disconnectTemplatesRepo')}</Text>
            </GroupRow>
          </>
        ) : null}
      </Group>

      <Group title={t('settings.noteRendering')}>
        <GroupRow
          testID="settings.button.render-style-settings"
          onPress={onOpenRenderStyleSettings}
          leading={<Ionicons name="color-palette-outline" size={20} color={colors.text} />}
          trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.customizeRenderStyles')}</Text>
        </GroupRow>
      </Group>

      <Group title={t('common.sync')}>
        <GroupRow
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.sync-frequently"
                value={syncFrequentlyEnabled}
                onValueChange={onToggleSyncFrequently}
              />
              <HintIcon hintKey="hints.settings.syncFrequently" testID="hint.sync-frequently" />
            </View>
          }
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="sync-outline" size={20} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.syncFrequently')}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {t('settings.syncFrequentlySub')}
              </Text>
            </View>
          </View>
        </GroupRow>
        <GroupRow
          testID="settings.button.interval-picker"
          onPress={syncFrequentlyEnabled ? () => setShowIntervalPicker(true) : undefined}
          disabled={!syncFrequentlyEnabled}
          trailing={
            <View className="flex-row items-center gap-1">
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{intervalLabel}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </View>
          }
        >
          <Text
            style={[
              styles.settingLabel,
              { color: syncFrequentlyEnabled ? colors.text : colors.textSecondary },
            ]}
          >
            {t('settings.syncInterval')}
          </Text>
        </GroupRow>
        <GroupRow
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.background-sync"
                value={isBackgroundSyncEnabled}
                onValueChange={onToggleBackgroundSync}
              />
              <HintIcon hintKey="hints.settings.backgroundSync" testID="hint.background-sync" />
            </View>
          }
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="cloud-download-outline" size={20} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.backgroundSync')}</Text>
          </View>
        </GroupRow>
      </Group>

      <Group title={t('settings.data')}>
        <GroupRow testID="settings.button.clear-data" onPress={onClearData} trailing={<HintIcon hintKey="hints.settings.clearData" testID="hint.clear-data" />}>
          <Text style={[styles.settingLabel, { color: colors.error }]}>{t('settings.clearAllNotes')}</Text>
        </GroupRow>
        <GroupRow testID="settings.button.reset-onboarding" onPress={onResetOnboarding} trailing={<HintIcon hintKey="hints.settings.resetOnboarding" testID="hint.reset-onboarding" />}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.resetOnboarding')}</Text>
        </GroupRow>
      </Group>

      <ImportSection />

      <Group title={t('settings.about')}>
        <GroupRow
          trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{Constants.expoConfig?.version ?? '—'}</Text>}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.version')}</Text>
        </GroupRow>
        <GroupRow testID="settings.button.manage-templates" onPress={onManageTemplates}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.manageTemplates')}</Text>
        </GroupRow>
      </Group>

      <Group title={t('settings.artificialIntelligence')}>
        <GroupRow trailing={<View className="flex-row items-center gap-2">
          <Toggle testID="settings.toggle.ai" value={isAIEnabled} onValueChange={onToggleAI} />
          <HintIcon hintKey="hints.settings.enableAI" testID="hint.enable-ai" />
        </View>}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.enableAI')}</Text>
        </GroupRow>
        <GroupRow
          testID="settings.row.daily-quote"
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.daily-quote"
                value={isAIEnabled ? dailyQuoteEnabled : false}
                onValueChange={onToggleDailyQuote}
                disabled={!isAIEnabled}
              />
              <HintIcon hintKey="hints.settings.dailyQuote" testID="hint.daily-quote" />
            </View>
          }
        >
          <View>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('settings.dailyQuote.title', { defaultValue: 'Daily Quote' })}
            </Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>
              {t('settings.dailyQuoteDescription', { defaultValue: 'Show a personal philosopher quote on Home' })}
            </Text>
          </View>
        </GroupRow>
        <GroupRow
          testID="settings.row.ai-personalization"
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.ai-personalization"
                value={isAIEnabled ? aiPersonalizationEnabled : false}
                onValueChange={onToggleAiPersonalization}
                disabled={!isAIEnabled}
              />
              <HintIcon hintKey="hints.settings.aiPersonalization" testID="hint.ai-personalization" />
            </View>
          }
        >
          <View>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('settings.aiPersonalization.title', { defaultValue: 'Personalize AI with my notes' })}
            </Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>
              {t('settings.aiPersonalizationDescription', { defaultValue: "When off, AI won't read your notes or journals for data safety" })}
            </Text>
          </View>
        </GroupRow>
        <GroupRow
          testID="settings.row.github-tools"
          trailing={
            <View className="flex-row items-center gap-2">
              <Toggle
                testID="settings.toggle.github-tools"
                value={isAIEnabled ? githubToolsEnabled : false}
                onValueChange={onToggleGithubTools}
                disabled={!isAIEnabled}
              />
              <HintIcon hintKey="hints.settings.githubTools" testID="hint.github-tools" />
            </View>
          }
        >
          <View>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {t('settings.githubTools.title', { defaultValue: 'GitHub Tools' })}
            </Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>
              {t('settings.githubTools.description', { defaultValue: "Let AI manage issues, PRs, and repos via your active GitHub account." })}
            </Text>
          </View>
        </GroupRow>
      </Group>

      {isAIEnabled ? (
        <>
          <Group>
            <GroupRow testID="settings.button.model-selector" onPress={onOpenModelSelector} trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{selectedModelName}</Text>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.model')}</Text>
            </GroupRow>
            <GroupRow testID="settings.button.toggle-action-mode" onPress={onToggleActionMode} trailing={<View className="flex-row items-center gap-1">
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{actionMode === 'auto' ? t('settings.auto') : t('settings.confirm')}</Text>
              <HintIcon hintKey={actionMode === 'auto' ? 'hints.settings.actionModeAuto' : 'hints.settings.actionModeConfirm'} testID="hint.action-mode" />
            </View>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.actionMode')}</Text>
            </GroupRow>
            <GroupRow testID="settings.button.chat-repo-picker" onPress={onOpenChatRepoPicker} trailing={<View className="flex-row items-center gap-1">
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{chatStorageLabel}</Text>
              <HintIcon hintKey="hints.settings.chatStorage" testID="hint.chat-storage" />
            </View>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.chatStorage')}</Text>
            </GroupRow>
          </Group>

          <Group>
            <GroupRow testID="settings.button.reset-ai-memory" onPress={handleResetAIMemory}>
              <Text style={[styles.settingLabel, { color: colors.error }]}>{t('settings.resetAIMemory')}</Text>
            </GroupRow>
          </Group>

          <Group title={t('settings.providers')}>
            {visibleProviders.map((provider) => {
              const availability = providerAvailability[provider.id];
              const isUnavailable = availability?.kind === 'unavailable';
              const reasonText = isUnavailable
                ? describeAvailability(t, availability.reason)
                : null;
              return (
                <GroupRow
                  key={provider.id}
                  testID={`settings.button.provider`}
                  onPress={() => onProviderPress(provider)}
                  trailing={
                    <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                      {isUnavailable
                        ? t('settings.unavailable')
                        : provider.isEnabled
                          ? t('settings.enabled')
                          : t('settings.disabled')}
                    </Text>
                  }
                  style={isUnavailable ? { opacity: 0.5 } : undefined}
                >
                  <View>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>{provider.name}</Text>
                    {reasonText ? (
                      <Text style={[styles.settingValue, { color: colors.textSecondary, marginTop: 2 }]}>
                        {reasonText}
                      </Text>
                    ) : null}
                  </View>
                </GroupRow>
              );
            })}
            <GroupRow testID="settings.button.add-provider" onPress={onAddProvider} trailing={<HintIcon hintKey="hints.settings.providers" testID="hint.providers" />}>
              <Text style={[styles.settingLabel, { color: colors.primary }]}>{t('settings.addProvider')}</Text>
            </GroupRow>
          </Group>

          <ReminderSection colors={colors} />
        </>
      ) : null}

      <View style={styles.creditsWrap}>
        <Text style={[styles.creditsText, { color: colors.textSecondary }]} numberOfLines={1}>
          Made with love by{' '}
          <Text style={{ color: colors.accent }} onPress={() => Linking.openURL('https://www.vidwadeseram.com/')}>Vidwa De Seram</Text>
          {' '}in collaboration with{' '}
          <Text style={{ color: colors.accent }} onPress={() => Linking.openURL('https://xaventra.com/')}>Xaventra</Text>
        </Text>
      </View>

      <View style={styles.bottomPad} />
    </ScrollView>

    <Modal
      visible={showTimeoutPicker}
      onRequestClose={() => setShowTimeoutPicker(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{t('settings.lockTimeout')}</Text>
        <TouchableOpacity onPress={() => setShowTimeoutPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <Group>
        {TIMEOUT_OPTIONS.map((opt) => {
          const isActive = opt.value === lockTimeout;
          return (
            <GroupRow
              key={opt.value}
              onPress={() => {
                onSetLockTimeout(opt.value);
                setShowTimeoutPicker(false);
              }}
              trailing={isActive ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: isActive ? colors.primary : colors.text, fontSize: 16 }}>{opt.label}</Text>
            </GroupRow>
          );
        })}
      </Group>
    </Modal>

    <Modal
      visible={showIntervalPicker}
      onRequestClose={() => setShowIntervalPicker(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{t('settings.syncInterval')}</Text>
        <TouchableOpacity onPress={() => setShowIntervalPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <Group>
        {SYNC_INTERVAL_OPTIONS.map((opt) => {
          const isActive = opt.value === syncIntervalSeconds;
          return (
            <GroupRow
              key={opt.value}
              testID={`sync-interval-option-${opt.value}`}
              onPress={() => {
                onSetSyncIntervalSeconds(opt.value);
                setShowIntervalPicker(false);
              }}
              trailing={isActive ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: isActive ? colors.primary : colors.text, fontSize: 16 }}>{opt.label}</Text>
            </GroupRow>
          );
        })}
      </Group>
    </Modal>

    <Modal
      visible={showLanguagePicker}
      onRequestClose={() => setShowLanguagePicker(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{t('settings.language')}</Text>
        <TouchableOpacity onPress={() => setShowLanguagePicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <Group>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = languagePref === lang.code;
          return (
            <GroupRow
              key={lang.code}
              testID="settings.button.language"
              onPress={async () => {
                await setLanguage(lang.code as LanguageCode);
                setLanguagePref(lang.code);
                setShowLanguagePicker(false);
              }}
              trailing={isActive ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            >
              <Text style={{ color: isActive ? colors.primary : colors.text, fontSize: 16 }}>
                {t(`settings.languageOptions.${lang.code}`)}
              </Text>
            </GroupRow>
          );
        })}
      </Group>
    </Modal>

    <Modal
      visible={showResetAIMemoryModal}
      onRequestClose={() => setShowResetAIMemoryModal(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{t('settings.resetAIMemoryConfirm')}</Text>
        <TouchableOpacity onPress={() => setShowResetAIMemoryModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 15, marginBottom: 20 }}>
        {t('settings.resetAIMemoryMessage')}
      </Text>
      <TouchableOpacity
        testID="settings.button.confirm-reset-ai-memory"
        onPress={() => { void confirmResetAIMemory(); }}
        className="rounded-lg items-center py-3.5"
        style={{ backgroundColor: colors.error }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.reset')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowResetAIMemoryModal(false)}
        className="mt-3 py-3.5 rounded-lg items-center"
        style={{ backgroundColor: colors.surface }}
      >
        <Text style={{ color: colors.text, fontSize: 16 }}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </Modal>
    </>
  );
}
