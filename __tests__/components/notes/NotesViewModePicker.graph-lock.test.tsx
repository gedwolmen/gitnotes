/**
 * QA for the paywall graph-lock in NotesViewModePicker.
 *
 * When `mode === 'graph' && !isPro`, the graph option shows a lock-closed icon
 * and pressing it calls `onLockedPress()` instead of `onChange('graph')`.
 * Pro users keep the normal `onChange('graph')` flow with no lock icon, and
 * non-graph modes always call `onChange(mode)` regardless of tier.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
    },
  }),
}));

// RN's Modal is already mocked by @react-native/jest-preset (renders children
// when `visible !== false`), so rendering with `visible: true` mounts the sheet.

import { NotesViewModePicker } from '../../../src/components/notes/NotesViewModePicker';

const GRAPH_TEST_ID = 'notes-view-mode.button.change-graph';
const LIST_TEST_ID = 'notes-view-mode.button.change-list';
// The global @expo/vector-icons mock (jest.setup.ts) renders an icon as a View
// with testID `icon-<name>`, so a lock icon surfaces as `icon-lock-closed`.
const LOCK_ICON_TEST_ID = 'icon-lock-closed';

function renderPicker(overrides: Partial<React.ComponentProps<typeof NotesViewModePicker>> = {}) {
  const props = {
    visible: true,
    viewMode: 'list' as const,
    onClose: jest.fn(),
    onChange: jest.fn(),
    isPro: false,
    onLockedPress: jest.fn(),
    ...overrides,
  };
  const utils = render(<NotesViewModePicker {...props} />);
  return { ...utils, props };
}

describe('NotesViewModePicker graph lock', () => {
  it('calls onLockedPress instead of onChange when a free user presses the graph option', () => {
    const { getByTestId, props } = renderPicker();
    fireEvent.press(getByTestId(GRAPH_TEST_ID));
    expect(props.onLockedPress).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('shows a lock-closed icon on the graph option for a free user', () => {
    const { queryByTestId } = renderPicker();
    expect(queryByTestId(LOCK_ICON_TEST_ID)).not.toBeNull();
  });

  it('calls onChange("graph") for a pro user and never onLockedPress', () => {
    const { getByTestId, props } = renderPicker({ isPro: true });
    fireEvent.press(getByTestId(GRAPH_TEST_ID));
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith('graph');
    expect(props.onLockedPress).not.toHaveBeenCalled();
  });

  it('does not show a lock icon on the graph option for a pro user', () => {
    const { queryByTestId } = renderPicker({ isPro: true });
    expect(queryByTestId(LOCK_ICON_TEST_ID)).toBeNull();
  });

  it('calls onChange for non-graph modes for a free user (regression guard)', () => {
    const { getByTestId, props } = renderPicker();
    fireEvent.press(getByTestId(LIST_TEST_ID));
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith('list');
    expect(props.onLockedPress).not.toHaveBeenCalled();
  });

  it('calls onChange for non-graph modes for a pro user (regression guard)', () => {
    const { getByTestId, props } = renderPicker({ isPro: true });
    fireEvent.press(getByTestId(LIST_TEST_ID));
    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith('list');
    expect(props.onLockedPress).not.toHaveBeenCalled();
  });
});
