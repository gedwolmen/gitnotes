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

import { classifyHref } from '../src/utils/linkClassifier';
import { NotePreviewRenderer } from '../src/utils/markdownRenderer';

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

    expect(onOpenNote).toHaveBeenCalledWith('notes/child.md');
    expect(openUrlSpy).not.toHaveBeenCalled();
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
});
