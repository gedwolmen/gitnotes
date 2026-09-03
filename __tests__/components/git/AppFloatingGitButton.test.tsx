import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockNavigate = jest.fn();
const mockToastShow = jest.fn();
const mockRepos: { id: string; name: string; path: string }[] = [
  { id: 'r1', name: 'r1', path: 'owner/r1' },
];

let mockAggregate: ReturnType<typeof aggregate> | null = null;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (s: {
    repositories: { id: string; name: string; path: string }[];
    isLoading: boolean;
  }) => unknown) => selector({ repositories: mockRepos, isLoading: false }),
}));

jest.mock('@/hooks/useAllReposStatus', () => ({
  useAllReposStatus: () => mockAggregate,
}));

jest.mock('@/components/ui/toast', () => {
  const View = require('react-native').View;
  return {
    useToast: () => ({ show: mockToastShow }),
    Toast: ({ children }: any) => <View>{children}</View>,
    ToastTitle: ({ children }: any) => <View>{children}</View>,
    ToastDescription: ({ children }: any) => <View>{children}</View>,
  };
});

// Probe in place of the real FloatingGitButton: exposes the disabled prop
// and forwards taps so the app wrapper's activation + navigation logic can
// be asserted without reanimated/gesture plumbing.
jest.mock('@/components/git/FloatingGitButton', () => {
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ disabled, onQuickTap }: { disabled: boolean; onQuickTap: () => void }) => (
      <Pressable
        testID="gitbutton.probe"
        onPress={onQuickTap}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        <Text testID="gitbutton.probe.state">{disabled ? 'disabled' : 'enabled'}</Text>
      </Pressable>
    ),
  };
});

import AppFloatingGitButton from '@/components/git/AppFloatingGitButton';
import { useGitButtonActionStore } from '@/stores/gitButtonActionStore';
import type { AggregatedGitState, RepoGitState } from '@/hooks/useAllReposStatus';

function repoState(overrides: Partial<RepoGitState> = {}): RepoGitState {
  return {
    repoId: 'r1',
    repoPath: 'owner/r1',
    uncommitted: 0,
    staged: 0,
    ahead: 0,
    behind: 0,
    currentBranch: 'main',
    conflicts: false,
    loading: false,
    sampledAt: 1000,
    ...overrides,
  };
}

function aggregate(overrides: Partial<AggregatedGitState> = {}): AggregatedGitState {
  return {
    perRepo: new Map([['r1', repoState()]]),
    totalUncommitted: 0,
    totalStaged: 0,
    totalAhead: 0,
    anyConflicts: false,
    anyBusy: false,
    latestChangedRepoId: null,
    mode: 'clean',
    refresh: jest.fn(),
    ...overrides,
  };
}

function probeDisabled(getByTestId: (id: string) => any): boolean {
  return getByTestId('gitbutton.probe').props.accessibilityState.disabled === true;
}

describe('AppFloatingGitButton — activation (hasAnyAction)', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockToastShow.mockClear();
    useGitButtonActionStore.setState({ pending: null });
    mockAggregate = aggregate();
    await AsyncStorage.setItem('@gitnotes:gitbutton_hint_seen', 'true');
  });

  it('disables the button when every repo is clean', () => {
    const { getByTestId } = render(<AppFloatingGitButton />);
    expect(probeDisabled(getByTestId)).toBe(true);
  });

  it('enables the button when uncommitted changes exist', () => {
    mockAggregate = aggregate({
      totalUncommitted: 2,
      latestChangedRepoId: 'r1',
      mode: 'changes',
      perRepo: new Map([['r1', repoState({ uncommitted: 2 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    expect(probeDisabled(getByTestId)).toBe(false);
  });

  it('enables the button when staged changes exist', () => {
    mockAggregate = aggregate({
      totalStaged: 1,
      latestChangedRepoId: 'r1',
      mode: 'changes',
      perRepo: new Map([['r1', repoState({ staged: 1 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    expect(probeDisabled(getByTestId)).toBe(false);
  });

  it('enables the button when unpushed commits exist', () => {
    mockAggregate = aggregate({
      totalAhead: 3,
      latestChangedRepoId: 'r1',
      mode: 'push',
      perRepo: new Map([['r1', repoState({ ahead: 3 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    expect(probeDisabled(getByTestId)).toBe(false);
  });

  it('enables the button when conflicts exist', () => {
    mockAggregate = aggregate({
      anyConflicts: true,
      latestChangedRepoId: 'r1',
      mode: 'conflicts',
      perRepo: new Map([['r1', repoState({ conflicts: true })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    expect(probeDisabled(getByTestId)).toBe(false);
  });
});

describe('AppFloatingGitButton — tap targets the right Explore section', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockToastShow.mockClear();
    useGitButtonActionStore.setState({ pending: null });
    mockAggregate = aggregate();
    await AsyncStorage.setItem('@gitnotes:gitbutton_hint_seen', 'true');
  });

  it('uncommitted changes queue the "changes" section and navigate to ExploreTab', () => {
    mockAggregate = aggregate({
      totalUncommitted: 1,
      latestChangedRepoId: 'r1',
      mode: 'changes',
      perRepo: new Map([['r1', repoState({ uncommitted: 1 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toEqual({ repoId: 'r1', section: 'changes' });
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'ExploreTab' });
  });

  it('staged-only state queues the "staging" section', () => {
    mockAggregate = aggregate({
      totalStaged: 2,
      latestChangedRepoId: 'r1',
      mode: 'changes',
      perRepo: new Map([['r1', repoState({ staged: 2 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toEqual({ repoId: 'r1', section: 'staging' });
  });

  it('ahead-only state queues the "commits" section', () => {
    mockAggregate = aggregate({
      totalAhead: 1,
      latestChangedRepoId: 'r1',
      mode: 'push',
      perRepo: new Map([['r1', repoState({ ahead: 1 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toEqual({ repoId: 'r1', section: 'commits' });
  });

  it('conflicts outrank changes: queues the "conflicts" section', () => {
    mockAggregate = aggregate({
      totalUncommitted: 4,
      anyConflicts: true,
      latestChangedRepoId: 'r1',
      mode: 'conflicts',
      perRepo: new Map([['r1', repoState({ uncommitted: 4, conflicts: true })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toEqual({ repoId: 'r1', section: 'conflicts' });
  });

  it('falls back to the first repo when no repo stands out', () => {
    mockAggregate = aggregate({
      totalUncommitted: 1,
      latestChangedRepoId: null,
      perRepo: new Map([['r1', repoState({ uncommitted: 1 })]]),
    });
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toEqual({ repoId: 'r1', section: 'changes' });
  });

  it('clean state neither queues an action nor navigates', () => {
    const { getByTestId } = render(<AppFloatingGitButton />);
    fireEvent.press(getByTestId('gitbutton.probe'));
    expect(useGitButtonActionStore.getState().pending).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('AppFloatingGitButton — route hiding and hook order', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockToastShow.mockClear();
    useGitButtonActionStore.setState({ pending: null });
    mockAggregate = aggregate();
    await AsyncStorage.setItem('@gitnotes:gitbutton_hint_seen', 'true');
  });

  it('renders nothing on full-screen modal routes', () => {
    const { toJSON } = render(<AppFloatingGitButton currentRouteName="NoteEditor" />);
    expect(toJSON()).toBeNull();
  });

  it('survives hidden → visible route transitions (hook order regression)', () => {
    const view = render(<AppFloatingGitButton currentRouteName="NoteEditor" />);
    expect(view.toJSON()).toBeNull();
    view.rerender(<AppFloatingGitButton currentRouteName="Home" />);
    expect(view.getByTestId('gitbutton.probe')).toBeTruthy();
  });

  it('survives visible → hidden route transitions (hook order regression)', () => {
    const view = render(<AppFloatingGitButton currentRouteName="Home" />);
    expect(view.getByTestId('gitbutton.probe')).toBeTruthy();
    view.rerender(<AppFloatingGitButton currentRouteName="NoteEditor" />);
    expect(view.toJSON()).toBeNull();
  });
});

describe('AppFloatingGitButton — first-use hint toast', () => {
  beforeEach(async () => {
    mockNavigate.mockClear();
    mockToastShow.mockClear();
    useGitButtonActionStore.setState({ pending: null });
    mockAggregate = aggregate();
    await AsyncStorage.clear();
  });

  it('shows the hint once when something is pending and the hint was never seen', async () => {
    mockAggregate = aggregate({
      totalUncommitted: 1,
      latestChangedRepoId: 'r1',
      mode: 'changes',
      perRepo: new Map([['r1', repoState({ uncommitted: 1 })]]),
    });
    render(<AppFloatingGitButton />);
    await waitFor(() => expect(mockToastShow).toHaveBeenCalledTimes(1));
  });

  it('does not show the hint when everything is clean', async () => {
    render(<AppFloatingGitButton />);
    await act(async () => undefined);
    expect(mockToastShow).not.toHaveBeenCalled();
  });
});
