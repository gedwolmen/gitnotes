import { useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useToast, Toast, ToastDescription, ToastTitle } from '@/components/ui/toast';
import { useRepoStore } from '@/stores/repoStore';
import { useAllReposStatus, type RepoGitState } from '@/hooks/useAllReposStatus';
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import { stageAllPending, commitAll, pushAll } from '@/services/git/multiRepoGitOps';
import type { Author } from '@/services/git/engine/GitEngine';
import { useAccounts } from '@/contexts/AccountsContext';
import FloatingGitButton from './FloatingGitButton';
import type { ReleaseSegment } from './useFloatingGitButtonAffordances';
import type { RootStackParamList } from '@/navigation/types';
import type { ExploreSection } from '@/components/explore/exploreShared';

const HINT_SEEN_KEY = '@gitnotes:gitbutton_hint_seen';

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
 *   - the smart-navigate tap: queues a pending action (target repo +
 *     section) and jumps to ExploreTab. ExploreScreen reads the pending
 *     action on focus, applies repo + section, then clears it.
 *
 * Hold-to-release performs git stage/commit/push across all repos.
 * Disabled (grayed out) when nothing is pending anywhere.
 *
 * Hides itself on full-screen modals and the paywall/onboarding so it never
 * floats over content that needs the full viewport.
 */
export default function AppFloatingGitButton({ currentRouteName }: AppFloatingGitButtonProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const repos = useRepoStore((s) => s.repositories);
  const aggregatedState = useAllReposStatus();
  const setPending = useGitButtonActionStore((s) => s.setPending);
  const toast = useToast();
  const hintFiredRef = useRef(false);
  const { accounts, activeAccountId } = useAccounts();

  const author = useMemo<Author | null>(() => {
    const account = accounts.find((a) => a.id === activeAccountId) ?? null;
    if (!account) return null;
    return { name: account.name, email: account.email ?? '' };
  }, [accounts, activeAccountId]);

  const hasAnyAction =
    aggregatedState.totalUncommitted > 0 ||
    aggregatedState.totalStaged > 0 ||
    aggregatedState.totalAhead > 0 ||
    aggregatedState.anyConflicts;
  const isDisabled = !hasAnyAction;

  const handleReleaseSegment = useCallback(
    async (segment: ReleaseSegment) => {
      toast.show({
        placement: 'top',
        duration: 4000,
        render: ({ id }: { id: string }) => (
          <Toast           action="error" nativeID={`gitbutton-debug-${id}`}>
            <ToastTitle>DEBUG: handleReleaseSegment fired</ToastTitle>
            <ToastDescription>
              segment={segment} repos={repos.length} author={author ? 'ok' : 'null'}
            </ToastDescription>
          </Toast>
        ),
      });
      if (repos.length === 0) {
        toast.show({
          placement: 'top',
          duration: 3000,
          render: ({ id }: { id: string }) => (
            <Toast action="error" nativeID={`gitbutton-norepos-${id}`}>
              <ToastTitle>Cannot {segment}</ToastTitle>
              <ToastDescription>No repositories connected. Add a repo in Settings.</ToastDescription>
            </Toast>
          ),
        });
        return;
      }
      if (!author) {
        toast.show({
          placement: 'top',
          duration: 3000,
          render: ({ id }: { id: string }) => (
            <Toast action="error" nativeID={`gitbutton-noauthor-${id}`}>
              <ToastTitle>Cannot commit</ToastTitle>
              <ToastDescription>No active account found. Add an account in Settings.</ToastDescription>
            </Toast>
          ),
        });
        return;
      }

      const stageResult = await stageAllPending(repos);
      if (segment === 'stage') {
        toast.show({
          placement: 'top',
          duration: 2000,
          render: ({ id }: { id: string }) => (
            <Toast action="success" nativeID={`gitbutton-stage-${id}`}>
              <ToastTitle>Staged {stageResult.totalActed} file(s)</ToastTitle>
            </Toast>
          ),
        });
        void aggregatedState.refresh();
        return;
      }

      const message = `Sync: stage ${stageResult.totalActed} file(s)`;
      await commitAll(repos, message, author);
      if (segment === 'commit') {
        toast.show({
          placement: 'top',
          duration: 2000,
          render: ({ id }: { id: string }) => (
            <Toast action="success" nativeID={`gitbutton-commit-${id}`}>
              <ToastTitle>Staged and committed</ToastTitle>
            </Toast>
          ),
        });
        void aggregatedState.refresh();
        return;
      }

      const pushResult = await pushAll(repos);
      const failedCount = pushResult.failures.length;
      if (failedCount === repos.length) {
        toast.show({
          placement: 'top',
          duration: 4000,
          render: ({ id }: { id: string }) => (
            <Toast action="error" nativeID={`gitbutton-push-error-${id}`}>
              <ToastTitle>Push failed</ToastTitle>
              <ToastDescription>
                {pushResult.failures.map((f) => f.repoName).join(', ')}
              </ToastDescription>
            </Toast>
          ),
        });
      } else {
        const pushedCount = repos.length - failedCount;
        toast.show({
          placement: 'top',
          duration: 3000,
          render: ({ id }: { id: string }) => (
            <Toast
              action={failedCount > 0 ? 'error' : 'success'}
              nativeID={`gitbutton-push-${id}`}
            >
              <ToastTitle>
                {failedCount > 0
                  ? `Pushed ${pushedCount} repos, ${failedCount} had conflicts`
                  : `Pushed to ${pushedCount} repos`}
              </ToastTitle>
            </Toast>
          ),
        });
        for (const failure of pushResult.failures) {
          navigation.navigate('ExploreConflict', { repoId: failure.repoId });
        }
      }
      void aggregatedState.refresh();
    },
    [repos, author, toast, aggregatedState, navigation],
  );

  /**
   * First-use discoverability hint. When the user first encounters the
   * button with something pending, show a long-duration toast that explains
   * the tap. Persists `seen` in AsyncStorage so it only fires once.
   */
  useEffect(() => {
    if (hintFiredRef.current || !hasAnyAction) return;
    hintFiredRef.current = true;
    let cancelled = false;
    void AsyncStorage.getItem(HINT_SEEN_KEY).then((seen) => {
      if (cancelled || seen === 'true') return;
      toast.show({
        placement: 'top',
        duration: 6000,
        render: ({ id }: { id: string }) => (
          <Toast action="success" nativeID={`gitbutton-hint-toast-${id}`}>
            <ToastTitle>Tip: tap the git button</ToastTitle>
            <ToastDescription>
              It jumps straight to your pending changes, staged files, or unpushed commits.
            </ToastDescription>
          </Toast>
        ),
      });
      void AsyncStorage.setItem(HINT_SEEN_KEY, 'true').catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAnyAction, toast]);

  // All hooks must run before this conditional return — the route name
  // changes while the component stays mounted, and an early return before a
  // hook would change the hook count between renders.
  const onQuickTap = useCallback(() => {
    if (aggregatedState.anyConflicts) {
      const conflictRepoId = Array.from(aggregatedState.perRepo.entries()).find(
        ([, entry]) => entry.conflicts,
      )?.[0];
      if (!conflictRepoId) return;
      navigation.navigate('ExploreConflict', { repoId: conflictRepoId });
      return;
    }
    if (aggregatedState.totalAhead > 0) {
      const aheadRepoId = Array.from(aggregatedState.perRepo.entries()).find(([, entry]) => entry.ahead > 0)?.[0]
        ?? aggregatedState.latestChangedRepoId
        ?? repos[0]?.id;
      if (!aheadRepoId) return;
      setPending({ repoId: aheadRepoId, section: 'commits' });
      navigation.navigate('MainTabs', { screen: 'ExploreTab' });
      return;
    }
    const targetRepoId = aggregatedState.latestChangedRepoId ?? repos[0]?.id ?? null;
    if (!targetRepoId) return;
    const section = targetSectionFor(aggregatedState.perRepo.get(targetRepoId));
    if (!section) return;
    setPending({ repoId: targetRepoId, section });
    navigation.navigate('MainTabs', { screen: 'ExploreTab' });
  }, [aggregatedState, repos, setPending, navigation]);

  if (currentRouteName && HIDDEN_ROUTES.has(currentRouteName)) return null;

  return (
    <FloatingGitButton
      aggregatedState={aggregatedState}
      onQuickTap={onQuickTap}
      onReleaseSegment={handleReleaseSegment}
      disabled={isDisabled}
      currentRouteName={currentRouteName}
    />
  );
}

/**
 * Section the tap should jump to, by urgency: conflicts > uncommitted
 * changes > staged > unpushed commits. Null when the entry is missing or
 * has nothing pending (button is disabled in that case).
 */
function targetSectionFor(entry: RepoGitState | undefined): ExploreSection | null {
  if (!entry) return null;
  if (entry.conflicts) return 'conflicts' as const;
  if (entry.uncommitted > 0) return 'changes' as const;
  if (entry.staged > 0) return 'staging' as const;
  if (entry.ahead > 0) return 'commits' as const;
  return null;
}
