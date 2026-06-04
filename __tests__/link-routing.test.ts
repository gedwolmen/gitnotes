import React from 'react';
import { Alert, Linking, ScrollView, Text } from 'react-native';

jest.mock('react-native-marked', () => ({
  Renderer: class {
    private key = 0;
    getKey() {
      this.key += 1;
      return `key-${this.key}`;
    }
  },
}));

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { classifyHref } from '../src/utils/linkClassifier';
import { NotePreviewRenderer } from '../src/utils/markdownRenderer';
import { Note } from '../src/models/Note';

describe('classifyHref', () => {
  it('classifies anchor links using heading slug rules', () => {
    expect(classifyHref('#Anchor Slug')).toEqual({ kind: 'anchor', target: 'anchor-slug' });
  });

  it('resolves sibling note links', () => {
    expect(classifyHref('foo.md', 'notes/current.md')).toEqual({ kind: 'note', target: 'notes/foo.md' });
    expect(classifyHref('./notes/foo.md', 'docs/current.md')).toEqual({ kind: 'note', target: 'docs/notes/foo.md' });
  });

  it('resolves parent-relative note links', () => {
    expect(classifyHref('../shared/foo.md', 'notes/daily/today.md')).toEqual({ kind: 'note', target: 'notes/shared/foo.md' });
  });

  it('classifies web links', () => {
    expect(classifyHref('https://example.com')).toEqual({ kind: 'web', target: 'https://example.com' });
    expect(classifyHref('http://example.com')).toEqual({ kind: 'web', target: 'http://example.com' });
  });

  it('classifies mailto and tel links', () => {
    expect(classifyHref('mailto:hello@example.com')).toEqual({ kind: 'mailto', target: 'hello@example.com' });
    expect(classifyHref('tel:+15551234567')).toEqual({ kind: 'mailto', target: '+15551234567' });
  });

  it('classifies extension-less local paths as note candidates', () => {
    expect(classifyHref('other-note', 'notes/current.md')).toEqual({ kind: 'note', target: 'notes/other-note' });
    expect(classifyHref('sub/page', 'notes/current.md')).toEqual({ kind: 'note', target: 'notes/sub/page' });
  });

  it('returns web kind for bare domain-like hrefs, auto-prefixing https://', () => {
    expect(classifyHref('home.com', 'notes/current.md')).toEqual({ kind: 'web', target: 'https://home.com' });
  });
});

describe('NotePreviewRenderer link routing', () => {
  const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    openUrlSpy.mockRestore();
    alertSpy.mockRestore();
  });

  function createRenderer(overrides: Partial<ConstructorParameters<typeof NotePreviewRenderer>[0]> = {}) {
    return new NotePreviewRenderer({
      colors: { primary: '#2563eb', text: '#111', surfaceSecondary: '#eee' },
      previewContent: '# Intro\nBody\n## Deep Link\nMore body',
      previewScrollRef: { current: { scrollTo: jest.fn() } as unknown as ScrollView },
      currentNotePath: 'notes/current.md',
      onOpenNote: jest.fn(() => true),
      ...overrides,
    });
  }

  function pressLink(renderer: NotePreviewRenderer, href: string) {
    const element = renderer.link(['label'], href) as React.ReactElement<React.ComponentProps<typeof Text>>;
    (element.props as { onPress?: (event: unknown) => void }).onPress?.(undefined);
  }

  it('opens external web links with Linking', () => {
    const renderer = createRenderer();
    pressLink(renderer, 'https://example.com');

    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com');
  });

  it('routes note links through the note opener', () => {
    const onOpenNote = jest.fn(() => true);
    const renderer = createRenderer({ onOpenNote });
    pressLink(renderer, './child.md');

    expect(onOpenNote).toHaveBeenCalledWith('notes/child.md', undefined);
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('forwards the fragment when a cross-file note link carries an anchor', () => {
    const onOpenNote = jest.fn(() => true);
    const renderer = createRenderer({ onOpenNote });
    pressLink(renderer, './child.md#Section Two');

    expect(onOpenNote).toHaveBeenCalledWith('notes/child.md', 'section-two');
  });

  it('alerts when linked note cannot be found', () => {
    const renderer = createRenderer({ onOpenNote: jest.fn(() => false) });
    pressLink(renderer, './missing.md');

    expect(alertSpy).toHaveBeenCalledWith('Link target not found');
  });

  it('scrolls preview for anchor links', () => {
    const scrollTo = jest.fn();
    const renderer = createRenderer({
      previewScrollRef: { current: { scrollTo } as unknown as ScrollView },
      approxLinePx: 30,
    });
    pressLink(renderer, '#Deep Link');

    expect(scrollTo).toHaveBeenCalledWith({ y: 60, animated: true });
  });

  it('resolves relative parent paths in note links (../../test-notes)', () => {
    const onOpenNote = jest.fn(() => true);
    const renderer = createRenderer({ currentNotePath: 'notes/subfolder/current.md', onOpenNote });
    pressLink(renderer, '../../test-notes');

    expect(onOpenNote).toHaveBeenCalledWith('test-notes', undefined);
  });

  it('resolves relative parent paths with file extension', () => {
    const onOpenNote = jest.fn(() => true);
    const renderer = createRenderer({ currentNotePath: 'notes/deep/nested/current.md', onOpenNote });
    pressLink(renderer, '../../shared/spec.md');

    expect(onOpenNote).toHaveBeenCalledWith('notes/shared/spec.md', undefined);
  });
});

describe('handleOpenLinkedNote path resolution', () => {
  const mockNavigation = { navigate: jest.fn() } as any;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  function createMockNotes(): Note[] {
    return [
      { id: '1', title: 'Test Notes', filePath: 'test-notes.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
      { id: '2', title: 'Shared Spec', filePath: 'notes/shared/spec.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
      { id: '3', title: 'Current Note', filePath: 'notes/subfolder/current.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
    ];
  }

  function pressLink(renderer: NotePreviewRenderer, href: string) {
    const element = renderer.link(['label'], href) as React.ReactElement<React.ComponentProps<typeof Text>>;
    (element.props as { onPress?: (event: unknown) => void }).onPress?.(undefined);
  }

  it('resolves ../../test-notes to test-notes.md and finds the note', () => {
    const notes = createMockNotes();
    const onOpenNote = jest.fn((path: string) => {
      return notes.some(n => n.filePath === path);
    });
    const renderer = new NotePreviewRenderer({
      colors: { primary: '#2563eb', text: '#111', surfaceSecondary: '#eee' },
      previewContent: '# Test\nContent',
      previewScrollRef: { current: { scrollTo: jest.fn() } as unknown as ScrollView },
      currentNotePath: 'notes/subfolder/current.md',
      onOpenNote,
    });

    pressLink(renderer, '../../test-notes');
    expect(onOpenNote).toHaveBeenCalledWith('test-notes', undefined);
  });

  it('finds note at root level when linking with ../../test-notes from nested folder', () => {
    const notes = createMockNotes();
    const onOpenNote = jest.fn((path: string) => {
      return notes.some(n => n.filePath === path || n.filePath === path + '.md');
    });
    const renderer = new NotePreviewRenderer({
      colors: { primary: '#2563eb', text: '#111', surfaceSecondary: '#eee' },
      previewContent: '# Test\nContent',
      previewScrollRef: { current: { scrollTo: jest.fn() } as unknown as ScrollView },
      currentNotePath: 'notes/subfolder/current.md',
      onOpenNote,
    });

    pressLink(renderer, '../../test-notes');
    expect(onOpenNote).toHaveBeenCalledWith('test-notes', undefined);
    expect(onOpenNote('test-notes')).toBe(true);
  });

  it('prefers title match over extension fallback for extension-less links', () => {
    const notes: Note[] = [
      { id: '1', title: 'My Notes', filePath: 'notes/my-notes.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
      { id: '2', title: 'Other', filePath: 'notes/other.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
    ];
    const onOpenNote = jest.fn((path: string) => {
      return notes.some(n => n.filePath === path || n.title.toLowerCase() === path.toLowerCase() || n.title.toLowerCase().replace(/\s+/g, '-') === path.toLowerCase().replace(/\s+/g, '-'));
    });
    const renderer = new NotePreviewRenderer({
      colors: { primary: '#2563eb', text: '#111', surfaceSecondary: '#eee' },
      previewContent: '# Test\nContent',
      previewScrollRef: { current: { scrollTo: jest.fn() } as unknown as ScrollView },
      currentNotePath: 'notes/subfolder/current.md',
      onOpenNote,
    });

    pressLink(renderer, '../../My Notes');
    expect(onOpenNote).toHaveBeenCalledWith('My Notes', undefined);
    expect(onOpenNote('My Notes')).toBe(true);
  });

  it('falls back to extension resolution when no title match exists', () => {
    const notes: Note[] = [
      { id: '1', title: 'Some Title', filePath: 'notes/some-title.md', content: '', format: 'markdown', repo: 'r', branch: 'b', folderPath: '', tags: [], updatedAt: 0, createdAt: 0 },
    ];
    const onOpenNote = jest.fn((path: string) => {
      return notes.some(n => n.filePath === path || n.filePath === path + '.md' || n.title.toLowerCase().replace(/\s+/g, '-') === path.toLowerCase().replace(/\s+/g, '-'));
    });
    const renderer = new NotePreviewRenderer({
      colors: { primary: '#2563eb', text: '#111', surfaceSecondary: '#eee' },
      previewContent: '# Test\nContent',
      previewScrollRef: { current: { scrollTo: jest.fn() } as unknown as ScrollView },
      currentNotePath: 'notes/subfolder/current.md',
      onOpenNote,
    });

    pressLink(renderer, '../../some-title');
    expect(onOpenNote).toHaveBeenCalledWith('some-title', undefined);
    expect(onOpenNote('some-title')).toBe(true);
  });
});
