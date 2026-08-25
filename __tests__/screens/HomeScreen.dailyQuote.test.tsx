import type { DailyQuote } from '../../src/services/DailyQuoteService';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
      card: '#fff', shadow: '#000', textSecondaryAlt: '#666', surfaceSecondary: '#eee', glassElevated: '#fff',
    },
  }),
  useTokens: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
    },
    spacing: [0, 4, 8, 12, 16, 20, 24],
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Stub = ({ children }: { children?: unknown }) => React.createElement(View, null, children);
  return {
    useScreenHeaderHeight: () => 60,
    useTabBarHeight: () => 60,
    ScreenHeader: ({ title, actions }: { title?: unknown; actions?: unknown }) =>
      React.createElement(View, null, actions, title),
    Button: ({ label, onPress, testID }: { label?: unknown; onPress?: () => void; testID?: string }) =>
      React.createElement(TouchableOpacity, { testID, onPress }, React.createElement(Text, null, String(label))),
    Card: Stub,
    Modal: Stub,
  };
});

jest.mock('../../src/components/home/BentoRecent', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BentoRecent: () => React.createElement(View, null) };
});
jest.mock('../../src/components/home/QuickAccessShelf', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { QuickAccessShelf: () => React.createElement(View, null) };
});
jest.mock('../../src/components/home/HomeNoteContextMenu', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { HomeNoteContextMenu: () => React.createElement(View, null) };
});
jest.mock('../../src/components/TemplateSelector', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => React.createElement(View, null);
});
jest.mock('../../src/components/ColorPicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => React.createElement(View, null);
});

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [], pinnedNotes: [], togglePin: jest.fn(), updateNote: jest.fn(), deleteNote: jest.fn(),
    clearAllNotes: jest.fn(), refreshNotes: jest.fn(), createNote: jest.fn(), recentNotes: [],
  }),
}));
jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({ canvases: [], refreshCanvases: jest.fn() }),
}));
jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [], refreshRepos: jest.fn() }),
}));
jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueue: jest.fn() },
}));
jest.mock('../../src/utils/requireRepo', () => ({
  requireRepo: () => true,
}));
jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, deviceType: 'phone', columnCount: 1 }),
}));
jest.mock('../../src/hooks/useProGate', () => ({
  useProGate: () => ({ isPro: true, status: 'pro', loading: false, openPaywall: jest.fn() }),
}));

const mockAIState = {
  isLoading: false,
  selectedModelId: 'test-model' as string | null,
  dailyQuoteEnabled: true,
  dailyQuotePersonalizationEnabled: true,
  dailyQuoteSourceVisible: true,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: Object.assign(
    (selector: (state: typeof mockAIState) => unknown) => selector(mockAIState),
    {
      getState: () => mockAIState,
      toggleDailyQuote: async () => {
        mockAIState.dailyQuoteEnabled = !mockAIState.dailyQuoteEnabled;
      },
      toggleDailyQuoteSourceVisible: async () => {
        mockAIState.dailyQuoteSourceVisible = !mockAIState.dailyQuoteSourceVisible;
      },
    },
  ),
}));

const mockDailyQuoteService = {
  getDailyQuote: jest.fn(),
  regenerate: jest.fn(),
  clearCache: jest.fn(),
};
jest.mock('../../src/services/DailyQuoteService', () => ({
  get dailyQuoteService() {
    return mockDailyQuoteService;
  },
}));

const mockSampleQuote: DailyQuote = {
  quoteId: 'aurelius-3',
  text: 'Waste no more time arguing what a good man should be. Be one.',
  author: 'Marcus Aurelius',
  tags: ['action'],
  source: 'Meditations',
  description: 'A quote from your reflections.',
  generatedAt: 1_700_000_000_000,
};
const mockQuoteRefresh = jest.fn();

jest.mock('../../src/hooks/useDailyQuote', () => ({
  useDailyQuote: () =>
    mockAIState.dailyQuoteEnabled
      ? { quote: mockSampleQuote, isLoading: false, error: null, refresh: mockQuoteRefresh }
      : { quote: null, isLoading: false, error: null, refresh: mockQuoteRefresh },
}));

import React from 'react';
import { act, render } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import { useAIStore } from '../../src/stores/aiStore';

type MockAIStore = typeof useAIStore & {
  toggleDailyQuote: () => Promise<void>;
  toggleDailyQuoteSourceVisible: () => Promise<void>;
};
const mockStore = useAIStore as MockAIStore;

function resetAIState(): void {
  mockAIState.isLoading = false;
  mockAIState.selectedModelId = 'test-model';
  mockAIState.dailyQuoteEnabled = true;
  mockAIState.dailyQuotePersonalizationEnabled = true;
  mockAIState.dailyQuoteSourceVisible = true;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAIState();
});

describe('HomeScreen daily quote integration', () => {
  it('shows the daily quote on the home screen when enabled', () => {
    const { getByText } = render(<HomeScreen />);

    expect(getByText(mockSampleQuote.text)).toBeTruthy();
    expect(getByText(/— Marcus Aurelius, Meditations/)).toBeTruthy();
  });

  it('hides the daily quote when the feature is disabled', () => {
    mockAIState.dailyQuoteEnabled = false;

    const { queryByText } = render(<HomeScreen />);

    expect(queryByText(mockSampleQuote.text)).toBeNull();
    expect(queryByText(/Marcus Aurelius/)).toBeNull();
  });

  it('propagates the settings toggle to the home screen', async () => {
    const view = render(<HomeScreen />);
    expect(view.getByText(mockSampleQuote.text)).toBeTruthy();

    await act(async () => {
      await mockStore.toggleDailyQuote();
    });
    view.rerender(<HomeScreen />);
    expect(view.queryByText(mockSampleQuote.text)).toBeNull();

    await act(async () => {
      await mockStore.toggleDailyQuote();
    });
    view.rerender(<HomeScreen />);
    expect(view.getByText(mockSampleQuote.text)).toBeTruthy();
  });

  it('toggles source visibility inside the rendered card', async () => {
    const view = render(<HomeScreen />);
    expect(view.getByText(/— Marcus Aurelius, Meditations/)).toBeTruthy();

    await act(async () => {
      await mockStore.toggleDailyQuoteSourceVisible();
    });
    view.rerender(<HomeScreen />);

    expect(view.getByText(/— Marcus Aurelius/)).toBeTruthy();
    expect(view.queryByText(/Meditations/)).toBeNull();
  });
});
