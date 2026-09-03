import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

const mockStage = jest.fn(async () => undefined);
const mockStatuses = jest.fn(async () => [
  { path: 'notes.md', status: 'Modified', staged: false },
  { path: 'todo.md', status: 'Added', staged: true },
]);

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#000',
      card: '#222',
      border: '#444',
      accent: '#09f',
      text: '#fff',
      textSecondary: '#aaa',
      success: '#0f0',
      error: '#f00',
    },
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { isCloned: jest.fn(async () => true) },
}));

jest.mock('../../../src/services/git/engine/GitEngine', () => ({
  __esModule: true,
  statuses: mockStatuses,
  diffFile: jest.fn(async () => null),
  stage: mockStage,
  unstage: jest.fn(async () => undefined),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  __esModule: true,
  statuses: jest.fn(async () => [
    { path: 'notes.md', status: 'Modified', staged: false },
    { path: 'todo.md', status: 'Added', staged: true },
  ]),
  diffFile: jest.fn(async () => null),
  stage: jest.fn(async () => undefined),
  unstage: jest.fn(async () => undefined),
}));

jest.mock('@/components/explore/DiffLineList', () => ({
  DiffLineList: () => null,
  previewLines: (lines: unknown[]) => lines,
}));

jest.mock('@/components/ui/flat-list', () => {
  const { FlatList } = require('react-native');
  return { FlatList };
});

jest.mock('@/components/ui/Button', () => {
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    Button: ({ children, onPress, testID, disabled }: { children: React.ReactNode; onPress?: () => void; testID?: string; disabled?: boolean }) => (
      <MockPressable testID={testID} onPress={onPress} disabled={disabled}>{children}</MockPressable>
    ),
    ButtonText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>,
  };
});

jest.mock('@/components/explore/CommitComposer', () => ({
  CommitComposer: ({ testID }: { testID?: string }) => {
    const { View: MockView } = require('react-native');
    return <MockView testID={testID ?? 'explore.commit-composer'} />;
  },
}));

jest.mock('@/components/ui/Modal', () => {
  const { View: MockView } = require('react-native');
  return {
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <MockView>{children}</MockView> : null,
  };
});

jest.mock('@/components/ui/text', () => {
  const { Text: MockText } = require('react-native');
  return { Text: MockText };
});

import { StagingSection } from '../../../src/components/explore/StagingSection';

describe('StagingSection commit popup', () => {
  it('opens the commit popup from the staging header', async () => {
    const screen = render(
      <StagingSection
        repo={{ id: 'repo', path: 'owner/repo', name: 'repo', localPath: '/repo' }}
        status={null}
        active
        onChanged={jest.fn()}
        chromeTopInset={96}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('explore.staging.commit-open')).toBeTruthy());
    fireEvent.press(screen.getByTestId('explore.staging.commit-open'));

    expect(screen.getByTestId('explore.commit-composer')).toBeTruthy();
  });
});
