import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

import PushScreen from '../../src/screens/PushScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockIncrementRevision = jest.fn();

const mockList = jest.fn();
const mockListFiles = jest.fn();
const mockPushPending = jest.fn();
const mockPullFromSingleRepo = jest.fn();

jest.mock('../../src/services/CloneSyncService', () => ({
  CloneSyncService: { pushPending: (...args: unknown[]) => mockPushPending(...args) },
}));

jest.mock('../../src/services/git/UnpushedCommitsService', () => ({
  UnpushedCommitsService: {
    list: (...args: unknown[]) => mockList(...args),
    listFiles: (...args: unknown[]) => mockListFiles(...args),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: (...args: unknown[]) => mockPullFromSingleRepo(...args),
}));

jest.mock('../../src/stores/gitActivityStore', () => ({
  useGitActivityStore: Object.assign(
    jest.fn((selector: () => unknown) => selector()),
    {
      getState: () => ({ incrementRevision: mockIncrementRevision, subscribe: jest.fn(() => jest.fn()) }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

jest.mock('../../src/hooks/useSafeBack', () => ({
  useSafeBack: () => jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { repoPath: '/tmp/test-repo', branch: 'main' } }),
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenHeader: ({
      title,
      actions,
      onBack,
    }: {
      title: string;
      actions?: React.ReactNode;
      onBack?: () => void;
    }) =>
      React.createElement(
        View,
        { testID: 'push.header' },
        React.createElement(Text, null, title),
        actions,
      ),
    useScreenHeaderHeight: () => 60,
  };
});

jest.mock('../../src/components/ui/SafeAreaView', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

const oneCommit = [
  {
    oid: 'abc123',
    subject: 'Add feature',
    author: 'testuser',
    timestamp: Math.floor(Date.now() / 1000) - 300,
    filesChangedCount: 2,
  },
];

describe('PushScreen', () => {
  beforeEach(() => {
    mockList.mockResolvedValue(oneCommit);
    mockListFiles.mockResolvedValue([]);
    mockPushPending.mockReset();
    mockPullFromSingleRepo.mockReset();
    mockIncrementRevision.mockClear();
    mockNavigate.mockClear();
    mockGoBack.mockClear();
  });

  it('renders commit list with Push All button', async () => {
    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Add feature')).toBeTruthy();
    });

    expect(getByText('Push all')).toBeTruthy();
  });

  it('calls CloneSyncService.pushPending on Push All and shows success', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPushPending.mockResolvedValue({ succeeded: 1, failed: 0, conflicted: false, queuedItems: 0 });

    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Push all')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Push all'));
    });

    expect(mockPushPending).toHaveBeenCalledWith('/tmp/test-repo', 'main');
    expect(mockPullFromSingleRepo).toHaveBeenCalledWith('/tmp/test-repo');
    expect(mockIncrementRevision).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Pushed',
      '1 commit(s) pushed to GitHub.',
      expect.any(Array),
    );

    alertSpy.mockRestore();
  });

  it('navigates to Conflicts when pushPending returns conflicted', async () => {
    mockPushPending.mockResolvedValue({ succeeded: 0, failed: 0, conflicted: true, queuedItems: 0 });

    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Push all')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Push all'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Conflicts', {
      repoPath: '/tmp/test-repo',
      branch: 'main',
    });
  });

  it('shows failure alert when all commits fail (succeeded=0, failed>0)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPushPending.mockResolvedValue({ succeeded: 0, failed: 2, conflicted: false, queuedItems: 0 });

    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Push all')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Push all'));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Push partially failed',
      '0 succeeded, 2 failed.',
    );

    alertSpy.mockRestore();
  });

  it('shows failure alert when pushPending throws', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPushPending.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Push all')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Push all'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Push failed', 'Network error');

    alertSpy.mockRestore();
  });

  it('shows generic alert when pushPending returns zero succeeded and zero failed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPushPending.mockResolvedValue({ succeeded: 0, failed: 0, conflicted: false, queuedItems: 0 });

    const { getByText } = render(<PushScreen />);

    await waitFor(() => {
      expect(getByText('Push all')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText('Push all'));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Push failed',
      'No commits were pushed. Check your connection and try again.',
    );

    alertSpy.mockRestore();
  });
});
