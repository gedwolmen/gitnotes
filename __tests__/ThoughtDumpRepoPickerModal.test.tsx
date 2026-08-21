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

let mockRepositories: Array<{ name: string; path: string }> = [
  { name: 'owner/repo-a', path: 'owner/repo-a' },
  { name: 'owner/repo-b', path: 'owner/repo-b' },
];

const mockAddRepository = jest.fn(async () => ({ id: 'new', name: 'new', path: 'new' }));

jest.mock('../src/stores/repoStore', () => ({
  useRepoStore: (selector: any) => {
    const state = {
      repositories: mockRepositories,
      addRepository: mockAddRepository,
    };
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

const mockSetPreference = jest.fn(async () => undefined);
const mockGetPreference = jest.fn(async () => null);

jest.mock('../src/services/ThoughtDumpRepoPreferenceService', () => ({
  ThoughtDumpRepoPreferenceService: {
    set: (...args: unknown[]) => mockSetPreference(...args),
    get: (...args: unknown[]) => mockGetPreference(...args),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/services/LastUsedRepoService', () => ({
  LastUsedRepoService: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

import { ThoughtDumpRepoPickerModal } from '../src/components/thoughts/ThoughtDumpRepoPickerModal';

describe('ThoughtDumpRepoPickerModal', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRepositories = [
      { name: 'owner/repo-a', path: 'owner/repo-a' },
      { name: 'owner/repo-b', path: 'owner/repo-b' },
    ];
    mockSetPreference.mockReset();
    mockSetPreference.mockResolvedValue(undefined);
    mockGetPreference.mockReset();
    mockGetPreference.mockResolvedValue(null);
    mockAddRepository.mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('renders added repositories', () => {
    const { getAllByTestId, getByText } = render(
      <ThoughtDumpRepoPickerModal visible onClose={() => {}} onSelected={() => {}} />,
    );

    expect(getAllByTestId('thought-dump-repo-picker.button.select-repo')).toHaveLength(2);
    expect(getByText('owner/repo-a')).toBeTruthy();
    expect(getByText('owner/repo-b')).toBeTruthy();
  });

  test('tapping a repo loads branches and shows the branch row', async () => {
    const { getAllByTestId, getByTestId, getByText } = render(
      <ThoughtDumpRepoPickerModal visible onClose={() => {}} onSelected={() => {}} />,
    );

    fireEvent.press(getAllByTestId('thought-dump-repo-picker.button.select-repo')[0]);

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker.button.select-branch')).toBeTruthy();
    });

    // Defaults to the current branch ('main') from the mocked getBranches.
    expect(getByText('main')).toBeTruthy();
  });

  test('selecting a branch and confirming calls set + onSelected with (repoPath, branch)', async () => {
    const onSelected = jest.fn();
    const { getAllByTestId, getByTestId } = render(
      <ThoughtDumpRepoPickerModal visible onClose={() => {}} onSelected={onSelected} />,
    );

    fireEvent.press(getAllByTestId('thought-dump-repo-picker.button.select-repo')[0]);

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker.button.select-branch')).toBeTruthy();
    });

    fireEvent.press(getByTestId('thought-dump-repo-picker.button.select-branch'));

    const developBranch = await waitFor(() => getByTestId('thought-dump-repo-picker.button.branch-develop'));
    fireEvent.press(developBranch);

    await act(async () => {
      fireEvent.press(getByTestId('thought-dump-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(mockSetPreference).toHaveBeenCalledWith('owner/repo-a', 'develop');
      expect(onSelected).toHaveBeenCalledWith('owner/repo-a', 'develop');
    });
  });

  test('a rejected set shows the error row and Retry works', async () => {
    mockSetPreference
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(undefined);
    const onSelected = jest.fn();

    const { getAllByTestId, getByTestId, queryByTestId } = render(
      <ThoughtDumpRepoPickerModal visible onClose={() => {}} onSelected={onSelected} />,
    );

    fireEvent.press(getAllByTestId('thought-dump-repo-picker.button.select-repo')[0]);

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker.button.select-branch')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId('thought-dump-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker.text.error')).toBeTruthy();
    });

    expect(queryByTestId('thought-dump-repo-picker.button.confirm')).toBeTruthy();
    expect(onSelected).not.toHaveBeenCalled();

    const errorText = getByTestId('thought-dump-repo-picker.text.error');
    expect(errorText.props.children).toMatch(/Network Error|couldn't|failed/i);

    await act(async () => {
      fireEvent.press(getByTestId('thought-dump-repo-picker.button.confirm'));
    });

    await waitFor(() => {
      expect(onSelected).toHaveBeenCalledTimes(1);
    });
    expect(queryByTestId('thought-dump-repo-picker.text.error')).toBeNull();
  });

  test('not-authenticated + no repos shows the connect-account state', () => {
    mockRepositories = [];
    const onGoToSettings = jest.fn();

    const { getByText, getByTestId } = render(
      <ThoughtDumpRepoPickerModal
        visible
        onClose={() => {}}
        onSelected={() => {}}
        onGoToSettings={onGoToSettings}
      />,
    );

    expect(getByText('Connect your GitHub account in Settings to choose a repository.')).toBeTruthy();
    const goSettings = getByTestId('thought-dump-repo-picker.button.go-settings');
    fireEvent.press(goSettings);
    expect(onGoToSettings).toHaveBeenCalled();
  });
});
