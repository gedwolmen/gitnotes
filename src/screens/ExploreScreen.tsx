import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { GitRepository } from '../services/GitService';
import { HapticService } from '../utils/haptics';
import { parseRepoPath } from '../utils/gitPathParser';
import { GitSyncGate } from '../services/git/GitSyncGate';
import { useGitOperationStore, hasActivePull } from '../stores/gitOperationStore';
import RepoFileTree, { TreeNode } from '../components/RepoFileTree';
import { treeStyles } from '../components/repo/repoTreeStyles';
import { RootStackParamList } from '../navigation/types';
import { EmptyState, ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';
import { SafeAreaView } from '../components/ui/SafeAreaView';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import SearchBar from '../components/SearchBar';
import { useTranslation } from 'react-i18next';

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

type ExploreView = 'repoList' | 'repoDetail' | 'fileTree';

export default function ExploreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { repositories: repos, refreshRepos } = useRepos();
  const [view, setView] = useState<ExploreView>('repoList');
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const isFocused = useIsFocused();

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
    setView('repoDetail');
  }, []);

  const handleOpenFileTree = useCallback(() => {
    HapticService.medium();
    setView('fileTree');
  }, []);

  const handleBack = useCallback(() => {
    HapticService.light();
    if (view === 'fileTree') {
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
            <View className="flex-row items-center gap-1.5 mt-3 pt-3 border-t" style={{ borderTopColor: 'rgba(150,150,150,0.2)', borderWidth: StyleSheet.hairlineWidth }}>
              <Ionicons name="git-branch-outline" size={14} color={colors.textSecondary} />
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                {selectedRepo.branch}
              </Text>
            </View>
          )}
        </View>

        <View className="px-4 mt-6">
          <TouchableOpacity
            testID="explore.button.open-file-tree"
            className="flex-row items-center justify-center py-3.5 rounded-md gap-2"
            style={{ backgroundColor: colors.primary }}
            onPress={handleOpenFileTree}
            activeOpacity={0.8}
          >
            <Ionicons name="folder-open-outline" size={20} color="#fff" />
            <Text className="text-white text-base font-semibold">{t('explore.browseFiles')}</Text>
          </TouchableOpacity>
        </View>
        <ScreenHeader title={selectedRepo.name} onBack={handleBack} />
      </SafeAreaView>
    );
  }

  if (view === 'fileTree' && repoInfo) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['top', 'bottom']}>
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
              branch={selectedRepo?.branch}
              onFilePress={(node: TreeNode) => {
                const kind = classifyFile(node.name);
                const params = {
                  owner: repoInfo.owner,
                  repo: repoInfo.repo,
                  branch: selectedRepo?.branch,
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

        <ScreenHeader title={`${repoInfo.owner}/${repoInfo.repo}`} onBack={handleBack} />
      </SafeAreaView>
    );
  }

  return null;
}
