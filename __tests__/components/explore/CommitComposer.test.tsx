import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

jest.mock('@/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    accounts: [{ id: 'a1', name: 'Test User', email: 'test@example.com' }],
    activeAccountId: 'a1',
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  __esModule: true,
  stage: jest.fn(async () => undefined),
  commit: jest.fn(async () => ({ shortId: 'abc1234', summary: 'test' })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => (key === 'common.clear' ? 'Clear' : key) }),
}));

jest.mock('@/components/ui/Button', () => {
  const { Pressable: MockPressable, Text: MockText } = require('react-native');
  return {
    Button: ({ children, onPress, testID, disabled, accessibilityLabel }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <MockPressable testID={testID} onPress={onPress} disabled={disabled} accessibilityLabel={accessibilityLabel}>
        {children}
      </MockPressable>
    ),
    ButtonText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>,
  };
});

jest.mock('@/components/ui/text', () => {
  const { Text: MockText } = require('react-native');
  return { Text: MockText, ButtonText: MockText };
});

jest.mock('@/components/ui/heading', () => {
  const { Text: MockText } = require('react-native');
  return { Heading: MockText };
});

jest.mock('@/components/ui/textarea', () => {
  const { TextInput: MockTextInput } = require('react-native');
  return {
    TextareaInput: (props: import('react-native').TextInputProps) => <MockTextInput {...props} />,
  };
});

jest.mock('@/components/ui/Input', () => {
  const { forwardRef } = require('react');
  const { TextInput: MockTextInput } = require('react-native');
  return {
    InputField: forwardRef((props: import('react-native').TextInputProps, ref: import('react').Ref<import('react-native').TextInput>) => (
      <MockTextInput ref={ref} {...props} />
    )),
  };
});

import { CommitComposer } from '../../../src/components/explore/CommitComposer';
import * as GitEngine from '../../../src/services/git/engine/GitEngine';
import type { RepoLike } from '../../../src/components/explore/exploreShared';
import type { FileStatus } from '../../../src/services/git/engine/GitEngine';

const stageMock = jest.mocked(GitEngine.stage);
const commitMock = jest.mocked(GitEngine.commit);

const REPO: RepoLike = { id: 'repo', path: 'owner/repo', name: 'repo', localPath: '/repo' };
const MESSAGE_INPUT = 'explore.commit-composer.message.input';
const CLEAR_BUTTON = 'explore.commit-composer.clear';

function renderComposer(statuses: FileStatus[]) {
  return render(
    <CommitComposer
      repo={REPO}
      changedPaths={statuses.map((entry) => entry.path)}
      statuses={statuses}
      stagedCount={statuses.filter((entry) => entry.staged === true).length}
      onCommitted={() => undefined}
    />,
  );
}

describe('CommitComposer commit message draft', () => {
  beforeEach(() => {
    stageMock.mockClear();
    commitMock.mockClear();
  });

  it('auto-fills the message input with the drafted statuses', () => {
    const screen = renderComposer([
      { path: 'todo.md', status: 'Added', staged: true },
      { path: 'notes.md', status: 'Modified', staged: false },
    ]);
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('Add: todo.md\nEdit: notes.md');
  });

  it('keeps user-typed text when statuses change', () => {
    const screen = renderComposer([{ path: 'todo.md', status: 'Added', staged: true }]);
    const input = screen.getByTestId(MESSAGE_INPUT);
    fireEvent.changeText(input, 'my own message');
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('my own message');

    screen.rerender(
      <CommitComposer
        repo={REPO}
        changedPaths={['other.md']}
        statuses={[{ path: 'other.md', status: 'Modified', staged: true }]}
        stagedCount={1}
        onCommitted={() => undefined}
      />,
    );
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('my own message');
  });

  it('clears the message with the Clear button and dismisses future drafts', () => {
    const screen = renderComposer([{ path: 'todo.md', status: 'Added', staged: true }]);
    expect(screen.getByTestId(CLEAR_BUTTON)).toBeTruthy();

    fireEvent.press(screen.getByTestId(CLEAR_BUTTON));
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('');
    expect(screen.queryByTestId(CLEAR_BUTTON)).toBeNull();

    screen.rerender(
      <CommitComposer
        repo={REPO}
        changedPaths={['later.md']}
        statuses={[{ path: 'later.md', status: 'Modified', staged: true }]}
        stagedCount={1}
        onCommitted={() => undefined}
      />,
    );
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('');
    expect(screen.queryByTestId(CLEAR_BUTTON)).toBeNull();
  });

  it('leaves the message empty when statuses are empty', () => {
    const screen = renderComposer([]);
    expect(screen.getByTestId(MESSAGE_INPUT).props.value).toBe('');
    expect(screen.queryByTestId(CLEAR_BUTTON)).toBeNull();
  });

  it('stages all changes and commits with the drafted message', async () => {
    const screen = renderComposer([
      { path: 'todo.md', status: 'Added', staged: false },
      { path: 'notes.md', status: 'Modified', staged: false },
    ]);
    fireEvent.press(screen.getByTestId('explore.commit-composer.stage-all-commit'));

    await waitFor(() => {
      expect(stageMock).toHaveBeenCalledWith('/repo', ['todo.md', 'notes.md']);
    });
    await waitFor(() => {
      expect(commitMock).toHaveBeenCalledWith('/repo', 'Add: todo.md\nEdit: notes.md', {
        name: 'Test User',
        email: 'test@example.com',
      });
    });
  });
});
