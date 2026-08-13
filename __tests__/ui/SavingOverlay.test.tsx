import React from 'react';
import { render } from '@testing-library/react-native';

import { SavingOverlay } from '../../src/components/ui/SavingOverlay';
import { TestThemeProvider } from './testThemeProvider';

describe('SavingOverlay', () => {
  it('renders the loader and label when visible', () => {
    const { getByTestId, getByText } = render(
      <TestThemeProvider>
        <SavingOverlay visible label="Saving…" />
      </TestThemeProvider>,
    );
    expect(getByTestId('saving-overlay')).toBeTruthy();
    expect(getByText('Saving…')).toBeTruthy();
  });

  it('renders without a label', () => {
    const { getByTestId, queryByText } = render(
      <TestThemeProvider>
        <SavingOverlay visible />
      </TestThemeProvider>,
    );
    expect(getByTestId('saving-overlay')).toBeTruthy();
    expect(queryByText('Saving…')).toBeNull();
  });

  it('blocks touches while visible', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <SavingOverlay visible label="Saving…" />
      </TestThemeProvider>,
    );
    expect(getByTestId('saving-overlay').props.pointerEvents).toBe('auto');
  });

  it('ignores touches while hidden', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <SavingOverlay visible={false} label="Saving…" />
      </TestThemeProvider>,
    );
    expect(getByTestId('saving-overlay').props.pointerEvents).toBe('none');
  });

  it('honors a custom testID', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <SavingOverlay visible testID="note-editor.saving-overlay" />
      </TestThemeProvider>,
    );
    expect(getByTestId('note-editor.saving-overlay')).toBeTruthy();
  });
});
