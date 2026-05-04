jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { CodeBlock } from '../src/components/CodeBlock';
import { getThemeColors } from '../src/utils/syntaxHighlight';

describe('CodeBlock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders code text content with syntax-highlighted token colors', () => {
    const { getByText } = render(
      <CodeBlock code={'const greeting = "hi";'} language="ts" isDark={false} />,
    );
    const colors = getThemeColors(false);

    expect(getByText('const')).toBeTruthy();
    expect(getByText('greeting')).toBeTruthy();
    expect(getByText('"hi"')).toBeTruthy();
    expect(StyleSheet.flatten(getByText('const').props.style).color).toBe(colors.keyword);
    expect(StyleSheet.flatten(getByText('greeting').props.style).color).toBe(colors.plain);
    expect(StyleSheet.flatten(getByText('"hi"').props.style).color).toBe(colors.string);
  });

  it('shows a language label when provided', () => {
    const { getByText } = render(<CodeBlock code="console.log('hi')" language="tsx" isDark={true} />);

    expect(getByText('TSX')).toBeTruthy();
  });

  it('shows a copy button', () => {
    const { getByRole } = render(<CodeBlock code="const a = 1;" isDark={false} />);

    expect(getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('copies the code content and shows temporary feedback', async () => {
    const code = 'const copied = true;';
    const { getByRole, getByText, queryByText } = render(
      <CodeBlock code={code} language="ts" isDark={false} />,
    );

    fireEvent.press(getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(code);
    });

    expect(getByText('Copied!')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(queryByText('Copied!')).toBeNull();
  });

  it('handles empty code blocks without error', () => {
    const { getByRole, queryByTestId } = render(<CodeBlock code="" isDark={true} />);

    expect(getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(queryByTestId('code-block-token')).toBeNull();
  });

  it('wraps long code blocks in a scroll view', () => {
    const longCode = Array.from({ length: 40 }, (_, index) => `const line${index} = ${index};`).join('\n');
    const { getByTestId, UNSAFE_getByType } = render(<CodeBlock code={longCode} language="ts" isDark={false} />);

    expect(getByTestId('code-block-scroll-view')).toBeTruthy();
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });
});
