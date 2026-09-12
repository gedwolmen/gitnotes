import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { Modal } from '@/components/ui/Modal';
import { useGitRepoStatus } from '@/hooks/useGitRepoStatus';
import { useAllReposStatus } from '@/hooks/useAllReposStatus';
import { useRepoStore } from '@/stores/repoStore';
import { GitFsService } from '@/services/git/GitFsService';
import { GitSyncGate } from '@/services/git/GitSyncGate';
import { pushWithForce } from '@/services/git/recovery';
import { AuthService } from '@/services/AuthService';

import { LastUsedRepoService } from '@/services/LastUsedRepoService';
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import { useGitContentRefreshSignal } from '@/hooks/useGitRefreshEvent';
import type { GitRepository } from '@/services/GitService';
import type { RepoLike } from '@/components/explore/exploreShared';
import type { RootStackParamList } from '@/navigation/types';
import {
  EXPLORE_SECTIONS,
  type ExploreSection,
  type SectionProps,
} from '@/components/explore/exploreShared';
import { FilesSection } from '@/components/explore/FilesSection';
import { ChangesSection } from '@/components/explore/ChangesSection';
import { StagingSection } from '@/components/explore/StagingSection';
import { CommitsSection } from '@/components/explore/CommitsSection';
import { BranchesSection } from '@/components/explore/BranchesSection';
import { RemotesSection } from '@/components/explore/RemotesSection';
import { ConflictsSection } from '@/components/explore/ConflictsSection';
import { RepoInfoSection } from '@/components/explore/RepoInfoSection';
import { IssuesSection } from '@/components/explore/IssuesSection';
import { PullRequestsSection } from '@/components/explore/PullRequestsSection';
import { useTheme, useTokens } from '@/contexts/ThemeContext';
import { CheckoutSafetyProvider } from '@/contexts/CheckoutSafetyContext';
import { getActiveBranch } from '@/services/git/activeBranchStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const EXPLORE_TAB_ROW_HEIGHT = 44;

/**
 * Explore workspace shell (todo 23): the Git-client surface hosting every
 * workspace section — Files, Changes, Staging, Commits, Branches, Remotes,
 * Conflicts, Pull Requests, Issues, Repo Info — behind a gluestack tab row
 * with a per-repo context header (name, branch, ahead/behind, remote).
 * All data comes from the Rust git2 engine; PR/Issue REST lands in todo 26.
 */
export default function ExploreScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isDark } = useTheme();
  const { colors } = useTokens();
  const insets = useSafeAreaInsets();
  const repos = useRepoStore((state) => state.repositories);
  const isLoading = useRepoStore((state) => state.isLoading);
  const loadRepos = useRepoStore((state) => state.loadRepos);
  const aggregatedState = useAllReposStatus();
  const gitContentRefresh = useGitContentRefreshSignal();
  const pendingGitButtonAction = useGitButtonActionStore((state) => state.pending);

  const [section, setSection] = useState<ExploreSection>('files');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  const [chromeTotalHeight, setChromeTotalHeight] = useState(insets.top + 60 + EXPLORE_TAB_ROW_HEIGHT);

  // Centralized branch state
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [branchInvalidationKey] = useState(0);

  const repo = useMemo(() => {
    const lookupId = selectedRepoId ?? repos[0]?.id ?? null;
    const found = lookupId ? repos.find((r) => r.id === lookupId) : undefined;
    const r = found ?? repos[0] ?? null;
    if (!r) return null;
    try {
      return {
        ...r,
        localPath: GitFsService.workingTreeUri({ repoPath: r.path }),
      } as RepoLike;
    } catch {
      return null;
    }
  }, [repos, selectedRepoId]);

  const handlePickRepo = useCallback((picked: GitRepository) => {
    setSelectedRepoId(picked.id);
    setShowRepoPicker(false);
    void LastUsedRepoService.set(picked.path);
  }, []);

  const hasHydratedLastUsedRef = useRef(false);
  useEffect(() => {
    if (hasHydratedLastUsedRef.current) return;
    if (repos.length === 0) return;
    hasHydratedLastUsedRef.current = true;
    void LastUsedRepoService.get().then((lastPath) => {
      if (!lastPath) return;
      const match = repos.find((r) => r.path === lastPath);
      if (match) setSelectedRepoId(match.id);
    });
  }, [repos]);

  const { status, refresh: refreshStatus } = useGitRepoStatus(
    repo?.id ?? null,
    repo?.path ?? null,
  );

  useFocusEffect(
    useCallback(() => {
      if (isLoading) void loadRepos();
      void refreshStatus();
    }, [isLoading, loadRepos, refreshStatus]),
  );

  // Sync activeBranch from status when it loads so the store is populated
  useEffect(() => {
    if (!repo?.id || !status?.currentBranch) return;
    setActiveBranch(status.currentBranch);
  }, [repo?.id, status?.currentBranch]);

  // Load branch from activeBranchStore on mount / repo change
  useEffect(() => {
    if (!repo?.id) return;
    void getActiveBranch(repo.id).then((state) => {
      if (state?.activeBranch) setActiveBranch(state.activeBranch);
    });
  }, [repo?.id]);

  // Auto-push idle timer: if unpushed commits exist and last push was >3 min ago, push silently in background.
  const lastPushTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!repo) return;

    const tryAutoPush = async () => {
      if (GitSyncGate.isCycleHeld()) return;
      if (!status || status.ahead <= 0) return;
      if (Date.now() - lastPushTimeRef.current <= 180_000) return;

      const token = await AuthService.getToken();
      if (!token) return;

      try {
        await pushWithForce({
          repoPath: repo.path,
          branch: status.currentBranch ?? 'main',
          token,
        });
        lastPushTimeRef.current = Date.now();
      } catch {
        // Silently ignore push errors — will retry on next interval.
      }
    };

    const interval = setInterval(tryAutoPush, 60_000);

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        lastPushTimeRef.current = Date.now();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [repo, status]);

  const onChanged = useCallback(() => {
    void refreshStatus();
    if (repo?.id) {
      void getActiveBranch(repo.id).then((state) => {
        if (state?.activeBranch) setActiveBranch(state.activeBranch);
      });
    }
  }, [repo?.id, refreshStatus]);

  /**
   * The floating git button is rendered at the app level. When the user
   * taps it from any screen, the app-level wrapper sets a pending action
   * (target repo + section) and navigates here. On mount or update we apply it:
   *   - swap the active repo if it changed
   *   - jump the section tab to whatever surfaces the repo's current state
   *     (changes / staging / commits / conflicts / files)
   * Then clear the pending action so a normal re-render doesn't re-apply it.
   */
  useEffect(() => {
    if (!pendingGitButtonAction) return;
    if (pendingGitButtonAction.repoId !== repo?.id) {
      setSelectedRepoId(pendingGitButtonAction.repoId);
    }
    setSection(pendingGitButtonAction.section);
    useGitButtonActionStore.getState().clear();
  }, [pendingGitButtonAction, repo?.id]);

  if (!repo) {
    return (
      <SafeAreaView className="flex-1" style={{ flex: 1, backgroundColor: colors.background }} testID="explore.empty">
        <View className="flex-row items-center gap-2 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="explore.back"
          >
            <Ionicons name="chevron-back" size={22} style={{ color: colors.text }} />
          </Pressable>
          <Heading className="text-lg" style={{ color: colors.text }}>Git</Heading>
        </View>
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="git-network-outline" size={48} color={colors.textSecondary} />
          <Text className="mt-3 text-center text-muted-foreground">
            No repository to explore yet. Add a remote repository to clone it into your
            library, then open its workspace here.
          </Text>
          <Button className="mt-4" onPress={() => navigation.navigate('MainTabs', { screen: 'SettingsTab' })} testID="explore.empty.add">
            <ButtonText>Add a repository</ButtonText>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const renderSection = () => {
    const sectionKey = `${repo?.id ?? ''}:${gitContentRefresh}:${branchInvalidationKey}`;
    const repoTyped = repo as RepoLike;
    const props: SectionProps = {
      repo: repoTyped,
      status,
      onChanged,
      chromeTopInset: chromeTotalHeight + 8,
      onNavigate: setSection,
      refreshStatus,
      branchInvalidationKey,
    };
    switch (section) {
      case 'files':
        return <FilesSection key={sectionKey} {...props} active />;
      case 'changes':
        return <ChangesSection key={sectionKey} {...props} active />;
      case 'staging':
        return <StagingSection key={sectionKey} {...props} active />;
      case 'commits':
        return <CommitsSection key={sectionKey} {...props} active />;
      case 'branches':
        return <BranchesSection key={sectionKey} {...props} active />;
      case 'remotes':
        return <RemotesSection key={sectionKey} {...props} active />;
      case 'conflicts':
        return <ConflictsSection key={sectionKey} {...props} active />;
      case 'pulls':
        return <PullRequestsSection key={sectionKey} repo={repoTyped} status={status} active={section === 'pulls'} onChanged={onChanged} chromeTopInset={chromeTotalHeight + 8} />;
      case 'issues':
        return <IssuesSection key={sectionKey} repo={repoTyped} status={status} active={section === 'issues'} onChanged={onChanged} chromeTopInset={chromeTotalHeight + 8} />;
      case 'info':
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
            <RepoInfoSection key={sectionKey} {...props} active />
          </ScrollView>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ flex: 1, backgroundColor: colors.background }} testID="explore.root">
      <CheckoutSafetyProvider>
      <View className="flex-1" style={{ flex: 1 }} testID={`explore.section.${section}`}>
        {renderSection()}
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        onLayout={(event: LayoutChangeEvent) => {
          if (event.nativeEvent?.layout) {
            setChromeTotalHeight((currentHeight) => Math.max(currentHeight, event.nativeEvent.layout.height));
          }
        }}
      >
        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={{ overflow: 'hidden' }}>
            <View style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center gap-2 px-4 py-2.5" testID="explore.header">
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                testID="explore.back"
              >
                <Ionicons name="chevron-back" size={22} style={{ color: colors.text }} />
              </Pressable>
              {repos.length > 1 ? (
                <TouchableOpacity
                  className="min-w-0 flex-1"
                  onPress={() => setShowRepoPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch repository. Current: ${repo.name}`}
                  testID="explore.header.repo-picker"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Heading
                    className="text-base font-semibold"
                    style={{ color: colors.text, flexShrink: 1 }}
                    numberOfLines={1}
                    testID="explore.header.repo-name"
                  >
                    {repo.name}
                  </Heading>
                  <Ionicons name="chevron-down" size={14} style={{ color: colors.textSecondary }} />
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.textSecondary, flexShrink: 1 }}
                    numberOfLines={1}
                    testID="explore.header.remote"
                  >
                    {(repo as RepoLike).remoteUrl ?? repo.path}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="min-w-0 flex-1">
                  <Heading
                    className="text-base font-semibold"
                    style={{ color: colors.text }}
                    numberOfLines={1}
                    testID="explore.header.repo-name"
                  >
                    {repo.name}
                  </Heading>
                  <Text className="text-[11px]" style={{ color: colors.textSecondary }} numberOfLines={1} testID="explore.header.remote">
                    {(repo as RepoLike).remoteUrl ?? repo.path}
                  </Text>
                </View>
              )}
              {activeBranch && (
                <View className="rounded px-2 py-0.5" style={{ backgroundColor: `${colors.success}26` }} testID="explore.header.branch">
                  <Text className="text-[11px] font-semibold" style={{ color: colors.success }}>
                    {activeBranch}
                  </Text>
                </View>
              )}
              {status && (
                <View className="rounded px-2 py-0.5" testID="explore.header.aheadbehind" style={{ backgroundColor: colors.surfaceSecondary }}>
                  <Text className="text-[11px] font-semibold" style={{ color: colors.textSecondary }}>
                    ↑{status.ahead} ↓{status.behind}
                  </Text>
                </View>
              )}
            </View>
            </View>
            <View
              style={{
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
            <SectionTabs
              tabs={EXPLORE_SECTIONS}
              value={section}
              onChange={(id) => setSection(id as ExploreSection)}
              testID="explore.tabs"
              renderLabel={(tab) => {
                if (tab.shortLabel && Dimensions.get('window').width < 400) {
                  return tab.shortLabel;
                }
                return tab.label;
              }}
            />
            </View>
        </BlurView>
      </View>

      <Modal
        visible={showRepoPicker}
        onRequestClose={() => setShowRepoPicker(false)}
        bottomSheet
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}
        >
          <Heading className="text-base font-semibold" style={{ color: colors.text }}>Switch Repository</Heading>
          <TouchableOpacity
            onPress={() => setShowRepoPicker(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="explore.repo-picker.close"
          >
            <Ionicons name="close" size={22} style={{ color: colors.textSecondary }} />
          </TouchableOpacity>
        </View>
        <View testID="explore.repo-picker.modal">
          <FlatList
            data={repos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 16 }}
            style={{ maxHeight: 480 }}
            renderItem={({ item }) => {
              const isSelected = item.id === repo.id;
              const entry = aggregatedState.perRepo.get(item.id);
              return (
                <TouchableOpacity
                  onPress={() => handlePickRepo(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${item.name}`}
                  testID={`explore.repo-picker.item-${item.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                    backgroundColor: isSelected ? `${colors.success}1A` : 'transparent',
                  }}
                >
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'folder-outline'}
                    size={20}
                    style={{ color: isSelected ? colors.success : colors.primary }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: isSelected ? colors.success : colors.text }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text
                      className="text-xs"
                      style={{ color: colors.textSecondary, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {item.path}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {entry?.conflicts && (
                      <View
                        testID={`explore.repo-picker.badge.conflicts-${item.id}`}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${colors.error}22`,
                        }}
                      >
                        <Text className="text-[10px] font-semibold" style={{ color: colors.error }}>
                          conflict
                        </Text>
                      </View>
                    )}
                    {entry && entry.uncommitted > 0 && (
                      <View
                        testID={`explore.repo-picker.badge.changes-${item.id}`}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${colors.success}22`,
                        }}
                      >
                        <Text className="text-[10px] font-semibold" style={{ color: colors.success }}>
                          {entry.uncommitted} change{entry.uncommitted === 1 ? '' : 's'}
                        </Text>
                      </View>
                    )}
                    {entry && entry.staged > 0 && (
                      <View
                        testID={`explore.repo-picker.badge.staged-${item.id}`}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${colors.success}33`,
                        }}
                      >
                        <Text className="text-[10px] font-semibold" style={{ color: colors.success }}>
                          {entry.staged} staged
                        </Text>
                      </View>
                    )}
                    {entry && entry.ahead > 0 && (
                      <View
                        testID={`explore.repo-picker.badge.push-${item.id}`}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${colors.primary}22`,
                        }}
                      >
                        <Text className="text-[10px] font-semibold" style={{ color: colors.primary }}>
                          {entry.ahead}↑
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
      </CheckoutSafetyProvider>
    </SafeAreaView>
  );
}
