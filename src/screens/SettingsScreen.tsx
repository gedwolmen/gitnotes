import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { useAuth } from '../contexts/AuthContext';
import { GitService, GitRepository } from '../services/GitService';
import { OnboardingService } from '../services/OnboardingService';
import { HapticService } from '../utils/haptics';

export default function SettingsScreen() {
  const { theme, isDark, colors, setTheme } = useTheme();
  const { clearAllNotes } = useNotes();
  const { authState, setToken, clearToken } = useAuth();

  // Repos
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [isAddingRepo, setIsAddingRepo] = useState(false);

  // GitHub token modal
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const loadRepositories = useCallback(async () => {
    const repos = await GitService.getRepositories();
    setRepositories(repos);
  }, []);

  useEffect(() => {
    loadRepositories();
  }, [loadRepositories]);

  const handleAddRepo = useCallback(async () => {
    const val = newRepoInput.trim();
    if (!val) return;
    setIsAddingRepo(true);
    try {
      await GitService.addRepository(val);
      setNewRepoInput('');
      await loadRepositories();
      HapticService.success();
    } catch {
      HapticService.error();
      Alert.alert('Error', 'Failed to add repository.');
    } finally {
      setIsAddingRepo(false);
    }
  }, [newRepoInput, loadRepositories]);

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
            await GitService.removeRepository(repo.path);
            HapticService.success();
            await loadRepositories();
          },
        },
      ]
    );
  }, [loadRepositories]);

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Appearance ── */}
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
            onPress={() => setTheme('system')}
            onPressIn={() => HapticService.light()}
          >
            <Text style={[styles.settingLabel, { color: colors.text }]}>Use System Theme</Text>
            <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
              {theme === 'system' ? 'Active' : 'Inactive'}
            </Text>
          </TouchableOpacity>
        </View>

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

          {/* Add repo input */}
          <View style={[styles.addRepoRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <TextInput
              style={[styles.repoInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="github.com/owner/repo"
              placeholderTextColor={colors.textSecondary}
              value={newRepoInput}
              onChangeText={setNewRepoInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleAddRepo}
            />
            <TouchableOpacity
              style={[styles.addRepoButton, { backgroundColor: colors.primary }, (!newRepoInput.trim() || isAddingRepo) && styles.disabledButton]}
              onPress={handleAddRepo}
              disabled={!newRepoInput.trim() || isAddingRepo}
            >
              {isAddingRepo
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="add" size={20} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          {repositories.length === 0 ? (
            <View style={styles.emptyRepos}>
              <Ionicons name="code-slash-outline" size={32} color={colors.textSecondary} />
              <Text style={[styles.emptyReposText, { color: colors.textSecondary }]}>
                No repositories added yet
              </Text>
              <Text style={[styles.emptyReposSub, { color: colors.textSecondary }]}>
                Add a repo above using owner/repo format
              </Text>
            </View>
          ) : (
            repositories.map((repo) => (
              <View key={repo.id} style={[styles.repoItem, { borderBottomColor: colors.border }]}>
                <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
                <Text style={[styles.repoName, { color: colors.text }]} numberOfLines={1}>{repo.name}</Text>
                <Text style={[styles.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>{repo.path}</Text>
                <TouchableOpacity onPress={() => handleRemoveRepo(repo)} style={styles.removeButton}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  addRepoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  repoInput: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14 },
  addRepoButton: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  disabledButton: { opacity: 0.4 },
  emptyRepos: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  emptyReposText: { fontSize: 15, fontWeight: '500' },
  emptyReposSub: { fontSize: 13, textAlign: 'center' },
  repoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  repoName: { fontSize: 15, fontWeight: '500', flex: 1 },
  repoPath: { fontSize: 12, flex: 1 },
  removeButton: { padding: 4 },
  // Token modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 },
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
