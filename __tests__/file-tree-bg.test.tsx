import { StyleSheet } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#111111',
      surface: '#222222',
      primary: '#2563eb',
      text: '#f9fafb',
      textSecondary: '#9ca3af',
      border: '#374151',
    },
  }),
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    getRepoContents: jest.fn().mockResolvedValue([
      { name: 'notes.md', path: 'notes.md', type: 'file', sha: 'abc', size: 12 },
    ]),
    getFileContent: jest.fn(),
    getFileSha: jest.fn(),
    moveFile: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/components/ContextMenu', () => () => null);
jest.mock('../src/components/ui', () => {
  const ReactMock = require('react');
  const { View: RNView, Text: RNText } = require('react-native');
  const { forwardRef } = ReactMock;

  const passthrough = (Component: any = RNView) =>
    forwardRef(({ children, style, ...props }: any, ref: any) => (
      <Component ref={ref} style={style} {...props}>
        {children}
      </Component>
    ));

  return {
    Group: passthrough(RNView),
    GroupRow: passthrough(RNView),
    Modal: ({ children }: any) => <RNView>{children}</RNView>,
    Input: forwardRef((props: any, ref: any) => <RNView ref={ref} {...props} />),
    Button: ({ label }: any) => <RNText>{label}</RNText>,
  };
});

import RepoFileTree from '../src/components/RepoFileTree';

const isBlackBg = (value: unknown) =>
  value === '#000' || value === '#000000' || value === 'black';

describe('file tree backgrounds', () => {
  it('uses theme colors instead of black backgrounds', async () => {
    const screen = render(<RepoFileTree owner="acme" repo="notes" />);

    await waitFor(() => expect(screen.queryAllByText('notes.md').length).toBeGreaterThan(0));

    const root = screen.getByTestId('repo-file-tree-root');
    const styles = StyleSheet.flatten(root.props.style);

    expect(isBlackBg(styles?.backgroundColor)).toBe(false);
    expect(styles?.backgroundColor).toBe('#222222');
  });
});
