import React, { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BacklinksProvider, useBacklinks } from '../src/contexts/BacklinksContext';
import { Note } from '../src/models/Note';
import { useNotesData } from '../src/contexts/NoteContext';

jest.mock('../src/contexts/NoteContext', () => ({
  useNotesData: jest.fn(),
}));

const mockedUseNotesData = useNotesData as jest.MockedFunction<typeof useNotesData>;

function createNote(overrides: Partial<Note> & Pick<Note, 'id' | 'title' | 'content'>): Note {
  return {
    id: overrides.id,
    title: overrides.title,
    content: overrides.content,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    tags: overrides.tags ?? [],
    filePath: overrides.filePath,
    format: overrides.format ?? 'markdown',
  };
}

function Probe({ noteId, shouldRefresh = false }: { noteId: string; shouldRefresh?: boolean }) {
  const { getBacklinks, refreshBacklinks } = useBacklinks();

  useEffect(() => {
    if (shouldRefresh) {
      refreshBacklinks();
    }
  }, [refreshBacklinks, shouldRefresh]);

  const backlinks = getBacklinks(noteId);
  return <Text testID="probe">{`${backlinks.length}:${backlinks[0]?.sourceNoteTitle ?? 'none'}`}</Text>;
}

describe('BacklinksContext', () => {
  beforeEach(() => {
    mockedUseNotesData.mockReset();
  });

  it('returns backlinks for a note id from provider state', () => {
    mockedUseNotesData.mockReturnValue({
      notes: [
        createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'Links to [[B]]' }),
        createNote({ id: 'b', title: 'B', filePath: 'B.md', content: '' }),
      ],
      isLoading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      filteredNotes: [],
    });

    const { getByTestId } = render(
      <BacklinksProvider>
        <Probe noteId="b" />
      </BacklinksProvider>,
    );

    expect(getByTestId('probe').props.children).toBe('1:A');
  });

  it('returns an empty list for unknown note ids', () => {
    mockedUseNotesData.mockReturnValue({
      notes: [createNote({ id: 'a', title: 'A', filePath: 'A.md', content: '' })],
      isLoading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      filteredNotes: [],
    });

    const { getByTestId } = render(
      <BacklinksProvider>
        <Probe noteId="missing" />
      </BacklinksProvider>,
    );

    expect(getByTestId('probe').props.children).toBe('0:none');
  });

  it('refreshes the memoized backlink index on demand', async () => {
    const notes = [
      createNote({ id: 'a', title: 'A', filePath: 'A.md', content: 'No links yet' }),
      createNote({ id: 'b', title: 'B', filePath: 'B.md', content: '' }),
    ];

    mockedUseNotesData.mockImplementation(() => ({
      notes,
      isLoading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: jest.fn(),
      filteredNotes: [],
    }));

    const view = render(
      <BacklinksProvider>
        <Probe noteId="b" />
      </BacklinksProvider>,
    );

    expect(view.getByTestId('probe').props.children).toBe('0:none');

    notes[0] = { ...notes[0], content: 'Now links to [[B]]' };

    view.rerender(
      <BacklinksProvider>
        <Probe noteId="b" shouldRefresh />
      </BacklinksProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId('probe').props.children).toBe('1:A');
    });
  });

  it('throws when useBacklinks is used outside the provider', () => {
    expect(() => render(<Probe noteId="a" />)).toThrow('useBacklinks must be used within a BacklinksProvider');
  });
});
