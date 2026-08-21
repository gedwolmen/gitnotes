import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import ThoughtDumpScreen from '../src/screens/ThoughtDumpScreen';
import { ThoughtDumpService } from '../src/services/ThoughtDumpService';
import { StorageService } from '../src/services/StorageService';
import { ThoughtDumpRepoPreferenceService } from '../src/services/ThoughtDumpRepoPreferenceService';
import { LastUsedRepoService } from '../src/services/LastUsedRepoService';
import { GitHubService } from '../src/services/GitHubService';
import type { ThoughtDump } from '../src/models/ThoughtDump';

jest.mock('../src/services/ThoughtDumpService', () => ({
  ThoughtDumpService: {
    create: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('../src/services/ThoughtDumpRepoPreferenceService', () => ({
  ThoughtDumpRepoPreferenceService: {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../src/services/LastUsedRepoService', () => ({
  LastUsedRepoService: {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(),
  },
}));

jest.mock('../src/components/thoughts/ThoughtDumpRepoPickerModal', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const ThoughtDumpRepoPickerModal = ({ visible, onClose, onSelected, onGoToSettings }: any) =>
    visible ? (
      <View testID="thought-dump-repo-picker-modal">
        <TouchableOpacity
          testID="repo-picker-modal.on-selected"
          onPress={() => onSelected('owner/repo', 'main')}
        >
          <Text>select</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="repo-picker-modal.on-close" onPress={onClose}>
          <Text>close</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="repo-picker-modal.on-go-to-settings" onPress={onGoToSettings}>
          <Text>settings</Text>
        </TouchableOpacity>
      </View>
    ) : null;
  return { ThoughtDumpRepoPickerModal };
});

jest.mock('../src/services/ai/thoughtDumpIndexing', () => ({
  indexDump: jest.fn(),
  removeDump: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true, navigate: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (cb: () => unknown) => React.useEffect(cb),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/components/VoiceInputModal', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onClose }: any) =>
      visible ? (
        <View testID="voice-input-modal">
          <TouchableOpacity testID="voice-input-modal.button.close-unavailable" onPress={onClose}>
            <Text>close</Text>
          </TouchableOpacity>
          <Text>Voice Input Modal Mock</Text>
        </View>
      ) : null,
  };
});

jest.mock('../src/components/list/SwipeableListItem', () => {
  const React = require('react');
  const { TouchableOpacity, View } = require('react-native');
  const SwipeableListItem = ({ itemId, selected, selectionMode, onToggleSelect, children }: any) => (
    <View testID={`swipeable-${itemId}`} accessibilityState={{ selected }}>
      <TouchableOpacity
        testID={`swipeable-list-item.button.toggle-${itemId}`}
        onPress={onToggleSelect}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
  return { __esModule: true, default: SwipeableListItem, SwipeableListItem };
});

jest.mock('../src/components/list/BulkActionBar', () => {
  const React = require('react');
  const { TouchableOpacity, View, Text } = require('react-native');
  const BulkActionBar = ({ count, onCancel, onDelete, itemNoun }: any) =>
    count === 0 ? null : (
      <View testID="bulk-action-bar.container">
        <TouchableOpacity testID="bulk-action-bar.button.cancel" onPress={onCancel}>
          <Text>cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="bulk-action-bar.button.delete" onPress={onDelete}>
          <Text>{`delete ${count} ${itemNoun}s`}</Text>
        </TouchableOpacity>
      </View>
    );
  return { __esModule: true, default: BulkActionBar, BulkActionBar };
});

jest.mock('../src/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      text: '#111',
      textSecondary: '#666',
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
  }),
}));

jest.mock('../src/components/ui', () => {
  const React = require('react');
  const { View, TextInput, TouchableOpacity, Text } = require('react-native');

  const ScreenHeader = ({ title }: any) => (
    <View testID="screen-header">
      <Text>{title}</Text>
    </View>
  );

  const Button = ({ testID, label, onPress, disabled }: any) => (
    <TouchableOpacity testID={testID} onPress={onPress} disabled={disabled}>
      <Text>{label}</Text>
    </TouchableOpacity>
  );

  const Input = ({ testID, value, onChangeText, placeholder, multiline }: any) => (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      multiline={multiline}
    />
  );

  const EmptyState = ({ title, subtitle }: any) => (
    <View testID="empty-state">
      <Text>{title}</Text>
      {subtitle ? <Text>{subtitle}</Text> : null}
    </View>
  );

  const Modal = ({ visible, children, onRequestClose }: any) =>
    visible ? (
      <View testID="modal">
        <TouchableOpacity testID="modal-backdrop" onPress={onRequestClose}>
          <Text>backdrop</Text>
        </TouchableOpacity>
        {children}
      </View>
    ) : null;

  const useScreenHeaderHeight = () => 56;

  return { ScreenHeader, Button, Input, EmptyState, Modal, useScreenHeaderHeight };
});

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const mockCreate = ThoughtDumpService.create as jest.MockedFunction<typeof ThoughtDumpService.create>;
const mockList = ThoughtDumpService.list as jest.MockedFunction<typeof ThoughtDumpService.list>;
const mockDelete = ThoughtDumpService.delete as jest.MockedFunction<typeof ThoughtDumpService.delete>;
const mockGetSavedRepositories = StorageService.getSavedRepositories as jest.MockedFunction<typeof StorageService.getSavedRepositories>;
const mockGetPreference = ThoughtDumpRepoPreferenceService.get as jest.MockedFunction<typeof ThoughtDumpRepoPreferenceService.get>;
const mockGetLastUsed = LastUsedRepoService.get as jest.MockedFunction<typeof LastUsedRepoService.get>;
const mockIsAuthenticated = GitHubService.isAuthenticated as jest.MockedFunction<typeof GitHubService.isAuthenticated>;

const makeDump = (overrides?: Partial<ThoughtDump>): ThoughtDump => ({
  id: 'dump-1',
  text: 'First dump',
  createdAt: '2025-01-01T10:00:00Z',
  filePath: 'thoughts/2025-01-01T10-00-00.md',
  ...overrides,
});

describe('ThoughtDumpScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    mockList.mockImplementation(async () => []);
    mockCreate.mockImplementation(async () => ({ ok: false, reason: 'no-repos' }));
    mockDelete.mockImplementation(async () => true);
    mockGetSavedRepositories.mockImplementation(async () => [
      { path: 'owner/repo', branch: 'main' },
    ]);
    mockGetPreference.mockResolvedValue(null);
    mockGetLastUsed.mockResolvedValue(null);
    mockIsAuthenticated.mockReturnValue(true);
  });

  it('renders empty state when no dumps', async () => {
    const { getByTestId } = render(<ThoughtDumpScreen />);
    await waitFor(() => {
      expect(getByTestId('empty-state')).toBeTruthy();
    });
  });

  it('renders repo picker row and tapping it opens the modal', async () => {
    const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker')).toBeTruthy();
    });

    expect(queryByTestId('thought-dump-repo-picker-modal')).toBeNull();

    fireEvent.press(getByTestId('thought-dump-repo-picker'));

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker-modal')).toBeTruthy();
    });
  });

  it('save with no repo configured opens the picker instead of calling create', async () => {
    mockGetSavedRepositories.mockResolvedValue([]);

    const { getByTestId, getByText } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByText('thoughtDump.chooseRepo')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('thought-dump-input'), 'My thought');
    fireEvent.press(getByTestId('thought-dump-save'));

    await waitFor(() => {
      expect(getByTestId('thought-dump-repo-picker-modal')).toBeTruthy();
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['no-repos', 'thoughtDump.errorNoRepo'],
    ['not-authenticated', 'thoughtDump.errorNotAuthenticated'],
    ['invalid-repo', 'thoughtDump.errorInvalidRepo'],
    ['write-failed', 'thoughtDump.errorWriteFailed'],
  ] as const)('shows %s alert on create failure', async (reason, messageKey) => {
    mockCreate.mockResolvedValue({ ok: false, reason });

    const { getByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    fireEvent.changeText(getByTestId('thought-dump-input'), 'My thought');
    fireEvent.press(getByTestId('thought-dump-save'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('common.error', messageKey);
    });
  });

  it('renders not-authenticated empty state with go-to-settings action', async () => {
    mockIsAuthenticated.mockReturnValue(false);

    const { getByText, getByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByText('thoughtDump.noAuthTitle')).toBeTruthy();
      expect(getByText('thoughtDump.noAuthBody')).toBeTruthy();
    });

    expect(getByTestId('thought-dump-empty-action')).toBeTruthy();
  });

  it('renders no-repo empty state with go-to-settings action', async () => {
    mockGetSavedRepositories.mockResolvedValue([]);

    const { getByText, getByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByText('thoughtDump.noRepoConfiguredTitle')).toBeTruthy();
      expect(getByText('thoughtDump.noRepoConfiguredBody')).toBeTruthy();
    });

    expect(getByTestId('thought-dump-empty-action')).toBeTruthy();
  });

  it('typing text + pressing save calls ThoughtDumpService.create with trimmed text', async () => {
    const newDump = makeDump({ text: 'My thought' });
    mockCreate.mockResolvedValue({ ok: true, dump: newDump });

    const { getByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    const input = getByTestId('thought-dump-input');
    fireEvent.changeText(input, '  My thought  ');

    const saveButton = getByTestId('thought-dump-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('My thought', {
        repoPath: 'owner/repo',
        branch: 'main',
      });
    });
  }, 15000);

  it('after successful create, input clears and dump appears in list', async () => {
    const newDump = makeDump({ id: 'new-dump', text: 'My thought' });
    mockCreate.mockResolvedValue({ ok: true, dump: newDump });

    const { getByTestId, queryByTestId, getByText } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    const input = getByTestId('thought-dump-input');
    fireEvent.changeText(input, 'My thought');

    const saveButton = getByTestId('thought-dump-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByText('My thought')).toBeTruthy();
    });
  });

  it('list renders dumps from ThoughtDumpService.list()', async () => {
    const dumps = [
      makeDump({ id: 'dump-1', text: 'First dump', createdAt: '2025-01-01T10:00:00Z' }),
      makeDump({ id: 'dump-2', text: 'Second dump', createdAt: '2025-01-01T09:00:00Z' }),
    ];
    mockList.mockResolvedValue(dumps);

    const { getByText } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByText('First dump')).toBeTruthy();
      expect(getByText('Second dump')).toBeTruthy();
    });
  });

  it('delete button shows Modal confirm', async () => {
    const dumps = [makeDump({ id: 'dump-1', text: 'First dump' })];
    mockList.mockResolvedValue(dumps);

    const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByTestId('thought-dump-delete-dump-1')).toBeTruthy();
    });

    expect(queryByTestId('modal')).toBeNull();

    fireEvent.press(getByTestId('thought-dump-delete-dump-1'));

    await waitFor(() => {
      expect(getByTestId('modal')).toBeTruthy();
      expect(getByTestId('thought-dump-confirm-delete')).toBeTruthy();
      expect(getByTestId('thought-dump-cancel-delete')).toBeTruthy();
    });
  });

  it('confirm delete calls ThoughtDumpService.delete and removes from list', async () => {
    const dumps = [makeDump({ id: 'dump-1', text: 'First dump' })];
    mockList.mockResolvedValue(dumps);
    mockDelete.mockResolvedValue(true);

    const { getByTestId, queryByText } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByTestId('thought-dump-delete-dump-1')).toBeTruthy();
    });

    fireEvent.press(getByTestId('thought-dump-delete-dump-1'));

    await waitFor(() => {
      expect(getByTestId('thought-dump-confirm-delete')).toBeTruthy();
    });

    fireEvent.press(getByTestId('thought-dump-confirm-delete'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('dump-1', {
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'thoughts/2025-01-01T10-00-00.md',
      });
    });

    await waitFor(() => {
      expect(queryByText('First dump')).toBeNull();
    });
  });

  it('cancel delete does not call service', async () => {
    const dumps = [makeDump({ id: 'dump-1', text: 'First dump' })];
    mockList.mockResolvedValue(dumps);

    const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByTestId('thought-dump-delete-dump-1')).toBeTruthy();
    });

    fireEvent.press(getByTestId('thought-dump-delete-dump-1'));

    await waitFor(() => {
      expect(getByTestId('thought-dump-cancel-delete')).toBeTruthy();
    });

    fireEvent.press(getByTestId('thought-dump-cancel-delete'));

    expect(mockDelete).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(queryByTestId('modal')).toBeNull();
    });
  });

  it('renders voice input button with correct accessibility label', async () => {
    const { getByTestId, getByLabelText } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      const voiceButton = getByTestId('thought-dump-voice');
      expect(voiceButton).toBeTruthy();
    });

    const voiceButton = getByLabelText('thoughtDump.voiceInput');
    expect(voiceButton).toBeTruthy();
  });

  it('pressing voice button opens VoiceInputModal', async () => {
    const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(getByTestId('thought-dump-voice')).toBeTruthy();
    });

    expect(queryByTestId('voice-input-modal')).toBeNull();

    fireEvent.press(getByTestId('thought-dump-voice'));

    await waitFor(() => {
      expect(getByTestId('voice-input-modal.button.close-unavailable')).toBeTruthy();
    });
  });

  describe('repo picker row and error/empty states', () => {
    it('renders the repo picker row and tapping it opens the modal', async () => {
      const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByTestId('thought-dump-repo-picker')).toBeTruthy();
      });
      expect(queryByTestId('thought-dump-repo-picker-modal')).toBeNull();

      fireEvent.press(getByTestId('thought-dump-repo-picker'));

      await waitFor(() => {
        expect(getByTestId('thought-dump-repo-picker-modal')).toBeTruthy();
      });
    });

    it('save with no repo configured opens the picker instead of calling create', async () => {
      mockGetSavedRepositories.mockResolvedValue([]);

      const { getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByTestId('thought-dump-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('thought-dump-input'), 'some thought');
      fireEvent.press(getByTestId('thought-dump-save'));

      await waitFor(() => {
        expect(getByTestId('thought-dump-repo-picker-modal')).toBeTruthy();
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it.each([
      ['not-authenticated', 'thoughtDump.errorNotAuthenticated'],
      ['no-repos', 'thoughtDump.errorNoRepo'],
      ['invalid-repo', 'thoughtDump.errorInvalidRepo'],
      ['write-failed', 'thoughtDump.errorWriteFailed'],
    ] as const)('shows distinct alert for "%s" failure', async (reason, messageKey) => {
      mockCreate.mockResolvedValue({ ok: false, reason });

      const { getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByTestId('thought-dump-input')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('thought-dump-input'), 'some thought');
      fireEvent.press(getByTestId('thought-dump-save'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('common.error', messageKey);
      });
    });

    it('shows not-authenticated empty state with go-to-settings action', async () => {
      mockIsAuthenticated.mockReturnValue(false);
      mockGetSavedRepositories.mockResolvedValue([]);

      const { getByText, getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByText('thoughtDump.noAuthTitle')).toBeTruthy();
        expect(getByText('thoughtDump.noAuthBody')).toBeTruthy();
        expect(getByTestId('thought-dump-empty-action')).toBeTruthy();
      });
    });

    it('shows no-repo empty state with go-to-settings action', async () => {
      mockGetSavedRepositories.mockResolvedValue([]);

      const { getByText, getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByText('thoughtDump.noRepoConfiguredTitle')).toBeTruthy();
        expect(getByText('thoughtDump.noRepoConfiguredBody')).toBeTruthy();
        expect(getByTestId('thought-dump-empty-action')).toBeTruthy();
      });
    });
  });

  describe('swipe-to-select multi-delete', () => {
    it('renders SwipeableListItem per dump and BulkActionBar hidden by default', async () => {
      const dumps = [
        makeDump({ id: 'dump-1', text: 'A' }),
        makeDump({ id: 'dump-2', text: 'B' }),
      ];
      mockList.mockResolvedValue(dumps);

      const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByTestId('swipeable-dump-1')).toBeTruthy();
        expect(getByTestId('swipeable-dump-2')).toBeTruthy();
        expect(queryByTestId('bulk-action-bar.container')).toBeNull();
      });
    });

    it('tapping the toggle button selects the row and shows the BulkActionBar', async () => {
      const dumps = [makeDump({ id: 'dump-1', text: 'A' })];
      mockList.mockResolvedValue(dumps);

      const { getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => expect(getByTestId('swipeable-dump-1')).toBeTruthy());

      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-1'));

      await waitFor(() => {
        expect(getByTestId('bulk-action-bar.container')).toBeTruthy();
      });
    });

    it('bulk delete confirms then deletes each selected dump and cleans index', async () => {
      const dumps = [
        makeDump({ id: 'dump-1', text: 'A', filePath: 'thoughts/one.md' }),
        makeDump({ id: 'dump-2', text: 'B', filePath: 'thoughts/two.md' }),
      ];
      mockList.mockResolvedValue(dumps);
      mockDelete.mockResolvedValue(true);

      const indexMock = require('../src/services/ai/thoughtDumpIndexing');
      const removeDumpSpy = jest.spyOn(indexMock, 'removeDump').mockImplementation(() => undefined);

      jest.spyOn(Alert, 'alert').mockImplementationOnce((title, message, buttons) => {
        if (Array.isArray(buttons) && buttons[1]) {
          (buttons[1].onPress as () => void)();
        }
      });

      const { getByTestId, queryByText, queryByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => expect(getByTestId('swipeable-dump-1')).toBeTruthy());

      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-1'));
      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-2'));

      await waitFor(() => expect(getByTestId('bulk-action-bar.container')).toBeTruthy());

      fireEvent.press(getByTestId('bulk-action-bar.button.delete'));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledTimes(2);
        expect(mockDelete).toHaveBeenCalledWith('dump-1', {
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'thoughts/one.md',
        });
        expect(mockDelete).toHaveBeenCalledWith('dump-2', {
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'thoughts/two.md',
        });
        expect(removeDumpSpy).toHaveBeenCalledWith('thoughts/one.md');
        expect(removeDumpSpy).toHaveBeenCalledWith('thoughts/two.md');
      });

      await waitFor(() => {
        expect(queryByText('A')).toBeNull();
        expect(queryByText('B')).toBeNull();
      });

      await waitFor(() => {
        expect(queryByTestId('bulk-action-bar.container')).toBeNull();
      });
    });

    it('cancel on BulkActionBar clears selection and hides the bar', async () => {
      const dumps = [makeDump({ id: 'dump-1', text: 'A' })];
      mockList.mockResolvedValue(dumps);
      const { getByTestId, queryByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => expect(getByTestId('swipeable-dump-1')).toBeTruthy());

      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-1'));
      await waitFor(() => expect(getByTestId('bulk-action-bar.container')).toBeTruthy());

      fireEvent.press(getByTestId('bulk-action-bar.button.cancel'));
      await waitFor(() => expect(queryByTestId('bulk-action-bar.container')).toBeNull());
    });

    it('does not call ThoughtDumpService.delete when cancel is pressed in confirmation dialog', async () => {
      const dumps = [
        makeDump({ id: 'dump-1', text: 'A', filePath: 'thoughts/one.md' }),
        makeDump({ id: 'dump-2', text: 'B', filePath: 'thoughts/two.md' }),
      ];
      mockList.mockResolvedValue(dumps);

      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementationOnce(() => undefined);

      const { getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => expect(getByTestId('swipeable-dump-1')).toBeTruthy());

      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-1'));
      fireEvent.press(getByTestId('swipeable-list-item.button.toggle-dump-2'));
      fireEvent.press(getByTestId('bulk-action-bar.button.delete'));

      expect(mockDelete).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('existing single-delete test still works (regression)', async () => {
      // This is a sentinel — the pre-existing single-delete tests above must not regress.
      // We verify the per-item button still exists alongside swipe.
      const dumps = [makeDump({ id: 'dump-1', text: 'First dump' })];
      mockList.mockResolvedValue(dumps);

      const { getByTestId } = render(<ThoughtDumpScreen />);

      await waitFor(() => {
        expect(getByTestId('thought-dump-delete-dump-1')).toBeTruthy();
        expect(getByTestId('swipeable-dump-1')).toBeTruthy();
      });
    });
  });
});
