import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import ThoughtDumpScreen from '../src/screens/ThoughtDumpScreen';
import { ThoughtDumpService } from '../src/services/ThoughtDumpService';
import { StorageService } from '../src/services/StorageService';
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

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

  const EmptyState = ({ title }: any) => (
    <View testID="empty-state">
      <Text>{title}</Text>
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

const makeDump = (overrides?: Partial<ThoughtDump>): ThoughtDump => ({
  id: 'dump-1',
  text: 'First dump',
  createdAt: '2025-01-01T10:00:00Z',
  filePath: 'thoughts/2025-01-01T10-00-00.md',
  ...overrides,
});

describe('ThoughtDumpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(null);
    mockDelete.mockResolvedValue(true);
    mockGetSavedRepositories.mockResolvedValue([
      { path: 'owner/repo', branch: 'main' },
    ]);
  });

  it('renders empty state when no dumps', async () => {
    const { getByTestId } = render(<ThoughtDumpScreen />);
    await waitFor(() => {
      expect(getByTestId('empty-state')).toBeTruthy();
    });
  });

  it('typing text + pressing save calls ThoughtDumpService.create with trimmed text', async () => {
    const newDump = makeDump({ text: 'My thought' });
    mockCreate.mockResolvedValue(newDump);

    const { getByTestId } = render(<ThoughtDumpScreen />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled();
    });

    const input = getByTestId('thought-dump-input');
    fireEvent.changeText(input, '  My thought  ');

    const saveButton = getByTestId('thought-dump-save');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('My thought');
    });
  });

  it('after successful create, input clears and dump appears in list', async () => {
    const newDump = makeDump({ id: 'new-dump', text: 'My thought' });
    mockCreate.mockResolvedValue(newDump);

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
});
