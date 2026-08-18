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
jest.mock('../../src/components/home/DailyQuoteCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { DailyQuoteCard: () => React.createElement(View, null) };
});
jest.mock('../../src/hooks/useDailyQuote', () => ({
  useDailyQuote: () => ({ quote: null, isLoading: false, refresh: jest.fn() }),
}));
jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ columnCount: 1 }),
}));
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
jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: { stageNote: jest.fn() },
}));
jest.mock('../../src/utils/requireRepo', () => ({
  requireRepo: () => true,
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import { __setProState } from '../../src/stores/proStore';

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPro();
});

describe('HomeScreen pro gates', () => {
  it('routes a free user tapping Thought Dump straight to the paywall', () => {
    setFree();
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('home.button.open-thought-dump'));
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
    expect(mockNavigate).not.toHaveBeenCalledWith('ThoughtDump');
  });

  it('opens Thought Dump normally for a pro user', () => {
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('home.button.open-thought-dump'));
    expect(mockNavigate).toHaveBeenCalledWith('ThoughtDump');
  });

  it('routes a free user tapping From Template straight to the paywall', () => {
    setFree();
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('home.button.open-templates'));
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });

  it('opens the template selector for a pro user', () => {
    const { getByTestId } = render(<HomeScreen />);
    fireEvent.press(getByTestId('home.button.open-templates'));
    expect(mockNavigate).not.toHaveBeenCalledWith('Paywall');
  });
});
