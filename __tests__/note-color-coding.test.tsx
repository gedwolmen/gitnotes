jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: any) => createElement(Text, null, name) };
});

jest.mock('../src/hooks/useResponsive', () => ({ useResponsive: () => ({ isTablet: false }) }));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  default: {},
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    updateFile: jest.fn(async () => ({ ok: true })),
    getSavedRepositories: jest.fn(),
    getTreeRecursive: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    createNote: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import NoteCard from '../src/components/NoteCard';
import { Note, NOTE_COLOR_VALUES, isNoteColor, updateNote } from '../src/models/Note';
import {
  applyNoteColorToContent,
  syncNoteToGitHub,
} from '../src/services/NoteGitHubSyncService';
import { pullFromSingleRepo } from '../src/services/RepoPullService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';
import { TestThemeProvider } from './ui/testThemeProvider';

const buildNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  title: 'Color note',
  content: 'body',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  ...overrides,
});

describe('NoteCard color coding', () => {
  it('renders the mapped border color when note has a color', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <NoteCard note={buildNote({ color: 'purple' })} onPress={jest.fn()} />
      </TestThemeProvider>,
    );

    const style = StyleSheet.flatten(getByTestId('note-card-note-1').props.style);
    expect(style.borderColor).toBe('#8b5cf6');
    expect(style.borderWidth).toBe(2);
  });

  it('renders without extra border when note has no color', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <NoteCard note={buildNote()} onPress={jest.fn()} />
      </TestThemeProvider>,
    );

    const style = StyleSheet.flatten(getByTestId('note-card-note-1').props.style);
    expect(style.borderColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });
});

describe('Note color model', () => {
  it('exposes the eight preset color values', () => {
    expect(NOTE_COLOR_VALUES).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'gray',
    ]);
  });

  it('isNoteColor narrows to known presets only', () => {
    expect(isNoteColor('purple')).toBe(true);
    expect(isNoteColor('mauve')).toBe(false);
    expect(isNoteColor(null)).toBe(false);
  });

  it('updateNote() preserves existing color when input.color is undefined', () => {
    const existing = buildNote({ color: 'green' });
    const next = updateNote(existing, { title: 'renamed' });
    expect(next.color).toBe('green');
  });

  it('updateNote() clears color when input.color is null', () => {
    const existing = buildNote({ color: 'green' });
    const next = updateNote(existing, { color: null });
    expect(next.color).toBeUndefined();
  });

  it('updateNote() replaces color when input.color is a NoteColor', () => {
    const existing = buildNote({ color: 'green' });
    const next = updateNote(existing, { color: 'red' });
    expect(next.color).toBe('red');
  });
});

describe('applyNoteColorToContent (serialize)', () => {
  it('inserts a frontmatter block on a markdown note with no frontmatter', () => {
    const out = applyNoteColorToContent('hello', 'markdown', 'red');
    expect(out).toContain('---\ncolor: red\n---');
    expect(out).toContain('hello');
  });

  it('upserts color alongside existing frontmatter entries', () => {
    const out = applyNoteColorToContent(
      '---\ntags: [a, b]\n---\n\nbody',
      'markdown',
      'blue',
    );
    expect(out).toMatch(/tags: \[a, b\]/);
    expect(out).toMatch(/color: blue/);
  });

  it('removes the color line when color is null', () => {
    const out = applyNoteColorToContent(
      '---\ncolor: blue\ntags: [a]\n---\n\nbody',
      'markdown',
      null,
    );
    expect(out).not.toMatch(/color:/);
    expect(out).toMatch(/tags: \[a\]/);
  });

  it('handles org notes with #+COLOR header', () => {
    const out = applyNoteColorToContent('* Heading', 'org', 'green');
    expect(out.startsWith('#+COLOR: green')).toBe(true);
  });

  it('handles neorg notes inside @document.meta', () => {
    const out = applyNoteColorToContent('body', 'neorg', 'pink');
    expect(out).toContain('@document.meta');
    expect(out).toContain('color: pink');
    expect(out).toContain('@end');
  });
});

describe('color round-trip via GitHub sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
  });

  it('writes color to frontmatter when syncing to GitHub', async () => {
    (GitHubService.updateFile as jest.Mock).mockResolvedValue({ ok: true });

    await syncNoteToGitHub({
      repo: 'org/repo',
      branch: 'main',
      title: 'Color Note',
      content: 'body text',
      format: 'markdown',
      tags: ['t1'],
      color: 'purple',
    });

    expect(GitHubService.updateFile).toHaveBeenCalledWith(
      'org',
      'repo',
      'notes/color-note.md',
      expect.stringMatching(/color: purple/),
      'Create note: Color Note',
      'main',
      undefined,
    );
  });

  it('parses color back from frontmatter on pull', async () => {
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
    (GitHubService.getTreeRecursive as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/color-note.md' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(
      '---\ncolor: purple\ntags: [t1]\n---\n\nbody text',
    );

    await pullFromSingleRepo('org/repo');

    expect(StorageService.saveAllNotes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          color: 'purple',
          tags: ['t1'],
          filePath: 'notes/color-note.md',
        }),
      ]),
    );
  });

  it('discards unknown color tokens during pull', async () => {
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
    (GitHubService.getTreeRecursive as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/bad-color.md' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(
      '---\ncolor: turquoise\n---\n\nbody',
    );

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved[0].color).toBeUndefined();
  });
});
