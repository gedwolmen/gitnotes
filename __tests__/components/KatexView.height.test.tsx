import React from 'react';
import { render, act } from '@testing-library/react-native';

let lastHandleMessage: ((event: any) => void) | null = null;

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: (props: any) => {
      lastHandleMessage = props.onMessage;
      return <View testID="katex-view.webview" style={props.style} />;
    },
  };
});

import KatexView from '../../src/components/KatexView';

const flatten = (style: any): any =>
  Array.isArray(style)
    ? Object.assign({}, ...style.flatMap((s) => [flatten(s)]))
    : style ?? {};

describe('KatexView internal height (issue #670)', () => {
  beforeEach(() => {
    lastHandleMessage = null;
  });

  test('container starts at 0 minHeight before WebView reports back', () => {
    const { getByTestId } = render(
      <KatexView expression="E = mc^2" displayMode="inline" isDark={false} />,
    );
    const container = getByTestId('katex-view.container');
    expect(flatten(container.props.style).minHeight ?? 0).toBe(0);
  });

  test('container minHeight grows after WebView posts a height message', () => {
    const { getByTestId } = render(
      <KatexView expression="E = mc^2" displayMode="inline" isDark={false} />,
    );

    expect(lastHandleMessage).not.toBeNull();
    act(() => lastHandleMessage!({ nativeEvent: { data: '42' } }));

    const container = getByTestId('katex-view.container');
    expect(flatten(container.props.style).minHeight).toBe(42);
  });

  test('subsequent height updates apply', () => {
    const { getByTestId } = render(
      <KatexView expression="x" displayMode="block" isDark={true} />,
    );

    act(() => lastHandleMessage!({ nativeEvent: { data: '20' } }));
    act(() => lastHandleMessage!({ nativeEvent: { data: '80' } }));

    const container = getByTestId('katex-view.container');
    expect(flatten(container.props.style).minHeight).toBe(80);
  });

  test('still calls onHeightChange callback', () => {
    const onHeightChange = jest.fn();
    render(
      <KatexView
        expression="x"
        displayMode="inline"
        isDark={false}
        onHeightChange={onHeightChange}
      />,
    );
    act(() => lastHandleMessage!({ nativeEvent: { data: '24' } }));
    expect(onHeightChange).toHaveBeenCalledWith(24);
  });
});
