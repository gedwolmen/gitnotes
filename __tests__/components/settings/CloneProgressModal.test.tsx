import { render, act } from '@testing-library/react-native';
import { CloneProgressContent } from '../../../src/components/settings/CloneProgressModal';

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      text: '#000',
      textSecondary: '#666',
      primary: '#0af',
      border: '#ccc',
      error: '#f00',
      background: '#fff',
      surface: '#eee',
    },
  }),
  useTokens: () => ({
    colors: {
      text: '#000',
      textSecondary: '#666',
      primary: '#0af',
      border: '#ccc',
      error: '#f00',
      background: '#fff',
      surface: '#eee',
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
    type: { sm: 14, lg: 20, xs: 12 },
  }),
}));

jest.mock('../../../src/components/ui', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Button: ({ testID, label, onPress }: any) =>
      React.createElement(View, { testID, onPress }, React.createElement(Text, null, label ?? '')),
    Modal: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

const base = { repoName: 'octo/notes', phase: 'Receiving objects', loaded: 0, total: null };

const collectDotsText = (getByText: any): string | null => {
  try {
    const el = getByText(/^Receiving objects \.{1,3}$/);
    const c = el.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  } catch {
    return null;
  }
};

describe('CloneProgressContent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows cycling dots when total is null (animated alive indicator)', () => {
    const seen = new Set<string>();
    const { getByText, rerender } = render(
      <CloneProgressContent progress={base} onCancel={jest.fn()} />,
    );
    seen.add(collectDotsText(getByText) ?? '<none>');
    for (let i = 0; i < 5; i++) {
      act(() => {
        jest.advanceTimersByTime(400);
      });
      rerender(<CloneProgressContent progress={base} onCancel={jest.fn()} />);
      seen.add(collectDotsText(getByText) ?? '<none>');
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it('shows the percentage label and no dots when total is numeric', () => {
    const { getByText, queryByText } = render(
      <CloneProgressContent
        progress={{ ...base, total: 100, loaded: 25 }}
        onCancel={jest.fn()}
      />,
    );
    expect(getByText('Receiving objects · 25%')).toBeTruthy();
    expect(queryByText(/^Receiving objects \.{1,3}$/)).toBeNull();
  });

  it('renders the error branch with Cancel/Retry and no dots', () => {
    const onCancel = jest.fn();
    const onRetry = jest.fn();
    const { getByText, getByTestId, queryByText } = render(
      <CloneProgressContent
        progress={{ ...base, error: 'ECONNRESET' }}
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );
    expect(getByText('Clone Failed')).toBeTruthy();
    expect(getByText('ECONNRESET')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
    expect(queryByText(/^Receiving objects \.{1,3}$/)).toBeNull();
  });
});
