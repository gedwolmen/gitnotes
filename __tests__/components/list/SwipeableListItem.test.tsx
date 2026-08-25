/**
 * Regression tests for issues #940 and #941: on iPad multi-column lists the
 * Todo (#940) and Note (#941) cards collapsed to their intrinsic content
 * width (measured 90px / 263px on device) instead of filling the column that
 * the FlatList assigns them.
 *
 * SwipeableListItem is the shared item wrapper for every grid list
 * (TodoListScreen, NotesListScreen, ThoughtDumpScreen). Its root
 * Animated.View must carry `flex: 1` so each card stretches to its column
 * slot without claiming the entire row.
 *
 * Jest runs no native layout engine, so the tests apply React Native's
 * documented layout contract: a root with `flex: 1` resolves to the full
 * column slot (containerWidth - gaps) / numColumns, while a root without
 * an explicit flex value collapses to the card content's intrinsic width.
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { SwipeableListItem } from '../../../src/components/list/SwipeableListItem';
import { useResponsive } from '../../../src/hooks/useResponsive';
import { HapticService } from '../../../src/utils/haptics';

jest.mock('../../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({
    isTablet: true,
    isLandscape: false,
    screenWidth: 1032,
    screenHeight: 1376,
    columns: 3,
    maxContentWidth: 1032,
    sideBySide: true,
    deviceType: 'tablet',
    columnCount: 3,
  }),
}));

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#ffffff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111111',
      textSecondary: '#666666',
      border: '#dddddd',
      error: '#dc2626',
      accent: '#8b5cf6',
    },
    isDark: false,
  }),
}));

jest.mock('../../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

// iPad Pro 13" portrait content area: 1032pt screen minus the 2x16 list
// padding applied by TodoListScreen / NotesListScreen contentContainerStyle.
const CONTAINER_WIDTH = 1000;
// Inter-column gap the screens apply via columnWrapperStyle when
// numColumns > 1.
const COLUMN_GAP = 8;
const EXPECTED_TWO_COLUMN_WIDTH = (CONTAINER_WIDTH - COLUMN_GAP) / 2;
// Intrinsic width of the stub card content. Models the fixed-width TodoCard /
// NoteCard content that an unpatched wrapper collapses onto (#940 measured
// 90px, #941 measured 263px on device).
const STUB_CONTENT_WIDTH = 200;
// Nominal 3-column slot: (1000 - 2x8) / 3 = 328px. 320 leaves rounding headroom.
const MIN_EXPECTED_COLUMN_WIDTH = 320;
const IPAD_COLUMN_COUNT = 3;

type ElementWithStyle = { props: { style?: unknown } };

function flattenedStyle(element: ElementWithStyle): ViewStyle | undefined {
  const flat = StyleSheet.flatten(element.props.style as StyleProp<ViewStyle>);
  if (!flat) return undefined;
  return flat as ViewStyle;
}

/**
 * Width the item visually occupies in its row. `flex: 1` fills the
 * column slot the FlatList assigns equally; without flex the wrapper
 * shrinks to the card content's intrinsic width (the #940/#941 collapse).
 */
function measuredItemWidth(element: ElementWithStyle, numColumns: number): number {
  const style = flattenedStyle(element);
  if (style?.flex === 1) {
    return (CONTAINER_WIDTH - (numColumns - 1) * COLUMN_GAP) / numColumns;
  }
  return STUB_CONTENT_WIDTH;
}

interface GridHarnessProps {
  itemIds: ReadonlyArray<string>;
  /** Forces a column count; defaults to the mocked responsive columnCount. */
  numColumns?: number;
}

function GridHarness({ itemIds, numColumns }: GridHarnessProps) {
  const responsive = useResponsive();
  const columns = numColumns ?? responsive.columnCount;

  return (
    <View testID="grid-container" style={{ width: CONTAINER_WIDTH }}>
      <FlatList
        data={itemIds.map((id) => ({ id }))}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: COLUMN_GAP } : undefined}
        renderItem={({ item }) => (
          <SwipeableListItem
            itemId={item.id}
            selected={false}
            selectionMode={false}
            onToggleSelect={() => undefined}
          >
            <View
              testID={`card-${item.id}`}
              style={{ width: STUB_CONTENT_WIDTH, height: 120 }}
            />
          </SwipeableListItem>
        )}
      />
    </View>
  );
}

describe('SwipeableListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fills the column width in a 3-column iPad grid (regression: #940, #941)', () => {
    const view = render(
      <GridHarness itemIds={['todo-a', 'todo-b', 'todo-c']} />,
    );

    const items = view.getAllByTestId(/^swipeable-/);
    expect(items).toHaveLength(3);

    for (const item of items) {
      const width = measuredItemWidth(item, IPAD_COLUMN_COUNT);
      expect(width).toBeGreaterThanOrEqual(MIN_EXPECTED_COLUMN_WIDTH);
    }
  });

  it('keeps every note visible inside its assigned iPad grid column (#1280)', () => {
    const view = render(
      <GridHarness itemIds={['note-a', 'note-b', 'note-c', 'note-d']} numColumns={2} />,
    );

    const items = view.getAllByTestId(/^swipeable-/);
    expect(items).toHaveLength(4);

    for (const item of items) {
      expect(measuredItemWidth(item, 2)).toBe(EXPECTED_TWO_COLUMN_WIDTH);
      const style = flattenedStyle(item);
      expect(style?.flex).toBe(1);
      expect(style?.width).toBeUndefined();
    }
  });

  it('fills the full container width in single-column layout', () => {
    const view = render(<GridHarness itemIds={['solo']} numColumns={1} />);

    const width = measuredItemWidth(view.getByTestId('swipeable-solo'), 1);
    const style = flattenedStyle(view.getByTestId('swipeable-solo'));
    expect(width).toBe(CONTAINER_WIDTH);
    expect(style?.flex).toBe(1);
    expect(style?.width).toBeUndefined();
  });

  it('still fires onToggleSelect when the selection-mode toggle is pressed', () => {
    const onToggleSelect = jest.fn();
    const view = render(
      <SwipeableListItem
        itemId="item-1"
        selected={false}
        selectionMode
        onToggleSelect={onToggleSelect}
      >
        <View
          testID="card-content"
          style={{ width: STUB_CONTENT_WIDTH, height: 120 }}
        />
      </SwipeableListItem>,
    );

    fireEvent.press(view.getByTestId('swipeable-list-item.button.toggle-item-1'));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(HapticService.selection).toHaveBeenCalledTimes(1);
  });

  it('still delivers press and long-press to the wrapped card', () => {
    const onOpen = jest.fn();
    const onLongPress = jest.fn();
    const view = render(
      <SwipeableListItem
        itemId="item-2"
        selected={false}
        selectionMode={false}
        onToggleSelect={jest.fn()}
      >
        <Pressable testID="card-content" onPress={onOpen} onLongPress={onLongPress}>
          <View style={{ width: STUB_CONTENT_WIDTH, height: 120 }} />
        </Pressable>
      </SwipeableListItem>,
    );

    const card = view.getByTestId('card-content');
    fireEvent.press(card);
    fireEvent(card, 'longPress');

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected shadow styling alongside the fill width', () => {
    const view = render(
      <SwipeableListItem
        itemId="sel"
        selected
        selectionMode
        onToggleSelect={jest.fn()}
      >
        <View style={{ width: STUB_CONTENT_WIDTH, height: 120 }} />
      </SwipeableListItem>,
    );

    const style = flattenedStyle(view.getByTestId('swipeable-sel'));
    expect(style?.flex).toBe(1);
    expect(style?.shadowColor).toBe('#dc2626');
    expect(style?.elevation).toBe(8);
  });
});
