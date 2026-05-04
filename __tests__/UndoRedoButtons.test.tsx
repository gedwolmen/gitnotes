jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: any) => createElement(Text, null, name),
  };
});

import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import { UndoRedoButtons } from '../src/components/UndoRedoButtons';

describe('UndoRedoButtons', () => {
  it('renders undo and redo buttons', () => {
    const { getByLabelText } = renderWithTheme(
      <UndoRedoButtons canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()} />,
    );

    expect(getByLabelText('undo')).toBeTruthy();
    expect(getByLabelText('redo')).toBeTruthy();
  });

  it('disables undo when canUndo is false', () => {
    const { getByLabelText } = renderWithTheme(
      <UndoRedoButtons canUndo={false} canRedo onUndo={jest.fn()} onRedo={jest.fn()} />,
    );

    expect(getByLabelText('undo')).toHaveProp('accessibilityState', { disabled: true });
  });

  it('disables redo when canRedo is false', () => {
    const { getByLabelText } = renderWithTheme(
      <UndoRedoButtons canUndo canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />,
    );

    expect(getByLabelText('redo')).toHaveProp('accessibilityState', { disabled: true });
  });

  it('fires onUndo when undo is pressed', () => {
    const onUndo = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <UndoRedoButtons canUndo canRedo onUndo={onUndo} onRedo={jest.fn()} />,
    );

    fireEvent.press(getByLabelText('undo'));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('fires onRedo when redo is pressed', () => {
    const onRedo = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <UndoRedoButtons canUndo canRedo onUndo={jest.fn()} onRedo={onRedo} />,
    );

    fireEvent.press(getByLabelText('redo'));

    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
