import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import type { CommitInfo } from '@/services/git/engine/GitEngine';

const PAGE_SIZE = 50;

const makeCommit = (index: number): CommitInfo => ({
  id: `commit-${index}`,
  message: `Commit ${index}`,
  author: { name: 'Test Author', email: 'test@example.com' },
  timestamp: index,
  shortId: `commit-${index}`,
  summary: `Commit ${index}`,
  authorName: 'Test Author',
  authorEmail: 'test@example.com',
  authorTime: index,
  parentCount: 1,
});

const initialPage = Array.from({ length: PAGE_SIZE }, (_, index) => makeCommit(index));
const repeatedPage = Array.from({ length: PAGE_SIZE }, (_, index) => makeCommit(PAGE_SIZE + index));

jest.mock('expo-file-system', () => ({}));

jest.mock('@/components/ui/flat-list', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  type MockFlatListProps = {
    data: CommitInfo[];
    onEndReached?: () => void;
  };

  return {
    FlatList: ({ data, onEndReached }: MockFlatListProps) => (
      <View>
        <Pressable testID="trigger-load-more" onPress={() => {
          onEndReached?.();
          onEndReached?.();
        }} />
        {data.map((item, index) => (
          <View key={`${item.id}-${index}`} testID={`commit-row-${item.id}`} />
        ))}
      </View>
    ),
  };
});

jest.mock('@/services/git/engine/GitEngine', () => ({
  log: jest.fn(),
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { isCloned: jest.fn() },
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: jest.fn((callback: () => void) => React.useEffect(callback, [callback])),
  };
});

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#ffffff', card: '#f0f0f0', border: '#cccccc',
      text: '#000000', textSecondary: '#666666', accent: '#007AFF',
      success: '#34C759', error: '#FF3B30', warning: '#FF9500',
      elevated: '#e5e5ea',
    },
  }),
}));

jest.mock('@/components/ui/toast', () => ({
  Toast: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ToastDescription: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ToastTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ show: jest.fn() }),
}));

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ButtonText: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CommitsSection } from '@/components/explore/CommitsSection';
import * as GitEngine from '@/services/git/engine/GitEngine';
import { GitFsService } from '@/services/git/GitFsService';

const mockRepo = {
  id: 'test-repo-id',
  path: 'owner/test-repo',
  name: 'test-repo',
  localPath: '/mock/repos/test-repo',
  branch: 'main',
};

describe('CommitsSection pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
    (GitEngine.log as jest.Mock)
      .mockResolvedValueOnce(initialPage)
      .mockResolvedValue(repeatedPage);
  });

  it('does not render duplicate commits when pagination fires twice rapidly', async () => {
    const { getByTestId, getAllByTestId } = render(
      <CommitsSection repo={mockRepo} active={true} onChanged={jest.fn()} status={null} />,
    );

    await waitFor(() => expect(getAllByTestId(/^commit-row-/)).toHaveLength(PAGE_SIZE));

    fireEvent.press(getByTestId('trigger-load-more'));

    await waitFor(() => expect(GitEngine.log).toHaveBeenCalledTimes(2));
    expect(getAllByTestId(/^commit-row-/)).toHaveLength(PAGE_SIZE * 2);
    expect(GitEngine.log).toHaveBeenLastCalledWith(mockRepo.localPath, PAGE_SIZE, PAGE_SIZE);
  });
});
