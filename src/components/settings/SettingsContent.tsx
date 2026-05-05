import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Group, GroupRow, Modal, Toggle } from '../ui';
import {
  SUPPORTED_LANGUAGES,
  getLanguagePreference,
  setLanguage,
  type LanguageCode,
} from '../../i18n';
import { ImportSection } from './ImportSection';
import { settingsStyles as styles } from './settingsStyles';
import type { GitRepository } from '../../services/GitService';
import type { TemplateRepoPreference } from '../../services/TemplateRepoPreferenceService';
import type { AIProviderConfig } from '../../models/AIProvider';
import { TIMEOUT_OPTIONS, type BiometricKind, type LockTimeout } from '../../contexts/BiometricLockContext';

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
  onOpenRepoPicker: () => void;
  onSyncRepo: (repo: GitRepository) => void;
  onRemoveRepo: (repo: GitRepository) => void;
  onEnableCloneMode: (repo: GitRepository) => void;
  onDisableCloneMode: (repo: GitRepository) => void;
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
  isBiometricLockEnabled: boolean;
  isBiometricAvailable: boolean;
  biometricKind: BiometricKind;
  biometricLabel: string;
  lockTimeout: LockTimeout;
  onToggleBiometricLock: (v: boolean) => void;
  onSetLockTimeout: (v: LockTimeout) => void;
  isBackgroundSyncEnabled: boolean;
  onToggleBackgroundSync: () => void;
};

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
    onOpenRepoPicker,
    onSyncRepo,
    onRemoveRepo,
    onEnableCloneMode,
    onDisableCloneMode,
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
    isBiometricLockEnabled,
    isBiometricAvailable,
    biometricKind,
    biometricLabel,
    lockTimeout,
    onToggleBiometricLock,
    onSetLockTimeout,
    isBackgroundSyncEnabled,
    onToggleBackgroundSync,
  } = props;
  const { t } = useTranslation();
  const [languagePref, setLanguagePref] = useState<string>('system');
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  useEffect(() => {
    getLanguagePreference().then(setLanguagePref);
  }, []);

  const currentLangLabel = t(`settings.languageOptions.${languagePref}`);

  return (
    <>
    <ScrollView
      style={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: headerHeight,
        paddingBottom: tabBarHeight + 16,
        gap: 20,
      }}
    >
      <Group
        title={t('settings.appearance')}
        footer={
          uiStyle === 'neumorphic'
            ? 'Soft-UI shadows. Toggle off for the classic flat look.'
            : 'Classic flat look. Toggle on for the Updated UI shadows.'
        }
      >
        <GroupRow
          trailing={
            <Toggle
              testID="neu-toggle"
              value={uiStyle === 'neumorphic'}
              onValueChange={(value) => setStyle(value ? 'neumorphic' : 'flat')}
            />
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.updatedUI')}</Text>
        </GroupRow>
        <GroupRow
          trailing={
            <Toggle
              value={theme === 'dark'}
              onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
            />
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t('settings.darkMode')}</Text>
        </GroupRow>
        <GroupRow
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
          onPress={() => setShowLanguagePicker(true)}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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

      <Group title={t('settings.security')} footer={isBiometricAvailable ? undefined : 'Biometric hardware not available on this device'}>
        <GroupRow
          trailing={
            <Toggle
              testID="biometric-lock-toggle"
              value={isBiometricLockEnabled}
              onValueChange={onToggleBiometricLock}
              disabled={!isBiometricAvailable}
            />
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons
              name={biometricKind === 'face' ? 'scan-outline' : 'finger-print-outline'}
              size={20}
              color={colors.text}
            />
            <Text style={[styles.settingLabel, { color: colors.text }]}>{biometricLabel} Lock</Text>
          </View>
        </GroupRow>
        {isBiometricLockEnabled ? (
          <GroupRow
            onPress={() => setShowTimeoutPicker(true)}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                  {TIMEOUT_OPTIONS.find((o) => o.value === lockTimeout)?.label ?? '5 minutes'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            }
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Lock Timeout</Text>
          </GroupRow>
        ) : null}
      </Group>

      <Group title={accounts.length >= 2 ? 'GitHub Accounts' : 'GitHub Account'}>
        {authState.isAuthenticated ? (
          <>
            {accounts.length >= 2 ? (
              accounts.map((account) => {
                const isActive = account.id === activeAccountId;
                return (
                  <GroupRow
                    key={account.id}
                    onPress={isActive ? undefined : () => void onSwitchAccount(account.id)}
                    disabled={isActive}
                    leading={account.avatarUrl ? <Image source={{ uri: account.avatarUrl }} style={styles.avatar} /> : null}
                    trailing={
                      <TouchableOpacity onPress={() => onRemoveAccount(account.id, account.login)} style={{ paddingHorizontal: 8 }}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    }
                  >
                    <Text style={[styles.settingLabel, { color: colors.text }]}>
                      {account.name || account.login}
                      {isActive ? '  ·  Active' : ''}
                    </Text>
                    <Text style={[styles.settingValue, { color: colors.textSecondary }]}>@{account.login}</Text>
                  </GroupRow>
                );
              })
            ) : (
              <GroupRow
                leading={authState.user?.avatar_url ? <Image source={{ uri: authState.user.avatar_url }} style={styles.avatar} /> : null}
              >
                <Text style={[styles.settingLabel, { color: colors.text }]}>{authState.user?.name || authState.user?.login}</Text>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>@{authState.user?.login}</Text>
              </GroupRow>
            )}

            <GroupRow
              onPress={onOpenConnectToken}
              leading={<Ionicons name="key-outline" size={20} color={colors.text} />}
              trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                {accounts.length >= 2 ? 'Replace Active Token' : 'Change Token'}
              </Text>
            </GroupRow>

            <GroupRow
              onPress={onOpenAddAccount}
              leading={<Ionicons name="person-add-outline" size={20} color={colors.text} />}
              trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>Add another account</Text>
            </GroupRow>

            {accounts.length < 2 ? (
              <GroupRow onPress={onRemoveToken}>
                <Text style={[styles.settingLabel, { color: colors.error }]}>Remove GitHub Account</Text>
              </GroupRow>
            ) : null}
          </>
        ) : (
          <GroupRow
            onPress={onOpenConnectToken}
            leading={<Ionicons name="logo-github" size={20} color={colors.text} />}
            trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Connect GitHub</Text>
          </GroupRow>
        )}
      </Group>

      <Group title="Repositories">
        {repositories.length === 0 ? (
          <GroupRow>
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
              <Ionicons name="code-slash-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>No repositories added yet</Text>
            </View>
          </GroupRow>
        ) : (
          repositories.map((repo) => (
            <GroupRow
              key={repo.id}
              leading={<Ionicons name="git-branch-outline" size={18} color={colors.primary} />}
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {syncingRepo === repo.path ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginHorizontal: 8 }} />
                  ) : (
                    <TouchableOpacity onPress={() => onSyncRepo(repo)} style={{ padding: 8 }} disabled={!!syncingRepo}>
                      <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => onRemoveRepo(repo)} style={{ padding: 4 }}>
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
          onPress={onOpenRepoPicker}
          leading={<Ionicons name="add" size={20} color={colors.primary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.primary, fontWeight: '600' }]}>Add Repository</Text>
        </GroupRow>
      </Group>

      {repositories.length > 0 ? (
        <Group title="Sync engine">
          {repositories.map((repo) => {
            const mode = syncModes[repo.path] ?? 'api';
            const isClone = mode === 'clone';
            const isCloning = cloningRepo === repo.path;
            return (
              <GroupRow
                key={repo.id}
                testID={`sync-engine-row-${repo.path}`}
                leading={<Ionicons name={isClone ? 'cloud-done-outline' : 'cloud-outline'} size={18} color={isClone ? colors.primary : colors.textSecondary} />}
                trailing={
                  isCloning ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : isClone ? (
                    <TouchableOpacity testID={`sync-engine-disable-${repo.path}`} onPress={() => onDisableCloneMode(repo)} style={{ padding: 4 }}>
                      <Text style={[styles.settingLabel, { color: colors.error }]}>Use API</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity testID={`sync-engine-enable-${repo.path}`} onPress={() => onEnableCloneMode(repo)} style={{ padding: 4 }}>
                      <Text style={[styles.settingLabel, { color: colors.primary }]}>Clone</Text>
                    </TouchableOpacity>
                  )
                }
              >
                <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
                <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>
                  {isClone ? 'Clone (local working tree)' : 'GitHub API (per-file)'}
                </Text>
              </GroupRow>
            );
          })}
        </Group>
      ) : null}

      <Group title="Templates">
        <GroupRow
          testID="templates-repo-picker-row"
          onPress={onOpenTemplatesRepoPicker}
          leading={<Ionicons name="document-text-outline" size={20} color={colors.text} />}
          trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>Templates repository</Text>
          <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>
            {templatesRepoPref ? `${templatesRepoPref.repoPath}@${templatesRepoPref.branch}` : 'Not set'}
          </Text>
        </GroupRow>

        {templatesRepoPref ? (
          <>
            <GroupRow
              testID="templates-sync-existing"
              onPress={onSyncExistingTemplates}
              disabled={isSyncingExistingTemplates}
              leading={<Ionicons name="cloud-upload-outline" size={20} color={colors.text} />}
              trailing={isSyncingExistingTemplates ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            >
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Sync custom templates</Text>
            </GroupRow>
            <GroupRow testID="templates-repo-clear" onPress={onClearTemplatesRepo}>
              <Text style={[styles.settingLabel, { color: colors.error }]}>Disconnect templates repo</Text>
            </GroupRow>
          </>
        ) : null}
      </Group>

      <Group title="Note rendering">
        <GroupRow
          onPress={onOpenRenderStyleSettings}
          leading={<Ionicons name="color-palette-outline" size={20} color={colors.text} />}
          trailing={<Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>Customize render styles</Text>
        </GroupRow>
      </Group>

      <Group title="Sync" footer="Periodically sync notes in the background (every 15 min).">
        <GroupRow
          trailing={
            <Toggle
              testID="background-sync-toggle"
              value={isBackgroundSyncEnabled}
              onValueChange={onToggleBackgroundSync}
            />
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sync-outline" size={20} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Background Sync</Text>
          </View>
        </GroupRow>
      </Group>

      <Group title="Data">
        <GroupRow onPress={onClearData}>
          <Text style={[styles.settingLabel, { color: colors.error }]}>Clear All Notes</Text>
        </GroupRow>
        <GroupRow onPress={onResetOnboarding}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reset Onboarding</Text>
        </GroupRow>
      </Group>

      <ImportSection />

      <Group title="About">
        <GroupRow
          trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{Constants.expoConfig?.version ?? '—'}</Text>}
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>Version</Text>
        </GroupRow>
        <GroupRow onPress={onManageTemplates}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Manage templates</Text>
        </GroupRow>
      </Group>

      <Group title={t('settings.artificialIntelligence')}>
        <GroupRow trailing={<Toggle value={isAIEnabled} onValueChange={onToggleAI} />}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Artificial Intelligence</Text>
        </GroupRow>
      </Group>

      {isAIEnabled ? (
        <>
          <Group>
            <GroupRow onPress={onOpenModelSelector} trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{selectedModelName}</Text>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Model</Text>
            </GroupRow>
            <GroupRow onPress={onToggleActionMode} trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{actionMode === 'auto' ? 'Auto' : 'Confirm'}</Text>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Action Mode</Text>
            </GroupRow>
            <GroupRow onPress={onOpenChatRepoPicker} trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{chatStorageLabel}</Text>}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Chat Storage</Text>
            </GroupRow>
          </Group>

          <Group title={t('settings.providers')}>
            {providers.map((provider) => (
              <GroupRow key={provider.id} onPress={() => onProviderPress(provider)} trailing={<Text style={[styles.settingValue, { color: colors.textSecondary }]}>{provider.isEnabled ? 'Enabled' : 'Disabled'}</Text>}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{provider.name}</Text>
              </GroupRow>
            ))}
            <GroupRow onPress={onAddProvider}>
              <Text style={[styles.settingLabel, { color: colors.primary }]}>Add Provider</Text>
            </GroupRow>
          </Group>
        </>
      ) : null}

      <Text style={[styles.credits, { color: colors.textSecondary }]}>
        Made with love by{' '}
        <Text style={{ color: colors.accent }} onPress={() => Linking.openURL('https://www.vidwadeseram.com/')}>Vidwa De Seram</Text>
        {'\n'}in collaboration with{' '}
        <Text style={{ color: colors.accent }} onPress={() => Linking.openURL('https://xaventra.com/')}>Xaventra</Text>
      </Text>

      <View style={styles.bottomPad} />
    </ScrollView>

    <Modal
      visible={showTimeoutPicker}
      onRequestClose={() => setShowTimeoutPicker(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Lock Timeout</Text>
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
      visible={showLanguagePicker}
      onRequestClose={() => setShowLanguagePicker(false)}
      bottomSheet
      contentStyle={{ padding: 16, paddingBottom: 34 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
    </>
  );
}
