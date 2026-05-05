import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, null, name);
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('../src/components/ui', () => ({
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => {
    const { createElement } = require('react');
    const { View } = require('react-native');
    return visible ? createElement(View, null, children) : null;
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import SortPicker from '../src/components/SortPicker';
import { renderWithTheme } from './helpers/renderWithTheme';
import { SortMode } from '../src/types/SortTypes';

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function Harness({ initialSort }: { initialSort: SortMode }) {
  const [sort, setSort] = React.useState(initialSort);

  return <SortPicker currentSort={sort} onSortChange={setSort} entityType="notes" />;
}

async function waitForHydration(screen: ReturnType<typeof renderWithTheme>) {
  await waitFor(() => expect(screen.queryByTestId('sort-picker-loading')).toBeNull());
}

describe('SortPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);
  });

  it('renders with the current sort label', () => {
    const { getByText } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    expect(getByText('Newest Created')).toBeTruthy();
  });

  it('opens the sort modal when pressed', async () => {
    const { getByTestId, getByText, queryByTestId } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    await waitForHydration({ getByTestId, queryByTestId } as ReturnType<typeof renderWithTheme>);
    fireEvent.press(getByTestId('sort-picker-trigger'));

    expect(getByText('Sort')).toBeTruthy();
    expect(getByTestId('sort-option-modified-desc')).toBeTruthy();
  });

  it('calls onSortChange when an option is selected', async () => {
    const { getByTestId, queryByTestId } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    await waitForHydration({ getByTestId, queryByTestId } as ReturnType<typeof renderWithTheme>);
    fireEvent.press(getByTestId('sort-picker-trigger'));
    fireEvent.press(getByTestId('sort-option-title-asc'));

    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      'sort-notes',
      JSON.stringify({ field: 'title', direction: 'asc' }),
    );
  });

  it('marks the current sort as selected', async () => {
    const { getByTestId, queryByTestId } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    await waitForHydration({ getByTestId, queryByTestId } as ReturnType<typeof renderWithTheme>);
    fireEvent.press(getByTestId('sort-picker-trigger'));

    expect(getByTestId('sort-option-created-desc').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('sort-option-created-asc').props.accessibilityState.selected).toBe(false);
  });

  it('loads a persisted sort preference from AsyncStorage', async () => {
    mockedStorage.getItem.mockResolvedValueOnce(JSON.stringify({ field: 'title', direction: 'asc' }));

    const { getByText } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    await waitFor(() => expect(getByText('A-Z Title')).toBeTruthy());
  });

  it('persists the selected sort under the entity key', async () => {
    const { getByTestId, queryByTestId } = renderWithTheme(
      <Harness initialSort={{ field: 'created', direction: 'desc' }} />,
    );

    await waitForHydration({ getByTestId, queryByTestId } as ReturnType<typeof renderWithTheme>);
    fireEvent.press(getByTestId('sort-picker-trigger'));
    fireEvent.press(getByTestId('sort-option-modified-asc'));

    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      'sort-notes',
      JSON.stringify({ field: 'modified', direction: 'asc' }),
    );
  });
});
