import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Linking,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { GitService, GitRepository, GitBranch } from '../services/GitService';
import { HapticService } from '../utils/haptics';
import { parseRepoPath } from '../utils/gitPathParser';
import { GitSyncGate } from '../services/git/GitSyncGate';
import { useGitOperationStore, hasActivePull } from '../stores/gitOperationStore';
import RepoFileTree, { TreeNode } from '../components/RepoFileTree';
import { treeStyles } from '../components/repo/repoTreeStyles';
import { RootStackParamList } from '../navigation/types';
import { EmptyState, Button, Modal, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import SearchBar from '../components/SearchBar';
import { useTranslation } from 'react-i18next';
import { useGitHostPullRequests, useGitHostIssues } from '../hooks/useGitHostQueries';
import type { GitHostItemState, GitHostPullRequest, GitHostIssue, GitHostProvider } from '../services/git/GitHost';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm']);

function classifyFile(name: string): 'pdf' | 'json' | 'image' | 'video' | 'text' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'text';
}

type ExploreView = 'repoList' | 'repoDetail' | 'fileTree' | 'prList' | 'issueList';
type StateFilter = Extract<GitHostItemState, 'open' | 'closed'>;

export default function ExploreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { repositories: repos, refreshRepos } = useRepos();
  const [view, setView] = useState<ExploreView>('repoList');
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
  const [repoSearch, setRepoSearch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const isFocused = useIsFocused();

  const [branchPickerVisible, setBranchPickerVisible] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchLoadFailed, setBranchLoadFailed] = useState(false);

  const [prFilter, setPrFilter] = useState<StateFilter>('open');
  const [issueFilter, setIssueFilter] = useState<StateFilter>('open');

  const [bannerRegionHeight, setBannerRegionHeight] = useState(headerHeight);
  const [toolsHeight, setToolsHeight] = useState(0);

  const ops = useGitOperationStore((s) => s.ops);

  // Reset refresh state when screen loses focus (tab switch, stack push, etc.)
  useEffect(() => {
    if (!isFocused) {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [isFocused]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q),
    );
  }, [repos, repoSearch]);

  const repoInfo = useMemo(() => {
    if (!selectedRepo) return null;
    return parseRepoPath(selectedRepo.path);
  }, [selectedRepo]);

  const repoProvider: GitHostProvider = (selectedRepo?.provider as GitHostProvider) ?? 'github';
  const repoOwner = repoInfo?.owner ?? '';
  const repoName = repoInfo?.repo ?? '';

  const prQuery = useGitHostPullRequests(repoProvider, repoOwner, repoName, prFilter);
  const issueQuery = useGitHostIssues(repoProvider, repoOwner, repoName, issueFilter);

  // Explore performs NO git pull — it only refreshes the repo list. When the
  // gate reports the selected repo busy (push marker or cycle hold affecting
  // it), the tree area shows its busy state and pull-to-refresh is disabled.
  const repoPath = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null;
  const gateBusy = GitSyncGate.isCycleHeld() || GitSyncGate.isPushActive();
  const repoBusy = repoPath ? GitSyncGate.isPushActive(repoPath) || hasActivePull(ops, repoPath) : false;

  useEffect(() => {
    if (repos.length === 0) {
      setLoadingRepos(true);
      refreshRepos().finally(() => setLoadingRepos(false));
    }
  }, [repos.length, refreshRepos]);

  const handleSelectRepo = useCallback((repo: GitRepository) => {
    HapticService.light();
    setSelectedRepo(repo);
    setSelectedBranch(repo.branch);
    setView('repoDetail');
  }, []);

  const handleOpenFileTree = useCallback(() => {
    HapticService.medium();
    setView('fileTree');
  }, []);

  const handleOpenPrList = useCallback(() => {
    HapticService.medium();
    setView('prList');
  }, []);

  const handleOpenIssueList = useCallback(() => {
    HapticService.medium();
    setView('issueList');
  }, []);

  const handleBack = useCallback(() => {
    HapticService.light();
    if (view === 'fileTree' || view === 'prList' || view === 'issueList') {
      setView('repoDetail');
    } else if (view === 'repoDetail') {
      setSelectedRepo(null);
      setView('repoList');
    }
  }, [view]);

  const handleRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);

    const safetyTimeout = setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
    }, 30000);

    if (view === 'repoList') {
      refreshRepos().finally(() => {
        clearTimeout(safetyTimeout);
        refreshingRef.current = false;
        setRefreshing(false);
      });
    } else {
      clearTimeout(safetyTimeout);
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [view, refreshRepos]);

  const openBranchPicker = useCallback(async () => {
    if (!selectedRepo) return;
    HapticService.light();
    setBranchPickerVisible(true);
    setBranchLoading(true);
    setBranchLoadFailed(false);
    setBranches([]);
    try {
      setBranches(await GitService.getBranches(selectedRepo.path, selectedRepo.provider));
    } catch (error) {
      console.warn('[Explore] Failed to load branches:', error);
      setBranchLoadFailed(true);
    } finally {
      setBranchLoading(false);
    }
  }, [selectedRepo]);

  const handleSelectBranch = useCallback((name: string) => {
    HapticService.selection();
    setSelectedBranch(name);
    setBranchPickerVisible(false);
  }, []);

  const closeBranchPicker = useCallback(() => {
    setBranchPickerVisible(false);
  }, []);

  const renderRepoItem = useCallback(
    ({ item }: { item: GitRepository }) => (
      <TouchableOpacity
        testID="explore.button.select-repo"
        className="flex-row items-center px-4 py-3"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}
        onPress={() => handleSelectRepo(item)}
        activeOpacity={0.7}
      >
        <Ionicons name="git-branch" size={20} color={colors.primary} style={{ marginRight: 12 }} />
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-medium" style={{ color: colors.text }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {item.path}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    ),
    [colors, handleSelectRepo],
  );

  if (view === 'repoList') {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        <View
          testID="explore.banner-region"
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: headerHeight }}
          onLayout={(event) => setBannerRegionHeight(event.nativeEvent.layout.height)}
        >
          <OfflineBanner />
        </View>
        {loadingRepos ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-sm" style={{ color: colors.textSecondary }}>{t('explore.loadingRepos')}</Text>
          </View>
        ) : filteredRepos.length === 0 ? (
          <EmptyState
            icon="git-branch-outline"
            title={repos.length === 0 ? t('explore.emptyTitleNoRepos') : t('explore.emptyTitleNoMatches')}
            subtitle={repos.length === 0 ? t('explore.emptySubtitleNoRepos') : t('explore.emptySubtitleNoMatches')}
          />
        ) : (
          <FlatList
            data={filteredRepos}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderRepoItem}
            contentContainerStyle={{ paddingTop: bannerRegionHeight + toolsHeight + 8, paddingBottom: tabBarHeight + 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} enabled={!gateBusy} />
            }
          />
        )}
        <BlurView
          testID="explore.header-blur"
          pointerEvents="box-none"
          intensity={60}
          tint={isDark ? 'dark' : 'light'}
          className="absolute left-0 right-0 z-10"
          style={{ top: bannerRegionHeight }}
          onLayout={(event) => setToolsHeight(event.nativeEvent.layout.height)}
        >
          <View className="px-4 pt-2 pb-3">
            <SearchBar
              testID="explore.search-bar.repo-search"
              value={repoSearch}
              onChangeText={setRepoSearch}
              placeholder={t('explore.searchRepos')}
            />
          </View>
        </BlurView>
        <ScreenHeader title={t('explore.title')} />
      </SafeAreaView>
    );
  }

  if (view === 'repoDetail' && selectedRepo) {
    const parsed = parseRepoPath(selectedRepo.path);

    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        <View style={{ paddingTop: headerHeight }}>
          <OfflineBanner />
        </View>

        <View className="mx-4 mt-4 rounded-sm border p-4" style={{ backgroundColor: colors.surface, borderColor: colors.border + '30' }}>
          <View className="flex-row items-center gap-3.5">
            <View className="w-13 h-13 rounded-sm items-center justify-center" style={{ backgroundColor: colors.primary + '15', width: 52, height: 52, borderRadius: 14 }}>
              <Ionicons name="git-branch" size={28} color={colors.primary} />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-lg font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                {parsed ? `${parsed.owner}/${parsed.repo}` : selectedRepo.name}
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {selectedRepo.path}
              </Text>
            </View>
          </View>

          {selectedRepo.branch && (
            <View className="flex-row items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderTopColor: 'rgba(150,150,150,0.2)' }}>
              <Ionicons name="git-branch-outline" size={14} color={colors.textSecondary} />
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                {selectedRepo.branch}
              </Text>
            </View>
          )}
        </View>

        <View className="px-4 mt-6 gap-3">
          <View className="flex-row items-stretch gap-3 overflow-hidden">
            <Pressable
              testID="explore.button.open-file-tree"
              onPress={handleOpenFileTree}
              accessibilityRole="button"
              accessibilityLabel={t('explore.browseFiles')}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minWidth: 0,
                  height: 130,
                  borderRadius: 20,
                  padding: 16,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
            >
              <View className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white items-center justify-center">
                <Ionicons name="folder-open-outline" size={18} color={colors.primary} />
              </View>
              <View className="absolute" style={{ top: -50, right: -50, opacity: 0.3 }}>
                <Ionicons name="folder-open-outline" size={120} color="#FFFFFF" />
              </View>
              <View className="gap-1">
                <Text className="text-xl font-bold text-white" style={{ letterSpacing: -0.3 }} numberOfLines={1}>
                  {t('explore.browseFiles')}
                </Text>
                <Text className="text-xs font-medium text-white opacity-80" numberOfLines={1}>
                  {t('explore.browseFilesSub')}
                </Text>
              </View>
            </Pressable>

            <Pressable
              testID="explore.button.open-pr-list"
              onPress={handleOpenPrList}
              accessibilityRole="button"
              accessibilityLabel={t('explore.pullRequests')}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minWidth: 0,
                  height: 130,
                  borderRadius: 20,
                  padding: 16,
                  overflow: 'hidden',
                  justifyContent: 'flex-end',
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.92 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                },
              ]}
            >
              <View className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white items-center justify-center">
                <Ionicons name="git-pull-request-outline" size={18} color={colors.primary} />
              </View>
              <View className="absolute" style={{ top: -50, right: -50, opacity: 0.3 }}>
                <Ionicons name="git-pull-request-outline" size={120} color="#FFFFFF" />
              </View>
              <View className="gap-1">
                <Text className="text-xl font-bold text-white" style={{ letterSpacing: -0.3 }} numberOfLines={1}>
                  {t('explore.pullRequests')}
                </Text>
                <Text className="text-xs font-medium text-white opacity-80" numberOfLines={1}>
                  {t('explore.pullRequestsSub')}
                </Text>
              </View>
            </Pressable>
          </View>

          <Pressable
            testID="explore.button.open-issues-list"
            onPress={handleOpenIssueList}
            accessibilityRole="button"
            accessibilityLabel={t('explore.issues')}
            style={({ pressed }) => [
              {
                width: '100%',
                minHeight: 130,
                borderRadius: 20,
                padding: 16,
                justifyContent: 'space-between',
                overflow: 'hidden',
                backgroundColor: colors.accent,
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <View className="w-10 h-10 rounded-md items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Ionicons name="alert-circle-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={{ gap: 6 }}>
              <Text className="text-base font-bold" style={{ color: '#FFFFFF', letterSpacing: -0.2 }} numberOfLines={1}>
                {t('explore.issues')}
              </Text>
              <Text className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }} numberOfLines={2}>
                {t('explore.issuesSub')}
              </Text>
            </View>
          </Pressable>
        </View>
        <ScreenHeader
          title={selectedRepo.name}
          onBack={handleBack}
          actions={
            <TouchableOpacity
              testID="explore.hub.branch-picker"
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: colors.primary + '15' }}
              onPress={openBranchPicker}
              activeOpacity={0.7}
            >
              <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
              <Text className="text-xs font-semibold" style={{ color: colors.primary }} numberOfLines={1}>
                {selectedBranch ?? selectedRepo.branch ?? t('settings.branchDefault')}
              </Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>
    );
  }

  if (view === 'fileTree' && repoInfo) {
    const branch = selectedBranch ?? selectedRepo?.branch;
    const branchLabel = branch ?? t('settings.branchDefault');

    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        <View
          testID="explore.file-tree.banner-region"
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: headerHeight }}
          onLayout={(event) => setBannerRegionHeight(event.nativeEvent.layout.height)}
        >
          <OfflineBanner />
        </View>

        <ScrollView
          className="flex-1"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingTop: bannerRegionHeight, paddingBottom: 32, backgroundColor: colors.background }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} enabled={!repoBusy} />
          }
        >
          {repoBusy ? (
            <View style={[treeStyles.center]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <RepoFileTree
              owner={repoInfo.owner}
              repo={repoInfo.repo}
              branch={branch}
              provider={repoProvider}
              onFilePress={(node: TreeNode) => {
                const kind = classifyFile(node.name);
                const params = {
                  owner: repoInfo.owner,
                  repo: repoInfo.repo,
                  branch,
                  path: node.path,
                  title: node.name,
                  size: node.size,
                };
                if (kind === 'pdf') {
                  navigation.navigate('PdfViewer', params);
                } else if (kind === 'image') {
                  navigation.navigate('ImageViewer', params);
                } else if (kind === 'video') {
                  navigation.navigate('VideoViewer', params);
                } else if (kind === 'json') {
                  navigation.navigate('FileViewer', params);
                } else {
                  navigation.navigate('FileViewer', params);
                }
              }}
            />
          )}
        </ScrollView>

        <ScreenHeader
          title={`${repoInfo.owner}/${repoInfo.repo}`}
          onBack={handleBack}
          actions={
            <TouchableOpacity
              testID="explore.button.branch-picker"
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: colors.primary + '15' }}
              onPress={openBranchPicker}
              activeOpacity={0.7}
            >
              <Ionicons name="git-branch-outline" size={14} color={colors.primary} />
              <Text className="text-xs font-semibold" style={{ color: colors.primary }} numberOfLines={1}>
                {branchLabel}
              </Text>
            </TouchableOpacity>
          }
        />

        <Modal
          visible={branchPickerVisible}
          onRequestClose={closeBranchPicker}
          bottomSheet
          contentStyle={{ maxHeight: 420 }}
        >
          <View className="max-h-[420px]">
            <View
              className="flex-row items-center justify-between px-4 py-3"
              style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '40' }}
            >
              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                {t('notesFilter.branch')}
              </Text>
              <TouchableOpacity
                testID="explore.button.close-branch-picker"
                onPress={closeBranchPicker}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {branchLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: 32 }} />
            ) : branchLoadFailed || branches.length === 0 ? (
              <View className="px-4 py-6 gap-1.5">
                {branchLoadFailed && (
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {t('errors.somethingWrong')}
                  </Text>
                )}
                <Text className="text-sm font-medium" style={{ color: colors.text }}>{branchLabel}</Text>
              </View>
            ) : (
              <FlatList
                data={branches}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => {
                  const isCurrent = item.name === branchLabel;
                  return (
                    <TouchableOpacity
                      testID={`explore.branch.option.${item.name}`}
                      className="flex-row items-center gap-3 px-4 py-3.5"
                      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}
                      onPress={() => handleSelectBranch(item.name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isCurrent ? 'checkmark-circle' : 'git-branch-outline'}
                        size={18}
                        color={isCurrent ? '#34C759' : colors.textSecondary}
                      />
                      <Text className="flex-1 text-sm" style={{ color: colors.text }} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (view === 'prList' && selectedRepo && repoInfo) {
    const prData = prQuery.data ?? [];
    const prIsPermission = (prQuery.error as (Error & { status?: number }) | null)?.status === 403;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        <View style={{ paddingTop: headerHeight }}>
          <OfflineBanner />
        </View>
        <View className="flex-row px-4 py-3 gap-2" style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}>
          {(['open', 'closed'] as StateFilter[]).map((s) => {
            const active = prFilter === s;
            return (
              <TouchableOpacity
                key={s}
                testID={`explore.segmented.state-filter.${s}`}
                onPress={() => setPrFilter(s)}
                className="px-4 py-1.5 rounded-full"
                style={{ backgroundColor: active ? colors.primary : colors.primary + '20' }}
                activeOpacity={0.7}
              >
                <Text style={{ color: active ? '#fff' : colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {s === 'open' ? t('explore.filterOpen') : t('explore.filterClosed')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {prQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : prQuery.isError ? (
          <View className="flex-1">
            <EmptyState
              icon={prIsPermission ? 'lock-closed-outline' : 'cloud-offline-outline'}
              title={prIsPermission ? t('explore.permissionTitle') : t('explore.loadErrorTitle')}
              subtitle={prIsPermission ? t('explore.permissionError') : t('explore.loadError')}
              testID="explore.pr.error-state"
            />
            <View className="px-6 pb-10 gap-2">
              <Button
                label={t('common.retry')}
                variant="primary"
                fullWidth
                onPress={() => prQuery.refetch()}
                leadingIcon={<Ionicons name="refresh" size={18} color="#fff" />}
                testID="explore.pr.button.retry"
              />
              {prIsPermission ? (
                <Button
                  label={t('explore.openSettings')}
                  variant="ghost"
                  fullWidth
                  onPress={() => navigation.navigate('MainTabs', { screen: 'SettingsTab' })}
                  testID="explore.pr.button.open-settings"
                />
              ) : null}
            </View>
          </View>
        ) : prData.length === 0 ? (
          <EmptyState icon="git-pull-request-outline" title={t('explore.noPullRequests')} />
        ) : (
          <FlatList<GitHostPullRequest>
            data={prData}
            keyExtractor={(item) => `${item.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID="explore.pr.row"
                className="flex-row items-start px-4 py-3 gap-3"
                style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}
                onPress={() => Linking.openURL(item.webUrl)}
                activeOpacity={0.7}
              >
                <Ionicons name="git-pull-request-outline" size={18} color={item.state === 'open' ? '#34C759' : colors.textSecondary} />
                <View className="flex-1 gap-0.5">
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }} numberOfLines={2}>
                    #{item.number} {item.title}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    {item.author && (
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{item.author}</Text>
                    )}
                    {item.draft && (
                      <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.textSecondary + '30' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>DRAFT</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity testID="explore.button.open-in-browser" onPress={() => Linking.openURL(item.webUrl)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
        <ScreenHeader title={t('explore.pullRequests')} onBack={handleBack} />
      </SafeAreaView>
    );
  }

  if (view === 'issueList' && selectedRepo && repoInfo) {
    const issueData = issueQuery.data ?? [];
    const issueIsPermission = (issueQuery.error as (Error & { status?: number }) | null)?.status === 403;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        <View style={{ paddingTop: headerHeight }}>
          <OfflineBanner />
        </View>
        <View className="flex-row px-4 py-3 gap-2" style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}>
          {(['open', 'closed'] as StateFilter[]).map((s) => {
            const active = issueFilter === s;
            return (
              <TouchableOpacity
                key={s}
                testID={`explore.segmented.state-filter.${s}`}
                onPress={() => setIssueFilter(s)}
                className="px-4 py-1.5 rounded-full"
                style={{ backgroundColor: active ? colors.primary : colors.primary + '20' }}
                activeOpacity={0.7}
              >
                <Text style={{ color: active ? '#fff' : colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {s === 'open' ? t('explore.filterOpen') : t('explore.filterClosed')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {issueQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : issueQuery.isError ? (
          <View className="flex-1">
            <EmptyState
              icon={issueIsPermission ? 'lock-closed-outline' : 'cloud-offline-outline'}
              title={issueIsPermission ? t('explore.permissionTitle') : t('explore.loadErrorTitle')}
              subtitle={issueIsPermission ? t('explore.permissionError') : t('explore.loadError')}
              testID="explore.issue.error-state"
            />
            <View className="px-6 pb-10 gap-2">
              <Button
                label={t('common.retry')}
                variant="primary"
                fullWidth
                onPress={() => issueQuery.refetch()}
                leadingIcon={<Ionicons name="refresh" size={18} color="#fff" />}
                testID="explore.issue.button.retry"
              />
              {issueIsPermission ? (
                <Button
                  label={t('explore.openSettings')}
                  variant="ghost"
                  fullWidth
                  onPress={() => navigation.navigate('MainTabs', { screen: 'SettingsTab' })}
                  testID="explore.issue.button.open-settings"
                />
              ) : null}
            </View>
          </View>
        ) : issueData.length === 0 ? (
          <EmptyState icon="alert-circle-outline" title={t('explore.noIssues')} />
        ) : (
          <FlatList<GitHostIssue>
            data={issueData}
            keyExtractor={(item) => `${item.id}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID="explore.issue.row"
                className="flex-row items-start px-4 py-3 gap-3"
                style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '30' }}
                onPress={() => Linking.openURL(item.webUrl)}
                activeOpacity={0.7}
              >
                <Ionicons name="alert-circle-outline" size={18} color={item.state === 'open' ? '#34C759' : colors.textSecondary} />
                <View className="flex-1 gap-0.5">
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }} numberOfLines={2}>
                    #{item.number} {item.title}
                  </Text>
                  {item.author && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{item.author}</Text>
                  )}
                </View>
                <TouchableOpacity testID="explore.button.open-in-browser" onPress={() => Linking.openURL(item.webUrl)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
        <ScreenHeader title={t('explore.issues')} onBack={handleBack} />
      </SafeAreaView>
    );
  }

  return null;
}
