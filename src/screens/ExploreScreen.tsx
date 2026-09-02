import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/Button';
import { SectionTabs } from '@/components/ui/SectionTabs';
import FloatingGitButton from '@/components/git/FloatingGitButton';
import { useGitRepoStatus } from '@/hooks/useGitRepoStatus';
import { useRepoStore } from '@/stores/repoStore';
import { GitFsService } from '@/services/git/GitFsService';
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
import { ComingSoonSection } from '@/components/explore/ComingSoonSection';
import { RepoInfoSection } from '@/components/explore/RepoInfoSection';

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
  const repos = useRepoStore((state) => state.repositories);
  const isLoading = useRepoStore((state) => state.isLoading);
  const loadRepos = useRepoStore((state) => state.loadRepos);

  const [section, setSection] = useState<ExploreSection>('files');

  const repo = useMemo(() => {
    const r = repos[0] ?? null;
    if (!r) return null;
    return {
      ...r,
      localPath: GitFsService.workingTreeUri({ repoPath: r.path }),
    } as RepoLike;
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

  const onChanged = useCallback(() => {
    void refreshStatus();
  }, [refreshStatus]);

  if (!repo) {
    return (
      <SafeAreaView className="flex-1 bg-white" style={{ flex: 1, backgroundColor: '#ffffff' }} testID="explore.empty">
        <View className="flex-row items-center gap-2 border-b border-gray-200 px-4 py-3">
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="explore.back"
          >
            <Ionicons name="chevron-back" size={22} color="#374151" />
          </Pressable>
          <Heading className="text-lg">Explore</Heading>
        </View>
        <View className="flex-1 items-center justify-center px-8" style={{ flex: 1 }}>
          <Ionicons name="git-network-outline" size={48} color="#9ca3af" />
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
    const props = { repo: repoTyped, status, onChanged };
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
        return <ComingSoonSection title="Pull Requests" icon="git-pull-request-outline" todo={26} testID="explore.pulls.soon" />;
      case 'issues':
        return <ComingSoonSection title="Issues" icon="bug-outline" todo={26} testID="explore.issues.soon" />;
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
    <SafeAreaView className="flex-1 bg-white" style={{ flex: 1, backgroundColor: '#ffffff' }} testID="explore.root">
      {/* Per-repo context header */}
      <View className="flex-row items-center gap-2 border-b border-gray-200 px-4 py-2.5">
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="explore.back"
        >
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Heading className="text-lg" numberOfLines={1}>
            {repo.name}
          </Heading>
          <Text className="text-[11px] text-gray-500" numberOfLines={1} testID="explore.header.remote">
            {(repo as RepoLike).remoteUrl ?? repo.path}
          </Text>
        </View>
        {status?.currentBranch && (
          <View className="rounded bg-emerald-100 px-2 py-0.5" testID="explore.header.branch">
            <Text className="text-[11px] font-semibold text-emerald-700">
              {status.currentBranch}
            </Text>
          </View>
        )}
        {status && (
          <View className="rounded bg-gray-100 px-2 py-0.5" testID="explore.header.aheadbehind">
            <Text className="text-[11px] font-semibold text-gray-600">
              ↑{status.ahead} ↓{status.behind}
            </Text>
          </View>
        )}
      </View>

      {/* Section navigator */}
      <SectionTabs
        tabs={EXPLORE_SECTIONS}
        value={section}
        onChange={(id) => setSection(id as ExploreSection)}
        testID="explore.tabs"
      />

      {/* Active section content */}
      <View className="flex-1" style={{ flex: 1 }} testID={`explore.section.${section}`}>
        {renderSection()}
      </View>

      <FloatingGitButton repoId={repo.id} />
    </SafeAreaView>
  );
}
