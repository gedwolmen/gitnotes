import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockListIssues = jest.fn();
const mockListPullRequests = jest.fn();

jest.mock('@/services/git/HostService', () => ({
  HostService: {
    listIssues: (...args: unknown[]) => mockListIssues(...args),
    listPullRequests: (...args: unknown[]) => mockListPullRequests(...args),
    openUrl: jest.fn(),
  },
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#fff', card: '#eee', border: '#ccc', text: '#111', textSecondary: '#666',
      accent: '#06f', error: '#f00', surfaceSecondary: '#ddd',
    },
  }),
}));

jest.mock('@/components/ui/text', () => ({ Text: require('react-native').Text }));
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable onPress={onPress}>{children}</Pressable>
    ),
    ButtonText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});
jest.mock('@/components/ui/flat-list', () => {
  const { View } = require('react-native');
  return { FlatList: ({ ListHeaderComponent }: { ListHeaderComponent?: React.ReactNode }) => <View>{ListHeaderComponent}</View> };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { IssuesSection } from '../../../src/components/explore/IssuesSection';
import { PullRequestsSection } from '../../../src/components/explore/PullRequestsSection';

const repoWithoutAccountId = {
  id: 'repo-1',
  path: 'owner/repo',
  name: 'repo',
  localPath: 'file:///repo',
  provider: 'github' as const,
};

describe('Explore issue and pull request sections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListIssues.mockResolvedValue({ ok: true, data: [] });
    mockListPullRequests.mockResolvedValue({ ok: true, data: [] });
  });

  it('loads issues without requiring a repository accountId field', async () => {
    render(<IssuesSection repo={repoWithoutAccountId} active status={null} onChanged={jest.fn()} />);

    await waitFor(() => expect(mockListIssues).toHaveBeenCalledWith(repoWithoutAccountId, undefined, 'open'));
  });

  it('loads pull requests without requiring a repository accountId field', async () => {
    render(<PullRequestsSection repo={repoWithoutAccountId} active status={null} onChanged={jest.fn()} />);

    await waitFor(() => expect(mockListPullRequests).toHaveBeenCalledWith(repoWithoutAccountId, undefined, 'open'));
  });
});
