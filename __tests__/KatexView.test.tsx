import { act, render } from '@testing-library/react-native';

import KatexView from '../src/components/KatexView';

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: (props: any) => <View testID="webview" {...props} /> };
});

describe('KatexView', () => {
  it('renders inline math with displayMode false', () => {
    const { getByTestId } = render(
      <KatexView expression="E = mc^2" displayMode="inline" isDark={false} />,
    );

    const webview = getByTestId('webview');

    expect(webview.props.injectedJavaScript).toContain('katex.render');
    expect(webview.props.injectedJavaScript).toContain('"E = mc^2"');
    expect(webview.props.injectedJavaScript).toContain('displayMode: false');
  });

  it('renders block math with displayMode true', () => {
    const { getByTestId } = render(
      <KatexView expression="\\sum_{i=1}^n x_i" displayMode="block" isDark={false} />,
    );

    const webview = getByTestId('webview');

    expect(webview.props.injectedJavaScript).toContain('displayMode: true');
  });

  it('passes inline KaTeX html bundle to the WebView', () => {
    const { getByTestId } = render(
      <KatexView expression="a+b" displayMode="inline" isDark={false} />,
    );

    const webview = getByTestId('webview');
    const html = webview.props.source.html as string;

    expect(html).toContain('katex.render');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).not.toContain('cdn');
  });

  it('fires the height callback when the WebView posts a message', () => {
    const onHeightChange = jest.fn();
    const { getByTestId } = render(
      <KatexView expression="x" displayMode="inline" isDark={false} onHeightChange={onHeightChange} />,
    );

    const webview = getByTestId('webview');

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: '123' } });
    });

    expect(onHeightChange).toHaveBeenCalledWith(123);
  });

  it('uses a dark background in the generated html', () => {
    const { getByTestId } = render(
      <KatexView expression="x" displayMode="inline" isDark />,
    );

    const webview = getByTestId('webview');
    const html = webview.props.source.html as string;

    expect(html).toContain('background:#0f172a');
  });
});
