import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import NotesListScreen from '../src/screens/NotesListScreen';
import { Note } from '../src/models/Note';

let mockViewMode: 'list' | 'journal' = 'list';
let mockNotesSeed: Note[] = [];
let latestSetNotes: React.Dispatch<React.SetStateAction<Note[]>> | null = null;
const mockSwipeableCloseFns: Record<string, jest.Mock> = {};

const mockSetViewMode = jest.fn();
const mockRefreshNotes = jest.fn(async () => undefined);
const mockTogglePin = jest.fn(async () => true);
const mockCreateNote = jest.fn(async () => null);
const mockDeleteNote = jest.fn(async (id: string) => {
  latestSetNotes?.((prev) => prev.filter((note) => note.id !== id));
  return true;
});
const mockUseNoteStore: any = jest.fn();
mockUseNoteStore.getState = () => ({ error: null });

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/contexts/ThemeContext', () => ({
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

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null } }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: mockViewMode, setViewMode: mockSetViewMode }),
}));

jest.mock('../src/contexts/NoteContext', () => {
  const React = require('react');
  return {
    useNotes: () => {
      const [notes, setNotes] = React.useState(mockNotesSeed);
      latestSetNotes = setNotes;
      return {
        notes,
        filteredNotes: notes,
        isLoading: false,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        deleteNote: mockDeleteNote,
        refreshNotes: mockRefreshNotes,
        togglePin: mockTogglePin,
        error: null,
        createNote: mockCreateNote,
      };
    },
  };
});

jest.mock('../src/stores/noteStore', () => {
  return { useNoteStore: mockUseNoteStore };
});

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn() },
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0 })),
  },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../src/services/ShareService', () => ({
  ShareService: { shareText: jest.fn() },
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
  },
}));

jest.mock('../src/components/ContextMenu', () => () => null);
jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/SortPicker', () => () => null);

jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => (
    <TextInput value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../src/components/ui', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
  useScreenHeaderHeight: () => 60,
  SCREEN_HEADER_BASE_HEIGHT: 60,
  SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
  useTabBarHeight: () => 84,
  TAB_BAR_BASE_HEIGHT: 84,
}));

jest.mock('../src/components/NoteCard', () => ({
  __esModule: true,
  default: ({ note }: { note: Note }) => {
    const { Text } = require('react-native');
    return <Text>{note.title}</Text>;
  },
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: React.forwardRef(({ data, renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data?.length) {
        return <View>{ListEmptyComponent ?? null}</View>;
      }
      return <View>{data.map((item: Note, index: number) => renderItem({ item, index }))}</View>;
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return React.forwardRef(
    ({ children, renderRightActions, onSwipeableWillOpen }: any, ref: any) => {
      const [isOpen, setIsOpen] = React.useState(false);
      const noteId = children?.props?.note?.id ?? 'unknown';
      const closeRef = React.useRef();
      const methodsRef = React.useRef();

      if (!closeRef.current) {
        closeRef.current = jest.fn(() => setIsOpen(false));
      }

      if (!methodsRef.current) {
        methodsRef.current = {
          close: closeRef.current,
          openLeft: jest.fn(),
          openRight: jest.fn(),
          reset: jest.fn(),
        };
      }

      const close = closeRef.current;
      const methods = methodsRef.current;

      mockSwipeableCloseFns[noteId] = close;

      React.useEffect(() => {
        if (typeof ref === 'function') {
          ref(methods);
          return () => ref(null);
        }

        if (ref) {
          ref.current = methods;
          return () => {
            ref.current = null;
          };
        }

        return undefined;
      }, [ref, methods]);

      return (
        <View>
          <Pressable
            testID={`open-swipe-${noteId}`}
            onPress={() => {
              onSwipeableWillOpen?.();
              setIsOpen(true);
            }}
          />
          {children}
          {isOpen ? (
            <View testID={`swipe-actions-${noteId}`}>
              {renderRightActions?.(undefined, undefined, methods)}
            </View>
          ) : null}
        </View>
      );
    },
  );
});

const createNote = (id: string, title: string): Note => ({
  id,
  title,
  content: `${title} content`,
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  format: 'markdown',
});

const confirmLatestDeleteAlert = async () => {
  const alertCalls = (Alert.alert as jest.Mock).mock.calls;
  const lastCall = alertCalls[alertCalls.length - 1];
  if (!lastCall) {
    throw new Error('Expected delete alert to be shown');
  }

  const buttons = lastCall[2] as Array<{ text?: string; onPress?: () => void | Promise<void> }>;
  const deleteButton = buttons.find((button) => button.text === 'Delete');
  if (!deleteButton?.onPress) {
    throw new Error('Expected delete confirmation button');
  }

  await act(async () => {
    await deleteButton.onPress?.();
  });
};

describe('NotesListScreen swipe delete regression', () => {
  beforeEach(() => {
    mockViewMode = 'list';
    mockNotesSeed = [
      createNote('note-1', 'First note'),
      createNote('note-2', 'Second note'),
      createNote('note-3', 'Third note'),
    ];
    latestSetNotes = null;
    Object.keys(mockSwipeableCloseFns).forEach((key) => delete mockSwipeableCloseFns[key]);
    mockDeleteNote.mockClear();
    mockSetViewMode.mockClear();
    mockRefreshNotes.mockClear();
    mockTogglePin.mockClear();
    mockCreateNote.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['list', 'journal'] as const)(
    'closes swiped state before deleting in %s mode so recycled cards do not stay open',
    async (viewMode) => {
      mockViewMode = viewMode;
      const screen = render(<NotesListScreen />);

      fireEvent.press(screen.getByTestId('open-swipe-note-1'));
      expect(screen.getByTestId('swipe-actions-note-1')).toBeTruthy();

      fireEvent.press(screen.getByText('Delete'));
      await confirmLatestDeleteAlert();

      await waitFor(() => expect(screen.queryByText('First note')).toBeNull());
      expect(screen.queryByTestId('swipe-actions-note-2')).toBeNull();
      expect(screen.queryAllByText('Delete')).toHaveLength(0);
    },
  );

  it('keeps only one swipeable card open at a time', async () => {
    const screen = render(<NotesListScreen />);

    fireEvent.press(screen.getByTestId('open-swipe-note-1'));
    expect(screen.getByTestId('swipe-actions-note-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-swipe-note-2'));

    await waitFor(() => expect(mockSwipeableCloseFns['note-1']).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('swipe-actions-note-2')).toBeTruthy();
  });
});
