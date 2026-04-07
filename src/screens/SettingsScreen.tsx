import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { useAuth } from '../contexts/AuthContext';
import { GitService, GitRepository } from '../services/GitService';
import { OnboardingService } from '../services/OnboardingService';
import { HapticService } from '../utils/haptics';

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const { theme, isDark, colors, setTheme } = useTheme();
  const { clearAllNotes } = useNotes();
  const { authState, setToken, clearToken } = useAuth();
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [showRepos, setShowRepos] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) {
      setTokenError('Please enter a token');
      return;
    }
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
    Alert.alert(
      'Remove GitHub Token',
      'This will disconnect your GitHub account. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearToken();
            HapticService.success();
          },
        },
      ]
    );
  }, [clearToken]);

  const loadRepositories = useCallback(async () => {
    const repos = await GitService.getRepositories();
    setRepositories(repos);
  }, []);

  const handleToggleRepos = useCallback(async () => {
    if (!showRepos) {
      await loadRepositories();
    }
    setShowRepos(!showRepos);
  }, [showRepos, loadRepositories]);

  const handleRemoveRepo = useCallback((repo: GitRepository) => {
    HapticService.warning();
    Alert.alert(
      'Remove Repository',
      `Are you sure you want to remove "${repo.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await GitService.removeRepository(repo.path);
            HapticService.success();
            await loadRepositories();
          },
        },
      ]
    );
  }, [loadRepositories]);

  const handleResetOnboarding = useCallback(() => {
    HapticService.warning();
    Alert.alert(
      'Reset Onboarding',
      'This will show the onboarding screen on next app launch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            await OnboardingService.resetOnboarding();
            HapticService.success();
            Alert.alert('Success', 'Onboarding will show on next launch.');
          },
        },
      ]
    );
  }, []);

  const handleThemeChange = (newTheme: ThemeMode) => {
    HapticService.selection();
    setTheme(newTheme);
  };

  const clearData = () => {
    HapticService.warning();
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to clear all notes? This action cannot be undone.',
      [
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
      ]
    );
  };

  const renderRepoItem = ({ item }: { item: GitRepository }) => (
    <View style={[styles.repoItem, { borderBottomColor: colors.border }]}>
      <View style={styles.repoInfo}>
        <Ionicons name="folder" size={20} color={colors.primary} />
        <Text style={[styles.repoName, { color: colors.text }]}>{item.name}</Text>
      </View>
      <TouchableOpacity onPress={() => handleRemoveRepo(item)}>
        <Ionicons name="trash-outline" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollContent}>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>

          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
            <Switch
              value={theme === 'dark'}
              onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? colors.primary : '#f4f3f4'}
            />
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
            onPress={() => handleThemeChange('system')}
            onPressIn={() => HapticService.light()}
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Use System Theme</Text>
            <View style={styles.settingRight}>
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                {theme === 'system' ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GitHub Account</Text>

          {authState.isAuthenticated ? (
            <>
              <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
                <View style={styles.authUserContainer}>
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
                  <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>
                    Change Token
                  </Text>
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
                <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>
                  Connect GitHub
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Git Repositories</Text>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
            onPress={handleToggleRepos}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="code-slash" size={20} color={colors.text} />
              <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>Manage Repositories</Text>
            </View>
            <Ionicons name={showRepos ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {showRepos && (
            <View style={[styles.repoList, { backgroundColor: colors.background }]}>
              {repositories.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No repositories added yet.
                </Text>
              ) : (
                <FlatList
                  data={repositories}
                  keyExtractor={(item) => item.id}
                  renderItem={renderRepoItem}
                  scrollEnabled={false}
                />
              )}
            </View>
          )}
        </View>

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

        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>About</Text>

          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Version</Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}>1.0.0</Text>
          </View>

          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Build</Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}>2026.04.05</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showTokenModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {authState.isAuthenticated ? 'Change Token' : 'Connect GitHub'}
              </Text>
              <TouchableOpacity onPress={() => setShowTokenModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                Enter a Personal Access Token with{' '}
                <Text style={{ fontWeight: '600' }}>repo</Text> and{' '}
                <Text style={{ fontWeight: '600' }}>read:user</Text> scopes.
              </Text>

              <TouchableOpacity
                style={styles.generateLink}
                onPress={() => Linking.openURL('https://github.com/settings/tokens/new?scopes=repo,read:user&description=GitNotes')}
              >
                <Ionicons name="open-outline" size={14} color={colors.primary} />
                <Text style={[styles.generateLinkText, { color: colors.primary }]}>
                  Generate token on GitHub
                </Text>
              </TouchableOpacity>

              <TextInput
                style={[
                  styles.tokenInput,
                  {
                    color: colors.text,
                    borderColor: tokenError ? '#FF3B30' : colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor={colors.textSecondary}
                value={tokenInput}
                onChangeText={(t) => { setTokenInput(t); setTokenError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              {tokenError ? (
                <Text style={styles.errorText}>{tokenError}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveToken}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Save Token</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flex: 1 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', marginBottom: 12, marginTop: 12 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  settingLabel: { fontSize: 16 },
  settingValue: { fontSize: 16 },
  settingRight: { flexDirection: 'row', alignItems: 'center' },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  repoList: { padding: 12, marginTop: 8, marginBottom: 8, borderRadius: 8 },
  repoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  repoInfo: { flexDirection: 'row', alignItems: 'center' },
  repoName: { fontSize: 16, marginLeft: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', padding: 12 },
  authUserContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalBody: { padding: 16 },
  modalDescription: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  generateLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  generateLinkText: { fontSize: 14, fontWeight: '500' },
  tokenInput: { height: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginBottom: 8, fontSize: 14 },
  errorText: { color: '#FF3B30', fontSize: 13, marginBottom: 12 },
  modalButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
