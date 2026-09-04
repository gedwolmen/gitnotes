import { useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useToast, Toast, ToastDescription, ToastTitle } from '@/components/ui/toast';
import { useRepoStore } from '@/stores/repoStore';
import { useAllReposStatus, type RepoGitState } from '@/hooks/useAllReposStatus';
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import FloatingGitButton from './FloatingGitButton';
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
 * App-level wrapper around `FloatingGitButton` — purely informational
 * (issue #1330). Owns:
 *   - the aggregated per-repo state from `useAllReposStatus`
 *   - the smart-navigate tap: queues a pending action (target repo +
 *     section) and jumps to ExploreTab. ExploreScreen reads the pending
 *     action on focus, applies repo + section, then clears it.
 *
 * The button performs no git operations itself and is disabled (grayed out)
 * when nothing is pending anywhere.
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

  const hasAnyAction =
    aggregatedState.totalUncommitted > 0 ||
    aggregatedState.totalStaged > 0 ||
    aggregatedState.totalAhead > 0 ||
    aggregatedState.anyConflicts;
  const isDisabled = !hasAnyAction;

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
    // Blue button (totalAhead > 0) always navigates to commits tab
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
