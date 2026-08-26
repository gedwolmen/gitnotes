import React from 'react';
import { act } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import { FloatingPushButton } from '../src/components/git/FloatingPushButton';
import { useGitOperationStore, gitOperationRegistry } from '../src/stores/gitOperationStore';

const REPO = 'owner/repo';
const BRANCH = 'main';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../src/stores/repoStore', () => ({
  useRepoStore: (selector: (s: { repositories: Array<{ path: string; branch: string }> }) => unknown) =>
    selector({ repositories: [{ path: 'owner/repo', branch: 'main' }] }),
}));

jest.mock('../src/stores/gitActivityStore', () => ({
  useGitActivityStore: Object.assign(
    jest.fn(() => ({ commitRevision: 0, incrementRevision: jest.fn() })),
    { subscribe: jest.fn(() => jest.fn()) },
  ),
}));

jest.mock('../src/services/LastUsedRepoService', () => ({
  LastUsedRepoService: { get: jest.fn(async () => REPO) },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'clone') },
}));

jest.mock('../src/services/git/UnpushedCommitsService', () => ({
  UnpushedCommitsService: {
    count: jest.fn(async () => 0),
    list: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: { push: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => undefined) },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(async () => undefined),
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    getAll: jest.fn(async () => []),
    subscribe: jest.fn(() => () => {}),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
  },
}));

jest.mock('../src/components/ai/useFloatingAIButtonAffordances', () => ({
  FLOATING_AI_BUTTON_LONG_PRESS_MS: 500,
  useFloatingAIButtonAffordances: () => ({
    pressProgress: { value: 0 },
    holdProgress: { value: 0 },
    handlePressIn: jest.fn(),
    handlePressOut: jest.fn(),
    handleHoldComplete: jest.fn(),
  }),
}));

jest.mock('../src/components/ui/HoldProgressRing', () => ({
  HoldProgressRing: () => null,
}));

jest.mock('../src/components/ui/TabBar', () => ({
  useTabBarHeight: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('FloatingPushButton in-flight feedback', () => {
  beforeEach(() => {
    useGitOperationStore.setState({ ops: {} });
  });

  it('renders the cloud-upload icon when nothing is in flight and no real commits exist', async () => {
    const { queryByTestId } = renderWithTheme(<FloatingPushButton />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryByTestId('floating-push.spinner')).toBeNull();
  });

  it('shows optimistic count + spinner when an upsert op is running for the active repo+branch', async () => {
    const { queryByTestId, findByTestId } = renderWithTheme(<FloatingPushButton />);
    await act(async () => {
      gitOperationRegistry.begin({
        kind: 'upsert',
        repo: REPO,
        branch: BRANCH,
        path: 'notes/x.md',
        entityIds: [],
        status: 'running',
        attempts: 0,
      });
      await Promise.resolve();
    });

    const spinner = await findByTestId('floating-push.spinner');
    expect(spinner).toBeTruthy();
    expect(queryByTestId('floating-push.button.navigate-push')).toBeTruthy();
  });

  it('drops the spinner once the in-flight op succeeds', async () => {
    const opId = gitOperationRegistry.begin({
      kind: 'upsert',
      repo: REPO,
      branch: BRANCH,
      path: 'notes/x.md',
      entityIds: [],
      status: 'running',
      attempts: 0,
    });

    const { queryByTestId, findByTestId } = renderWithTheme(<FloatingPushButton />);
    await findByTestId('floating-push.spinner');

    await act(async () => {
      gitOperationRegistry.succeed(opId);
      await Promise.resolve();
    });

    expect(queryByTestId('floating-push.spinner')).toBeNull();
  });

  it('ignores ops that are not for the active repo or branch', async () => {
    const { queryByTestId } = renderWithTheme(<FloatingPushButton />);
    await act(async () => {
      gitOperationRegistry.begin({
        kind: 'upsert',
        repo: 'someone/else',
        branch: BRANCH,
        path: 'notes/x.md',
        entityIds: [],
        status: 'running',
        attempts: 0,
      });
      await Promise.resolve();
    });

    expect(queryByTestId('floating-push.spinner')).toBeNull();
  });

  it('ignores push/pull ops (they are tracked but not commit-in-flight flags)', async () => {
    const { queryByTestId } = renderWithTheme(<FloatingPushButton />);
    await act(async () => {
      gitOperationRegistry.begin({
        kind: 'push',
        repo: REPO,
        branch: BRANCH,
        path: undefined,
        entityIds: [],
        status: 'running',
        attempts: 0,
      });
      await Promise.resolve();
    });

    expect(queryByTestId('floating-push.spinner')).toBeNull();
  });
});