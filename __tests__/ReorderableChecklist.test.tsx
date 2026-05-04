import { fireEvent } from '@testing-library/react-native';

import ReorderableChecklist, { ChecklistItem, reorderItems } from '../src/components/ReorderableChecklist';
import { renderWithTheme } from './helpers/renderWithTheme';

jest.mock('react-native-gesture-handler', () => {
  const createPanGesture = () => ({
    runOnJS() {
      return this;
    },
    onStart() {
      return this;
    },
    onUpdate() {
      return this;
    },
    onEnd() {
      return this;
    },
    onFinalize() {
      return this;
    },
  });

  return {
    Gesture: {
      Pan: createPanGesture,
    },
    GestureDetector: ({ children }: { children: any }) => children,
  };
});

describe('ReorderableChecklist', () => {
  const items: ChecklistItem[] = [
    { checked: false, text: 'First item' },
    { checked: true, text: 'Second item' },
    { checked: false, text: 'Third item' },
  ];

  const createProps = () => ({
    items,
    onReorder: jest.fn(),
    onToggle: jest.fn(),
    onTextChange: jest.fn(),
    onAddItem: jest.fn(),
    onDeleteItem: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders checklist items with checkboxes and text inputs', () => {
    const props = createProps();
    const { getByDisplayValue, getByLabelText } = renderWithTheme(<ReorderableChecklist {...props} />);

    expect(getByDisplayValue('First item')).toBeTruthy();
    expect(getByDisplayValue('Second item')).toBeTruthy();
    expect(getByDisplayValue('Third item')).toBeTruthy();
    expect(getByLabelText('Toggle checklist item 1')).toBeTruthy();
    expect(getByLabelText('Toggle checklist item 2')).toBeTruthy();
    expect(getByLabelText('Drag checklist item 3')).toBeTruthy();
  });

  it('calls onToggle with the correct index when a checkbox is pressed', () => {
    const props = createProps();
    const { getByLabelText } = renderWithTheme(<ReorderableChecklist {...props} />);

    fireEvent.press(getByLabelText('Toggle checklist item 2'));

    expect(props.onToggle).toHaveBeenCalledWith(1);
  });

  it('calls onTextChange with the correct index and text', () => {
    const props = createProps();
    const { getByDisplayValue } = renderWithTheme(<ReorderableChecklist {...props} />);

    fireEvent.changeText(getByDisplayValue('Second item'), 'Updated item');

    expect(props.onTextChange).toHaveBeenCalledWith(1, 'Updated item');
  });

  it('calls onAddItem when the add item button is pressed', () => {
    const props = createProps();
    const { getByLabelText } = renderWithTheme(<ReorderableChecklist {...props} />);

    fireEvent.press(getByLabelText('Add checklist item'));

    expect(props.onAddItem).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteItem with the correct index when delete is pressed', () => {
    const props = createProps();
    const { getByLabelText } = renderWithTheme(<ReorderableChecklist {...props} />);

    fireEvent.press(getByLabelText('Delete checklist item 2'));

    expect(props.onDeleteItem).toHaveBeenCalledWith(1);
  });

  it('reorders items with the reorderItems helper', () => {
    expect(reorderItems(items, 0, 2)).toEqual([
      { checked: true, text: 'Second item' },
      { checked: false, text: 'Third item' },
      { checked: false, text: 'First item' },
    ]);
  });

  it('calls onReorder with reordered items through accessibility reorder actions', () => {
    const props = createProps();
    const { getByLabelText } = renderWithTheme(<ReorderableChecklist {...props} />);

    fireEvent(getByLabelText('Checklist item 1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    expect(props.onReorder).toHaveBeenCalledWith([
      { checked: true, text: 'Second item' },
      { checked: false, text: 'First item' },
      { checked: false, text: 'Third item' },
    ]);
  });
});
