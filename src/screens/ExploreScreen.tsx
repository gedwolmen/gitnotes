import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useRepos } from '../contexts/RepoContext';
import { GitRepository } from '../services/GitService';
import { HapticService } from '../utils/haptics';
import { parseRepoPath } from '../utils/gitPathParser';
import RepoFileTree, { TreeNode } from '../components/RepoFileTree';
import { RootStackParamList } from '../navigation/types';
import { ScreenHeader } from '../components/ui';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import SearchBar from '../components/SearchBar';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'webm']);

function classifyFile(name: string): 'pdf' | 'image' | 'video' | 'text' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'text';
}

type ExploreView = 'repoList' | 'repoDetail' | 'fileTree';

export default function ExploreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { repositories: repos, refreshRepos } = useRepos();
  const [view, setView] = useState<ExploreView>('repoList');
  const [selectedRepo, setSelectedRepo] = useState<GitRepository | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    if (refreshing) return;
    setRefreshing(true);
    if (view === 'repoList') {
      refreshRepos().then(() => setRefreshing(false));
    } else {
      setRefreshing(false);
    }
  }, [view, refreshRepos, refreshing]);

  const renderRepoItem = useCallback(
    ({ item }: { item: GitRepository }) => (
      <TouchableOpacity
        style={[s.repoItem, { borderBottomColor: colors.border + '30' }]}
        onPress={() => handleSelectRepo(item)}
        activeOpacity={0.7}
      >
        <Ionicons name="git-branch" size={20} color={colors.primary} style={s.itemIcon} />
        <View style={s.repoInfo}>
          <Text style={[s.repoName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[s.repoPath, { color: colors.textSecondary }]} numberOfLines={1}>
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
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ScreenHeader title="Explore" />
        <OfflineBanner />
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <SearchBar
            value={repoSearch}
            onChangeText={setRepoSearch}
            placeholder="Search repositories…"
          />
        </View>
        {loadingRepos ? (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading repos…</Text>
          </View>
        ) : filteredRepos.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons name="git-branch-outline" size={48} color={colors.textSecondary} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>
              {repos.length === 0 ? 'No repositories' : 'No matches'}
            </Text>
            <Text style={[s.emptySubtext, { color: colors.textSecondary }]}>
              {repos.length === 0 ? 'Add a repo in Settings to get started' : 'Try a different search'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredRepos}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderRepoItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
          />
        )}
      </SafeAreaView>
    );
  }

  if (view === 'repoDetail' && selectedRepo) {
    const parsed = parseRepoPath(selectedRepo.path);

    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <ScreenHeader title={selectedRepo.name} onBack={handleBack} />
        <OfflineBanner />

        <View style={[s.detailCard, { backgroundColor: colors.surface, borderColor: colors.border + '30' }]}>
          <View style={s.detailTop}>
            <View style={[s.detailIconWrap, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="git-branch" size={28} color={colors.primary} />
            </View>
            <View style={s.detailInfo}>
              <Text style={[s.detailName, { color: colors.text }]} numberOfLines={1}>
                {parsed ? `${parsed.owner}/${parsed.repo}` : selectedRepo.name}
              </Text>
              <Text style={[s.detailPath, { color: colors.textSecondary }]} numberOfLines={1}>
                {selectedRepo.path}
              </Text>
            </View>
          </View>

          {selectedRepo.branch && (
            <View style={s.detailMeta}>
              <Ionicons name="git-branch-outline" size={14} color={colors.textSecondary} />
              <Text style={[s.detailMetaText, { color: colors.textSecondary }]}>
                {selectedRepo.branch}
              </Text>
            </View>
          )}
        </View>

        <View style={s.detailActions}>
          <TouchableOpacity
            style={[s.fileTreeButton, { backgroundColor: colors.primary }]}
            onPress={handleOpenFileTree}
            activeOpacity={0.8}
          >
            <Ionicons name="folder-open-outline" size={20} color="#fff" />
            <Text style={s.fileTreeButtonText}>Browse Files</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'fileTree' && repoInfo) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[s.header, { borderBottomColor: colors.border + '40' }]}>
          <TouchableOpacity onPress={handleBack} style={s.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.primary} />
          </TouchableOpacity>
          <View style={[s.repoSelector, { backgroundColor: colors.surface }]}>
            <Ionicons name="git-branch" size={16} color={colors.primary} />
            <Text style={[s.repoSelectorText, { color: colors.text }]} numberOfLines={1}>
              {repoInfo.owner}/{repoInfo.repo}
            </Text>
          </View>
          <View style={s.headerBtnPlaceholder} />
        </View>
        <OfflineBanner />

        <ScrollView
          style={[s.treeScroll, { backgroundColor: colors.background }]}
          contentContainerStyle={[s.treeContent, { backgroundColor: colors.background }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
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
              } else {
                navigation.navigate('FileViewer', params);
              }
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', flex: 1 },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerBtnPlaceholder: { width: 36 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  itemIcon: { marginRight: 12 },
  repoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repoInfo: { flex: 1, gap: 2 },
  repoName: { fontSize: 15, fontWeight: '500' },
  repoPath: { fontSize: 13 },
  repoSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  repoSelectorText: { flex: 1, fontSize: 14, fontWeight: '500' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptySubtext: { fontSize: 14, textAlign: 'center' },

  detailCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailInfo: {
    flex: 1,
    gap: 3,
  },
  detailName: {
    fontSize: 17,
    fontWeight: '600',
  },
  detailPath: {
    fontSize: 13,
  },
  detailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  detailMetaText: {
    fontSize: 13,
  },

  detailActions: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  fileTreeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  fileTreeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  treeScroll: {
    flex: 1,
  },
  treeContent: {
    paddingBottom: 32,
  },
});
