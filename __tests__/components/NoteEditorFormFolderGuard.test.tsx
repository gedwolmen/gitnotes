import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { NoteEditorForm } from '../../src/components/editor/NoteEditorForm';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#eee',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
    isDark: false,
  }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { light: jest.fn(), selection: jest.fn() },
}));

jest.mock('../../src/components/GitContextPicker', () => () => null);
jest.mock('../../src/components/MarkdownEditor', () => () => null);
jest.mock('../../src/components/TagInput', () => () => null);

function makeProps(overrides: Partial<React.ComponentProps<typeof NoteEditorForm>> = {}) {
  return {
    repo: undefined,
    branch: undefined,
    commit: undefined,
    title: '',
    folderPath: undefined,
    noteFormat: 'markdown' as const,
    tags: [],
    canvasJsonRefs: [],
    content: '',
    placeholder: '',
    onRepoChange: jest.fn(),
    onBranchChange: jest.fn(),
    onCommitChange: jest.fn(),
    onTitleChange: jest.fn(),
    onOpenFolderDialog: jest.fn(),
    onNoteFormatChange: jest.fn(),
    onTagsChange: jest.fn(),
    onEditCanvasJson: jest.fn(),
    onContentChange: jest.fn(),
    ...overrides,
  };
}

describe('NoteEditorForm folder selector guard', () => {
  it('shows hint and blocks dialog when no repo selected', () => {
    const onOpenFolderDialog = jest.fn();
    const { getByTestId } = render(
      <NoteEditorForm {...makeProps({ repo: undefined, onOpenFolderDialog })} />,
    );

    expect(getByTestId('note-editor-form.text.folder-no-repo-hint')).toBeTruthy();
    fireEvent.press(getByTestId('note-editor-form.button.open-folder'));
    expect(onOpenFolderDialog).not.toHaveBeenCalled();
  });

  it('opens dialog when repo is selected and hides hint', () => {
    const onOpenFolderDialog = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <NoteEditorForm {...makeProps({ repo: 'owner/repo', onOpenFolderDialog })} />,
    );

    expect(queryByTestId('note-editor-form.text.folder-no-repo-hint')).toBeNull();
    fireEvent.press(getByTestId('note-editor-form.button.open-folder'));
    expect(onOpenFolderDialog).toHaveBeenCalledTimes(1);
  });
});
