import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import NotesListScreen from '../../src/screens/NotesListScreen';
import { Note } from '../../src/models/Note';

const mockNavigate = jest.fn();
let mockNotesSeed: Note[] = [];
let mockSearchQuery = '';
let mockIsLoading = false;
let mockError: string | null = null;

const mockSetSearchQuery = jest.fn();
const mockDeleteNote = jest.fn(async () => true);
const mockRefreshNotes = jest.fn(async () => undefined);
const mockTogglePin = jest.fn(async () => true);
const mockCreateNote = jest.fn(async () => null);
const mockUpdateNote = jest.fn(async () => null);

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  );
  return {
    __esModule: true,
    default: { addEventListener, fetch },
    addEventListener,
    fetch,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
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

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null } }),
}));

jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list' as const, setViewMode: jest.fn() }),
}));

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: mockNotesSeed,
    filteredNotes: mockNotesSeed,
    isLoading: mockIsLoading,
    searchQuery: mockSearchQuery,
    setSearchQuery: mockSetSearchQuery,
    deleteNote: mockDeleteNote,
    refreshNotes: mockRefreshNotes,
    togglePin: mockTogglePin,
    error: mockError,
    createNote: mockCreateNote,
    updateNote: mockUpdateNote,
  }),
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn() },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0 })),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/ShareService', () => ({
  ShareService: { shareText: jest.fn() },
}));

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/components/ContextMenu', () => () => null);

jest.mock('../../src/components/ColorPicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (v: string) => void;
  }) => <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />;
});

jest.mock('../../src/components/ui', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text testID="screen-header">{title}</Text>;
  },
  useScreenHeaderHeight: () => 60,
  SCREEN_HEADER_BASE_HEIGHT: 60,
  SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
  useTabBarHeight: () => 84,
  TAB_BAR_BASE_HEIGHT: 84,
}));

jest.mock('../../src/components/notes/NoteCard', () => ({
  NoteCard: ({ note, onPress }: { note: Note; onPress: (n: Note) => void }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable testID={`note-card-${note.id}`} onPress={() => onPress(note)}>
        <Text>{note.title}</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../src/components/notes/NotesListHeader', () => ({
  NotesListHeader: ({ onSearchChange }: { onSearchChange: (q: string) => void }) => {
    const { TextInput } = require('react-native');
    return (
      <TextInput
        testID="notes-list-header-search"
        placeholder="Search notes..."
        onChangeText={onSearchChange}
      />
    );
  },
}));

jest.mock('../../src/components/notes/NotesViewModePicker', () => ({
  NotesViewModePicker: () => null,
}));

jest.mock('../../src/components/notes/NotesActiveFilters', () => ({
  NotesActiveFilters: () => null,
}));

jest.mock('../../src/components/notes/NotesFilterModal', () => ({
  NotesFilterModal: () => null,
}));

jest.mock('../../src/components/notes/NotesContextMenu', () => ({
  NotesContextMenu: () => null,
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: React.forwardRef(
      (
        { data, renderItem, ListEmptyComponent }: any,
        _ref: any,
      ) => {
        if (!data?.length) {
          return <View testID="flash-list-empty">{ListEmptyComponent ?? null}</View>;
        }
        return (
          <View testID="flash-list">
            {data.map((item: Note, index: number) =>
              renderItem({ item, index }),
            )}
          </View>
        );
      },
    ),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, _ref: any) => (
    <View>{children}</View>
  ));
});

const createNote = (overrides: Partial<Note> = {}): Note => ({
  id: `note-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Test Note',
  content: 'Test content',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tags: [],
  format: 'markdown',
  ...overrides,
});

describe('NotesListScreen', () => {
  beforeEach(() => {
    mockNotesSeed = [];
    mockSearchQuery = '';
    mockIsLoading = false;
    mockError = null;
    mockNavigate.mockClear();
    mockSetSearchQuery.mockClear();
    mockDeleteNote.mockClear();
    mockRefreshNotes.mockClear();
    mockTogglePin.mockClear();
    mockCreateNote.mockClear();
    mockUpdateNote.mockClear();
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<NotesListScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
  });

  it('shows loading indicator when isLoading is true', () => {
    mockIsLoading = true;
    const { UNSAFE_queryByType } = render(<NotesListScreen />);
    const ActivityIndicator = require('react-native').ActivityIndicator;
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  });

  it('shows empty state when no notes exist', () => {
    const { getByText } = render(<NotesListScreen />);
    expect(getByText('No notes yet')).toBeTruthy();
    expect(getByText('Create your first note to get started')).toBeTruthy();
  });

  it('shows filtered empty state when search is active with no results', () => {
    mockSearchQuery = 'nonexistent';
    const { getByText } = render(<NotesListScreen />);
    expect(getByText('No matching notes')).toBeTruthy();
    expect(getByText('Try adjusting your search or filters')).toBeTruthy();
  });

  it('renders a list of notes', () => {
    mockNotesSeed = [
      createNote({ id: 'n1', title: 'First Note' }),
      createNote({ id: 'n2', title: 'Second Note' }),
      createNote({ id: 'n3', title: 'Third Note' }),
    ];

    const { getByText, getByTestId } = render(<NotesListScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
    expect(getByText('First Note')).toBeTruthy();
    expect(getByText('Second Note')).toBeTruthy();
    expect(getByText('Third Note')).toBeTruthy();
  });

  it('passes search query changes to setSearchQuery', () => {
    const { getByTestId } = render(<NotesListScreen />);
    fireEvent.changeText(getByTestId('notes-list-header-search'), 'shopping');
    expect(mockSetSearchQuery).toHaveBeenCalledWith('shopping');
  });

  it('navigates to NoteEditor when a note card is pressed', () => {
    const note = createNote({ id: 'press-me', title: 'Pressable Note' });
    mockNotesSeed = [note];

    const { getByTestId } = render(<NotesListScreen />);
    fireEvent.press(getByTestId('note-card-press-me'));

    expect(mockNavigate).toHaveBeenCalledWith('NoteEditor', {
      noteId: note.id,
    });
  });

  it('displays an error banner when error is set', () => {
    mockError = 'Something went wrong';
    const { getByText } = render(<NotesListScreen />);
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});
