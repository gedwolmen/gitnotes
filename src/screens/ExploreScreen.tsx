import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
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
import FloatingGitButton from '@/components/git/FloatingGitButton';
import { useGitRepoStatus } from '@/hooks/useGitRepoStatus';
import { useAllReposStatus, type RepoGitState } from '@/hooks/useAllReposStatus';
import { useRepoStore } from '@/stores/repoStore';
import { GitFsService } from '@/services/git/GitFsService';
import * as GitEngine from '@/services/git/engine/GitEngine';
import { GitSyncGate } from '@/services/git/GitSyncGate';
import { AuthService } from '@/services/AuthService';
import { pushWithForce } from '@/services/git/recovery';
import { LastUsedRepoService } from '@/services/LastUsedRepoService';
import {
  commitAll,
  pushAll,
  stageAllPending,
} from '@/services/git/multiRepoGitOps';
import { useActiveAccount } from '@/hooks/useAccounts';
import { Toast, ToastDescription, ToastTitle, useToast } from '@/components/ui/toast';
import type { GitRepository } from '@/services/GitService';
import type { RepoLike } from '@/components/explore/exploreShared';
import type { RootStackParamList } from '@/navigation/types';

import {
  EXPLORE_SECTIONS,
  type ExploreSection,
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
  const { activeAccount } = useActiveAccount();
  const toast = useToast();

  const [section, setSection] = useState<ExploreSection>('files');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  const chromeHeaderHeight = 60;
  const chromeTabsHeight = 40;
  const chromeTotalHeight = insets.top + chromeHeaderHeight + chromeTabsHeight;

  const repo = useMemo(() => {
    const lookupId = selectedRepoId ?? repos[0]?.id ?? null;
    const found = lookupId ? repos.find((r) => r.id === lookupId) : undefined;
    const r = found ?? repos[0] ?? null;
    if (!r) return null;
    return {
      ...r,
      localPath: GitFsService.workingTreeUri({ repoPath: r.path }),
    } as RepoLike;
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
  }, [refreshStatus]);

  /** Decide which section best matches the latest-changed repo's state. */
  const sectionForRepo = useCallback((entry: RepoGitState | undefined): ExploreSection => {
    if (!entry) return 'files';
    if (entry.conflicts) return 'conflicts';
    if (entry.uncommitted > 0) return 'changes';
    if (entry.staged > 0) return 'staging';
    if (entry.ahead > 0) return 'commits';
    return 'files';
  }, []);

  /**
   * Tap on the floating git button: switch to the latest-changed repo and
   * jump to the section that surfaces its current state (changes / staging /
   * commits / conflicts). If everything is clean, this is a no-op.
   */
  const onQuickTap = useCallback(() => {
    const targetRepoId = aggregatedState.latestChangedRepoId ?? repo?.id ?? null;
    if (!targetRepoId) return;
    if (targetRepoId !== repo?.id) {
      setSelectedRepoId(targetRepoId);
    }
    const target = aggregatedState.perRepo.get(targetRepoId);
    setSection(sectionForRepo(target));
  }, [aggregatedState, repo?.id, sectionForRepo]);

  const showToast = useCallback(
    (action: 'success' | 'error', title: string, description?: string) => {
      toast.show({
        placement: 'top',
        duration: 3000,
        render: ({ id }: { id: string }) => (
          <Toast action={action} nativeID={`gitbutton-op-toast-${id}`}>
            <ToastTitle>{title}</ToastTitle>
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </Toast>
        ),
      });
    },
    [toast],
  );

  /** Hold 1/3: stage every changed file across all repos. */
  const onStageAll = useCallback(async () => {
    if (repos.length === 0) return;
    const result = await stageAllPending(repos);
    if (result.failures.length > 0) {
      showToast(
        'error',
        'Stage failed',
        `${result.failures.length} repo${result.failures.length === 1 ? '' : 's'}: ${result.failures.map((f) => f.repoName).join(', ')}`,
      );
    } else if (result.totalActed === 0) {
      showToast('success', 'Nothing to stage', 'All repos are already clean.');
    } else {
      showToast('success', 'Staged', `${result.totalActed} file${result.totalActed === 1 ? '' : 's'} across ${result.outcomes.filter((o) => o.actedCount > 0).length} repo${result.outcomes.filter((o) => o.actedCount > 0).length === 1 ? '' : 's'}.`);
    }
    void refreshStatus();
    void aggregatedState.refresh();
  }, [repos, showToast, refreshStatus, aggregatedState]);

  /** Hold 2/3: commit every staged change across all repos. */
  const onCommitAll = useCallback(async () => {
    if (repos.length === 0) return;
    const author = {
      name: activeAccount?.name ?? 'GitNotes',
      email: activeAccount?.email ?? 'gitnotes@local',
    };
    const message = `chore: sync ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const result = await commitAll(repos, message, author);
    if (result.failures.length > 0) {
      showToast(
        'error',
        'Commit failed',
        result.failures.map((f) => `${f.repoName}: ${f.error ?? 'unknown'}`).slice(0, 2).join(' / '),
      );
    } else if (result.totalActed === 0) {
      showToast('success', 'Nothing to commit', 'No staged changes across any repo.');
    } else {
      showToast('success', 'Committed', `${result.totalActed} commit${result.totalActed === 1 ? '' : 's'} across ${result.outcomes.filter((o) => o.actedCount > 0).length} repo${result.outcomes.filter((o) => o.actedCount > 0).length === 1 ? '' : 's'}.`);
    }
    void refreshStatus();
    void aggregatedState.refresh();
  }, [repos, activeAccount, showToast, refreshStatus, aggregatedState]);

  /** Hold 3/3: push every repo that has unpushed commits. */
  const onPushAll = useCallback(async () => {
    if (repos.length === 0) return;
    const result = await pushAll(repos);
    if (result.failures.length > 0) {
      showToast(
        'error',
        'Push had failures',
        result.failures.map((f) => `${f.repoName}: ${f.error ?? 'unknown'}`).slice(0, 2).join(' / '),
      );
    } else if (result.totalActed === 0) {
      showToast('success', 'Nothing to push', 'All repos are up to date.');
    } else {
      showToast('success', 'Pushed', `${result.totalActed} commit${result.totalActed === 1 ? '' : 's'} across ${result.outcomes.filter((o) => o.actedCount > 0).length} repo${result.outcomes.filter((o) => o.actedCount > 0).length === 1 ? '' : 's'}.`);
    }
    void refreshStatus();
    void aggregatedState.refresh();
  }, [repos, showToast, refreshStatus, aggregatedState]);

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
          <Button className="mt-4" onPress={() => (navigation as any).navigate('AddRepo')} testID="explore.empty.add">
            <ButtonText>Add a repository</ButtonText>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const renderSection = () => {
    const repoTyped = repo as RepoLike;
    const props = { repo: repoTyped, status, onChanged, chromeTopInset: chromeTotalHeight };
    switch (section) {
      case 'files':
        return <FilesSection key={repo.id} {...props} active />;
      case 'changes':
        return <ChangesSection key={repo.id} {...props} active />;
      case 'staging':
        return <StagingSection key={repo.id} {...props} active />;
      case 'commits':
        return <CommitsSection key={repo.id} {...props} active />;
      case 'branches':
        return <BranchesSection key={repo.id} {...props} active />;
      case 'remotes':
        return <RemotesSection key={repo.id} {...props} active />;
      case 'conflicts':
        return <ConflictsSection key={repo.id} {...props} active />;
      case 'pulls':
        return <PullRequestsSection repo={repoTyped} status={status} active={section === 'pulls'} onChanged={onChanged} chromeTopInset={chromeTotalHeight} />;
      case 'issues':
        return <IssuesSection repo={repoTyped} status={status} active={section === 'issues'} onChanged={onChanged} chromeTopInset={chromeTotalHeight} />;
      case 'info':
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
            <RepoInfoSection key={repo.id} {...props} active />
          </ScrollView>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView edges={[]} className="flex-1" style={{ flex: 1, backgroundColor: colors.background }} testID="explore.root">
      <View className="flex-1" style={{ flex: 1 }} testID={`explore.section.${section}`}>
        {renderSection()}
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
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
              {status?.currentBranch && (
                <View className="rounded px-2 py-0.5" style={{ backgroundColor: `${colors.success}26` }} testID="explore.header.branch">
                  <Text className="text-[11px] font-semibold" style={{ color: colors.success }}>
                    {status.currentBranch}
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
            />
            </View>
        </BlurView>
      </View>

      <FloatingGitButton
        aggregatedState={aggregatedState}
        onQuickTap={onQuickTap}
        onStageAll={onStageAll}
        onCommitAll={onCommitAll}
        onPushAll={onPushAll}
      />

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
    </SafeAreaView>
  );
}
