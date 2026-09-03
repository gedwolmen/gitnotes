import { useCallback } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useToast } from '@/components/ui/toast';
import { Toast, ToastDescription, ToastTitle } from '@/components/ui/toast';
import { useRepoStore } from '@/stores/repoStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAllReposStatus } from '@/hooks/useAllReposStatus';
import {
  commitAll,
  pushAll,
  stageAllPending,
} from '@/services/git/multiRepoGitOps';
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import FloatingGitButton from './FloatingGitButton';
import type { RootStackParamList } from '@/navigation/types';

interface AppFloatingGitButtonProps {
  /** Name of the current top-level route — used to hide the button on full-screen modals. */
  currentRouteName?: string;
}

const HIDDEN_ROUTES = new Set<string>([
  'Paywall',
  'Onboarding',
  'NoteEditor',
  'CanvasEditor',
  'PdfViewer',
  'FileViewer',
  'ImageViewer',
  'VideoViewer',
  'ChatScreen',
  'ChatThreadList',
  'ConflictResolve',
  'Stage',
  'GraphView',
]);

/**
 * App-level wrapper around `FloatingGitButton`. Owns:
 *   - the aggregated per-repo state from `useAllReposStatus`
 *   - the multi-repo stage/commit/push operations (toast feedback)
 *   - the smart-navigate behavior: queues a pending action (target repo +
 *     section) and jumps to ExploreTab. `navigate('MainTabs', { screen:
 *     'ExploreTab' })` is a no-op when already on Explore, so the same
 *     call works for both cases; ExploreScreen reads the pending action on
 *     focus.
 *
 * Hides itself on full-screen modals and the paywall/onboarding so it never
 * floats over content that needs the full viewport.
 */
export default function AppFloatingGitButton({ currentRouteName }: AppFloatingGitButtonProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const repos = useRepoStore((s) => s.repositories);
  const { activeAccount } = useActiveAccount();
  const aggregatedState = useAllReposStatus();
  const setPending = useGitButtonActionStore((s) => s.setPending);
  const toast = useToast();

  if (currentRouteName && HIDDEN_ROUTES.has(currentRouteName)) return null;

  const showToast = useCallback(
    (action: 'success' | 'error', title: string, description?: string) => {
      toast.show({
        placement: 'top',
        duration: 3000,
        render: ({ id }: { id: string }) => (
          <Toast action={action} nativeID={`gitbutton-app-toast-${id}`}>
            <ToastTitle>{title}</ToastTitle>
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </Toast>
        ),
      });
    },
    [toast],
  );

  const onQuickTap = useCallback(() => {
    const targetRepoId = aggregatedState.latestChangedRepoId ?? repos[0]?.id ?? null;
    if (!targetRepoId) return;
    const target = aggregatedState.perRepo.get(targetRepoId);
    const section = targetSectionFor(target);
    setPending({ repoId: targetRepoId, section });
    navigation.navigate('MainTabs', { screen: 'ExploreTab' });
  }, [aggregatedState, repos, setPending, navigation]);

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
      const reposTouched = result.outcomes.filter((o) => o.actedCount > 0).length;
      showToast('success', 'Staged', `${result.totalActed} file${result.totalActed === 1 ? '' : 's'} across ${reposTouched} repo${reposTouched === 1 ? '' : 's'}.`);
    }
    void aggregatedState.refresh();
  }, [repos, showToast, aggregatedState]);

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
      const reposTouched = result.outcomes.filter((o) => o.actedCount > 0).length;
      showToast('success', 'Committed', `${result.totalActed} commit${result.totalActed === 1 ? '' : 's'} across ${reposTouched} repo${reposTouched === 1 ? '' : 's'}.`);
    }
    void aggregatedState.refresh();
  }, [repos, activeAccount, showToast, aggregatedState]);

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
      const reposTouched = result.outcomes.filter((o) => o.actedCount > 0).length;
      showToast('success', 'Pushed', `${result.totalActed} commit${result.totalActed === 1 ? '' : 's'} across ${reposTouched} repo${reposTouched === 1 ? '' : 's'}.`);
    }
    void aggregatedState.refresh();
  }, [repos, showToast, aggregatedState]);

  return (
    <FloatingGitButton
      aggregatedState={aggregatedState}
      onQuickTap={onQuickTap}
      onStageAll={onStageAll}
      onCommitAll={onCommitAll}
      onPushAll={onPushAll}
    />
  );
}

function targetSectionFor(entry: { conflicts: boolean; uncommitted: number; staged: number; ahead: number } | undefined) {
  if (!entry) return 'files' as const;
  if (entry.conflicts) return 'conflicts' as const;
  if (entry.uncommitted > 0) return 'changes' as const;
  if (entry.staged > 0) return 'staging' as const;
  if (entry.ahead > 0) return 'commits' as const;
  return 'files' as const;
}