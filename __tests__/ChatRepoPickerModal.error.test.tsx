import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'flat',
  }),
}));

const mockSetChatRepo = jest.fn(async () => undefined);

jest.mock('../src/stores/repoStore', () => ({
  useRepoStore: (selector: any) => {
    const state = {
      repositories: [
        { name: 'owner/repo-a', path: 'owner/repo-a' },
        { name: 'owner/repo-b', path: 'owner/repo-b' },
      ],
    };
    return selector(state);
  },
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => {
    const state = { setChatRepo: mockSetChatRepo };
    return selector(state);
  },
}));

jest.mock('../src/components/SearchBar', () => {
  const { View } = require('react-native');
  return () => <View />;
});

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    selection: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockInitializeChatStorage = jest.fn();
jest.mock('../src/services/ChatStorageService', () => ({
  initializeChatStorage: (...args: unknown[]) => mockInitializeChatStorage(...args),
}));

jest.mock('../src/components/ui', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
    Button: ({ children, onPress, disabled, testID }: any) => (
      <Pressable testID={testID} onPress={disabled ? undefined : onPress} disabled={disabled}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Surface: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('../src/services/GitService', () => ({
  GitService: {
    getBranches: jest.fn(async () => [
      { name: 'main', isCurrent: true },
      { name: 'develop', isCurrent: false },
    ]),
  },
}));

import { ChatRepoPickerModal } from '../src/components/ai/ChatRepoPickerModal';

describe('ChatRepoPickerModal init error recovery (issue #655)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInitializeChatStorage.mockReset();
    mockSetChatRepo.mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('shows error row + keeps modal open when initializeChatStorage throws', async () => {
    mockInitializeChatStorage.mockRejectedValueOnce(new Error('Network Error'));
    const onSelected = jest.fn();
    const onClose = jest.fn();

    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <ChatRepoPickerModal visible onClose={onClose} onSelected={onSelected} />,
    );

    fireEvent.press(getAllByTestId('chat-repo-picker.button.select-repo')[0]);
    await act(async () => {
      fireEvent.press(getByTestId('chat-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(getByTestId('chat-repo-picker.text.error')).toBeTruthy();
    });

    expect(queryByTestId('chat-repo-picker.button.confirm')).toBeTruthy();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const errorText = getByTestId('chat-repo-picker.text.error');
    expect(errorText.props.children).toMatch(/Network Error|couldn't|failed/i);
  });

  test('retry succeeds after first failure → onSelected fires', async () => {
    mockInitializeChatStorage
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(undefined);
    const onSelected = jest.fn();

    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <ChatRepoPickerModal visible onClose={() => {}} onSelected={onSelected} />,
    );

    fireEvent.press(getAllByTestId('chat-repo-picker.button.select-repo')[0]);
    await act(async () => {
      fireEvent.press(getByTestId('chat-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(getByTestId('chat-repo-picker.text.error')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('chat-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(onSelected).toHaveBeenCalledTimes(1);
    });
    expect(queryByTestId('chat-repo-picker.text.error')).toBeNull();
  });

  test('changing branch clears the error', async () => {
    mockInitializeChatStorage.mockRejectedValueOnce(new Error('Network Error'));

    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <ChatRepoPickerModal visible onClose={() => {}} onSelected={() => {}} />,
    );

    fireEvent.press(getAllByTestId('chat-repo-picker.button.select-repo')[0]);
    await act(async () => {
      fireEvent.press(getByTestId('chat-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(getByTestId('chat-repo-picker.text.error')).toBeTruthy();
    });

    fireEvent.press(getByTestId('chat-repo-picker.button.select-branch'));
    const developBranch = await waitFor(() => getByTestId('chat-repo-picker.button.branch-develop'));
    fireEvent.press(developBranch);

    expect(queryByTestId('chat-repo-picker.text.error')).toBeNull();
  });
});
