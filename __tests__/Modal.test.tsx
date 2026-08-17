import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

const mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const mockWindowDimensions = { width: 390, height: 844, scale: 2, fontScale: 1 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

import { Modal } from '../src/components/ui/Modal';
import { Surface } from '../src/components/ui/Surface';
import { TestThemeProvider } from './ui/testThemeProvider';

const PAD = 20; // spacing[5]

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  return render(
    <TestThemeProvider>
      <Modal visible onRequestClose={() => undefined} {...props}>
        <View />
      </Modal>
    </TestThemeProvider>,
  );
}

describe('Modal bottomSheet safe-area cap', () => {
  it('caps the bottomSheet surface maxHeight by the top inset', () => {
    const { UNSAFE_getByType } = renderModal({ bottomSheet: true });

    const surfaceStyle = StyleSheet.flatten(UNSAFE_getByType(Surface).props.style);
    const expected = mockWindowDimensions.height - PAD * 2 - mockInsets.top;

    expect(surfaceStyle.maxHeight).toBe(expected);
  });

  it('caps the bottomSheet wrapper height by the top inset', () => {
    const { UNSAFE_getAllByType } = renderModal({ bottomSheet: true });

    const expected = mockWindowDimensions.height - PAD * 2 - mockInsets.top;
    const wrapper = UNSAFE_getAllByType(View).find(
      (view) => StyleSheet.flatten(view.props.style)?.height === expected,
    );

    expect(wrapper).toBeTruthy();
  });

  it('keeps the default centered modal maxHeight at slotHeight', () => {
    const { UNSAFE_getByType } = renderModal();

    const surfaceStyle = StyleSheet.flatten(UNSAFE_getByType(Surface).props.style);
    expect(surfaceStyle.maxHeight).toBe(mockWindowDimensions.height - PAD * 2);
  });
});