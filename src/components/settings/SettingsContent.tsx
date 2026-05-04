import React from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Group, GroupRow, Toggle } from '../ui';
import { settingsStyles as styles } from './settingsStyles';
import type { GitRepository } from '../../services/GitService';
import type { TemplateRepoPreference } from '../../services/TemplateRepoPreferenceService';
import type { AIProviderConfig } from '../../models/AIProvider';

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
  } = props;

  return (
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
        title="Appearance"
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
          <Text style={[styles.settingLabel, { color: colors.text }]}>Updated UI</Text>
        </GroupRow>
        <GroupRow
          trailing={
            <Toggle
              value={theme === 'dark'}
              onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
            />
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
        </GroupRow>
        <GroupRow
          onPress={() => setTheme('system')}
          trailing={
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}> 
              {theme === 'system' ? 'Active' : 'Inactive'}
            </Text>
          }
        >
          <Text style={[styles.settingLabel, { color: colors.text }]}>Use System Theme</Text>
        </GroupRow>
      </Group>

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}> 
          {accounts.length >= 2 ? 'GitHub Accounts' : 'GitHub Account'}
        </Text>

        {authState.isAuthenticated ? (
          <>
            {accounts.length >= 2 ? (
              accounts.map((account) => {
                const isActive = account.id === activeAccountId;
                return (
                  <View key={account.id} style={[styles.settingItem, { borderBottomColor: colors.border }]}> 
                    <TouchableOpacity
                      style={[styles.authUserRow, { flex: 1 }]}
                      onPress={() => void onSwitchAccount(account.id)}
                      disabled={isActive}
                    >
                      {account.avatarUrl ? <Image source={{ uri: account.avatarUrl }} style={styles.avatar} /> : null}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.settingLabel, { color: colors.text }]}> 
                          {account.name || account.login}
                          {isActive ? '  ·  Active' : ''}
                        </Text>
                        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>@{account.login}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onRemoveAccount(account.id, account.login)} style={{ paddingHorizontal: 8 }}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <View style={[styles.settingItem, { borderBottomColor: colors.border }]}> 
                <View style={styles.authUserRow}>
                  {authState.user?.avatar_url ? <Image source={{ uri: authState.user.avatar_url }} style={styles.avatar} /> : null}
                  <View>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>{authState.user?.name || authState.user?.login}</Text>
                    <Text style={[styles.settingValue, { color: colors.textSecondary }]}>@{authState.user?.login}</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onOpenConnectToken}>
              <View style={styles.settingLeft}>
                <Ionicons name="key-outline" size={20} color={colors.text} />
                <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>
                  {accounts.length >= 2 ? 'Replace Active Token' : 'Change Token'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onOpenAddAccount}>
              <View style={styles.settingLeft}>
                <Ionicons name="person-add-outline" size={20} color={colors.text} />
                <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Add another account</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {accounts.length < 2 ? (
              <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onRemoveToken}>
                <Text style={[styles.settingLabel, { color: colors.error }]}>Remove GitHub Account</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onOpenConnectToken}>
            <View style={styles.settingLeft}>
              <Ionicons name="logo-github" size={20} color={colors.text} />
              <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Connect GitHub</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Repositories</Text>
        {repositories.length === 0 ? (
          <View style={styles.emptyRepos}>
            <Ionicons name="code-slash-outline" size={32} color={colors.textSecondary} />
            <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>No repositories added yet</Text>
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
                <TouchableOpacity onPress={() => onSyncRepo(repo)} style={styles.syncButton} disabled={!!syncingRepo}>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => onRemoveRepo(repo)} style={styles.removeButton}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity style={[styles.addRepoButton, { borderColor: colors.primary }]} onPress={onOpenRepoPicker}>
          <Ionicons name="add" size={20} color={colors.primary} />
          <Text style={[styles.addRepoButtonText, { color: colors.primary }]}>Add Repository</Text>
        </TouchableOpacity>
      </View>

      {repositories.length > 0 ? (
        <View style={[styles.section, { backgroundColor: colors.surface }]}> 
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Sync engine</Text>
          {repositories.map((repo) => {
            const mode = syncModes[repo.path] ?? 'api';
            const isClone = mode === 'clone';
            const isCloning = cloningRepo === repo.path;
            return (
              <View key={repo.id} style={[styles.repoItem, { borderBottomColor: colors.border }]} testID={`sync-engine-row-${repo.path}`}>
                <Ionicons name={isClone ? 'cloud-done-outline' : 'cloud-outline'} size={18} color={isClone ? colors.primary : colors.textSecondary} />
                <View style={styles.repoInfo}>
                  <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
                  <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>
                    {isClone ? 'Clone (local working tree)' : 'GitHub API (per-file)'}
                  </Text>
                </View>
                {isCloning ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isClone ? (
                  <TouchableOpacity testID={`sync-engine-disable-${repo.path}`} onPress={() => onDisableCloneMode(repo)} style={styles.removeButton}>
                    <Text style={[styles.settingLabel, { color: colors.error }]}>Use API</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity testID={`sync-engine-enable-${repo.path}`} onPress={() => onEnableCloneMode(repo)} style={styles.removeButton}>
                    <Text style={[styles.settingLabel, { color: colors.primary }]}>Clone</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Templates</Text>
        <TouchableOpacity testID="templates-repo-picker-row" style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onOpenTemplatesRepoPicker}>
          <View style={styles.settingLeft}>
            <Ionicons name="document-text-outline" size={20} color={colors.text} />
            <View style={{ marginLeft: 12, flexShrink: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Templates repository</Text>
              <Text style={[styles.settingValue, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]} numberOfLines={1}>
                {templatesRepoPref ? `${templatesRepoPref.repoPath}@${templatesRepoPref.branch}` : 'Not set'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {templatesRepoPref ? (
          <>
            <TouchableOpacity testID="templates-sync-existing" style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onSyncExistingTemplates} disabled={isSyncingExistingTemplates}>
              <View style={styles.settingLeft}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.text} />
                <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12, flexShrink: 1 }]} numberOfLines={1}>
                  Sync custom templates
                </Text>
              </View>
              {isSyncingExistingTemplates ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </TouchableOpacity>
            <TouchableOpacity testID="templates-repo-clear" style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onClearTemplatesRepo}>
              <Text style={[styles.settingLabel, { color: colors.error }]}>Disconnect templates repo</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Note rendering</Text>
        <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onOpenRenderStyleSettings}>
          <View style={styles.settingLeft}>
            <Ionicons name="color-palette-outline" size={20} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Customize render styles</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Data</Text>
        <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onClearData}>
          <Text style={[styles.settingLabel, { color: colors.error }]}>Clear All Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onResetOnboarding}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Reset Onboarding</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}> 
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About</Text>
        <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Version</Text>
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{Constants.expoConfig?.version ?? Constants.manifest?.version ?? '—'}</Text>
        </View>
        <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Build</Text>
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>2026.04.07</Text>
        </View>
        <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onManageTemplates}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Manage templates</Text>
        </TouchableOpacity>
      </View>

      <Group title="Artificial Intelligence">
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

          <Group title="Providers">
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
        {' '}in collaboration with{' '}
        <Text style={{ color: colors.accent }} onPress={() => Linking.openURL('https://xaventra.com/')}>Xaventra</Text>
      </Text>

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}
