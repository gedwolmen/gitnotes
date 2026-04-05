import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Alert, FlatList, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useNotes } from '../contexts/NoteContext';
import { GitService, GitRepository } from '../services/GitService';
import { OnboardingService } from '../services/OnboardingService';
import { AuthService, AuthState } from '../services/AuthService';
import { HapticService } from '../utils/haptics';

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const { theme, isDark, colors, setTheme } = useTheme();
  const { clearAllNotes } = useNotes();
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [showRepos, setShowRepos] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    const state = await AuthService.checkAuthState();
    setAuthState(state);
  };

  const handleGitHubLogin = async () => {
    setIsAuthLoading(true);
    HapticService.light();
    const result = await AuthService.loginWithBrowser();
    setAuthState(result);
    setIsAuthLoading(false);
    
    if (result.isAuthenticated) {
      HapticService.success();
      Alert.alert('Success', `Welcome, ${result.user?.name || result.user?.login}!`);
    }
  };

  const handleGitHubLogout = async () => {
    HapticService.warning();
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of GitHub?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AuthService.logout();
            setAuthState({
              isAuthenticated: false,
              user: null,
              token: null,
            });
            HapticService.success();
          },
        },
      ]
    );
  };

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
          }
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
          <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
            <View style={styles.authUserContainer}>
              {authState.user?.avatar_url && (
                <Image
                  source={{ uri: authState.user.avatar_url }}
                  style={styles.avatar}
                />
              )}
              <View style={styles.authUserInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {authState.user?.name || authState.user?.login}
                </Text>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                  @{authState.user?.login}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleGitHubLogout}>
              <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
            onPress={handleGitHubLogin}
            disabled={isAuthLoading}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="logo-github" size={20} color={colors.text} />
              <Text style={[styles.settingLabel, { color: colors.text, marginLeft: 12 }]}>
                {isAuthLoading ? 'Signing in...' : 'Sign in with GitHub'}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 12,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingLabel: {
    fontSize: 16,
  },
  settingValue: {
    fontSize: 16,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repoList: {
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  repoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  repoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repoName: {
    fontSize: 16,
    marginLeft: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 12,
  },
  authUserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  authUserInfo: {
    flexDirection: 'column',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
  },
});