import { render } from '@testing-library/react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import ConflictResolveScreen from '@/screens/ConflictResolveScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: jest.fn(),
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (state: { repositories: unknown[] }) => unknown) =>
    selector({ repositories: [] }),
}));

jest.mock('@/stores/gitButtonActionStore', () => ({
  useGitButtonActionStore: (selector: (state: { setPending: jest.Mock }) => unknown) =>
    selector({ setPending: jest.fn() }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTokens: () => ({
    colors: {
      background: '#fff',
      border: '#ddd',
      text: '#111',
      textSecondary: '#666',
      accent: '#00f',
      card: '#eee',
      error: '#f00',
      surface: '#fff',
    },
  }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

describe('ConflictResolveScreen', () => {
  it('keeps the resolver body visible when the repository is unavailable', () => {
    (useNavigation as jest.Mock).mockReturnValue({ goBack: jest.fn(), navigate: jest.fn() });
    (useRoute as jest.Mock).mockReturnValue({ params: { repoId: 'repo-1', path: 'notes/hi2.md' } });

    const screen = render(<ConflictResolveScreen />);

    expect(screen.getByTestId('conflict-resolve.screen').props.style).toEqual(
      expect.objectContaining({ flex: 1 }),
    );
    expect(screen.getByText('Repository not found.')).toBeTruthy();
  });
});
