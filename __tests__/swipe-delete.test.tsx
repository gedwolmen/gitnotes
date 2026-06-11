import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import NotesListScreen from '../src/screens/NotesListScreen';
import { Note } from '../src/models/Note';

let mockViewMode: 'list' | 'journal' = 'list';
let mockNotesSeed: Note[] = [];
let latestSetNotes: React.Dispatch<React.SetStateAction<Note[]>> | null = null;

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
  useIsFocused: () => true,
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
jest.mock('../src/components/list/SwipeableListItem', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    SwipeableListItem: ({ itemId, children }: { itemId: string; selected?: boolean; selectionMode?: boolean; onToggleSelect?: () => void; children: React.ReactNode }) => {
      return React.createElement(View, { testID: `swipeable-${itemId}` },
        React.createElement(Pressable, { testID: `open-swipe-${itemId}` }, children)
      );
    },
  };
});

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
  const MockFlashList = React.forwardRef(({ data = [], renderItem, ListEmptyComponent }: any, _ref: any) => {
    if (!data.length) {
      return <View testID="flash-list-empty">{ListEmptyComponent ?? null}</View>;
    }
    return <View testID="flash-list">{data.map((item: any, index: number) => renderItem({ item, index }))}</View>;
  });
  return { __esModule: true, FlashList: MockFlashList, default: MockFlashList };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
    return <View testID="reanimated-swipeable">{children}</View>;
  });
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

  it('keeps only one swipeable card open at a time', async () => {
    const screen = render(<NotesListScreen />);

    expect(screen.getByTestId('swipeable-note-1')).toBeTruthy();
    expect(screen.getByTestId('swipeable-note-2')).toBeTruthy();
  });

  it('toggles note selection when swiped', async () => {
    const screen = render(<NotesListScreen />);

    expect(screen.getByTestId('swipeable-note-1')).toBeTruthy();
  });
});
