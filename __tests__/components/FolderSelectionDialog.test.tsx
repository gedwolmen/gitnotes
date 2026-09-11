import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FolderSelectionDialog from '@/components/FolderSelectionDialog';

const mockCreateFolder = jest.fn();

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f5f5f5',
      surfaceSecondary: '#eee',
      primary: '#07f',
      text: '#000',
      textSecondary: '#666',
      border: '#ccc',
      error: '#f00',
    },
  }),
}));

jest.mock('@/contexts/FolderContext', () => ({
  useFolders: () => ({
    folders: [
      {
        id: 'projects',
        name: 'Projects',
        path: '/Projects',
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    createFolder: mockCreateFolder,
  }),
}));

jest.mock('@/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/components/ui', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('FolderSelectionDialog nested folder creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateFolder.mockResolvedValue({
      id: 'frontend',
      name: 'Frontend',
      path: '/Projects/Frontend',
      parentId: 'projects',
      createdAt: 2,
      updatedAt: 2,
    });
  });

  it('creates a folder inside the selected parent folder', async () => {
    const { getByTestId, getByPlaceholderText, getByText } = render(
      <FolderSelectionDialog
        visible
        selectedFolderId={null}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('folder-selection.button.create'));
    fireEvent.press(getByTestId('folder-selection.button.parent.projects'));
    fireEvent.changeText(getByPlaceholderText('Folder name'), 'Frontend');
    fireEvent.press(getByText('Create'));

    await waitFor(() => {
      expect(mockCreateFolder).toHaveBeenCalledWith({
        name: 'Frontend',
        parentId: 'projects',
      });
    });
  });
});
