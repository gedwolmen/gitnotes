import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) =>
    opts?.example ? `${key}|${opts.example}` : key }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: stableColors,
    isDark: false,
    tokens: {
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
      type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    },
  }),
}));

const mockAddRepository = jest.fn(async (path: string, _name: string | undefined, provider: string) => ({
  id: `${provider}:${Date.now()}`,
  name: path.split('/').pop() || path,
  path,
  branch: 'main',
  provider,
}));

jest.mock('../src/stores/repoStore', () => ({
  useRepoStore: (selector: any) => selector({ addRepository: mockAddRepository }),
}));

jest.mock('../src/components/ui', () => {
  const { View } = require('react-native');
  return {
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
  };
});

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

import { AddRepoModal } from '../src/components/AddRepoModal';

beforeEach(() => {
  mockAddRepository.mockClear();
});

describe('AddRepoModal', () => {
  it('shows all four host options and defaults to GitHub', () => {
    const { getByTestId } = render(<AddRepoModal visible onClose={() => {}} colors={stableColors} />);
    expect(getByTestId('add-repo-provider-github')).toBeTruthy();
    expect(getByTestId('add-repo-provider-gitlab')).toBeTruthy();
    expect(getByTestId('add-repo-provider-gitea')).toBeTruthy();
    expect(getByTestId('add-repo-provider-forgejo')).toBeTruthy();
  });

  it('disables submit when path is empty', () => {
    const { getByTestId } = render(<AddRepoModal visible onClose={() => {}} colors={stableColors} />);
    expect(getByTestId('add-repo-submit').props.accessibilityState?.disabled).toBe(true);
  });

  it('uses the namespace/project placeholder for GitLab', () => {
    const { getByTestId, getByPlaceholderText } = render(
      <AddRepoModal visible onClose={() => {}} colors={stableColors} />,
    );
    fireEvent.press(getByTestId('add-repo-provider-gitlab'));
    expect(getByPlaceholderText('namespace/project')).toBeTruthy();
  });

  it('uses the owner/repo placeholder for GitHub / Gitea / Forgejo', () => {
    const { getByTestId, getByPlaceholderText } = render(
      <AddRepoModal visible onClose={() => {}} colors={stableColors} />,
    );
    fireEvent.press(getByTestId('add-repo-provider-gitea'));
    expect(getByPlaceholderText('owner/repo')).toBeTruthy();
    fireEvent.press(getByTestId('add-repo-provider-forgejo'));
    expect(getByPlaceholderText('owner/repo')).toBeTruthy();
  });

  it('submits the chosen provider to addRepository', async () => {
    const onAdded = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <AddRepoModal visible onClose={onClose} onAdded={onAdded} colors={stableColors} />,
    );
    fireEvent.press(getByTestId('add-repo-provider-gitlab'));
    fireEvent.changeText(getByTestId('add-repo-path-input'), 'inkscape/inkscape');
    await waitFor(() => {
      fireEvent.press(getByTestId('add-repo-submit'));
    });
    await waitFor(() => expect(mockAddRepository).toHaveBeenCalled());
    expect(mockAddRepository).toHaveBeenCalledWith('inkscape/inkscape', undefined, 'gitlab');
    expect(onAdded).toHaveBeenCalledWith('inkscape/inkscape', 'gitlab');
  });
});
