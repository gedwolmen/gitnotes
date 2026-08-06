import {
  CANVAS_LINK_PREFIX,
  isCanvasLink,
  canvasIdFromLink,
  canvasToLink,
  sortCanvasesByUpdated,
  slugifyCanvasTitle,
  createCanvas,
  updateCanvas,
  DEFAULT_SCENE,
  Canvas,
} from '../src/models/Canvas';
import type { CanvasImage, CanvasText } from '../src/models/Canvas';

describe('Canvas link helpers', () => {
  test('CANVAS_LINK_PREFIX is "canvas:"', () => {
    expect(CANVAS_LINK_PREFIX).toBe('canvas:');
  });

  test('isCanvasLink recognises canvas: scheme', () => {
    expect(isCanvasLink('canvas:abc-123')).toBe(true);
    expect(isCanvasLink('canvas:')).toBe(true);
  });

  test('isCanvasLink rejects other schemes', () => {
    expect(isCanvasLink('https://example.com')).toBe(false);
    expect(isCanvasLink('note:abc')).toBe(false);
    expect(isCanvasLink('canva:abc')).toBe(false);
    expect(isCanvasLink('')).toBe(false);
  });

  test('canvasIdFromLink strips the canvas: prefix', () => {
    expect(canvasIdFromLink('canvas:abc-123')).toBe('abc-123');
    expect(canvasIdFromLink('canvas:canvas-1777626405429-p1xf264'))
      .toBe('canvas-1777626405429-p1xf264');
  });

  test('canvasToLink prepends the canvas: prefix', () => {
    const canvas = { id: 'foo' } as Canvas;
    expect(canvasToLink(canvas)).toBe('canvas:foo');
  });

  test('round-trip: canvasIdFromLink(canvasToLink(c)) === c.id', () => {
    const id = 'canvas-12345';
    const c = { id } as Canvas;
    expect(canvasIdFromLink(canvasToLink(c))).toBe(id);
  });
});

describe('slugifyCanvasTitle', () => {
  test('lowercases, hyphenates non-alphanumerics, trims dashes', () => {
    expect(slugifyCanvasTitle('My First Canvas')).toBe('my-first-canvas');
    expect(slugifyCanvasTitle('  spaces  ')).toBe('spaces');
    expect(slugifyCanvasTitle('Foo Bar!! Baz??')).toBe('foo-bar-baz');
  });

  test('falls back to "untitled-canvas" for empty / non-alnum input', () => {
    expect(slugifyCanvasTitle('')).toBe('untitled-canvas');
    expect(slugifyCanvasTitle('   ')).toBe('untitled-canvas');
    expect(slugifyCanvasTitle('!!!')).toBe('untitled-canvas');
  });

  test('preserves digits', () => {
    expect(slugifyCanvasTitle('Plan 2026 Q1')).toBe('plan-2026-q1');
  });
});

describe('sortCanvasesByUpdated', () => {
  const make = (id: string, updatedAt: number): Canvas => ({
    id,
    title: id,
    scene: DEFAULT_SCENE,
    tags: [],
    createdAt: 0,
    updatedAt,
  });

  test('sorts by updatedAt descending (newest first)', () => {
    const list = [make('a', 100), make('b', 300), make('c', 200)];
    const sorted = sortCanvasesByUpdated(list);
    expect(sorted.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  test('does not mutate the input array', () => {
    const list = [make('a', 100), make('b', 300)];
    const before = [...list];
    sortCanvasesByUpdated(list);
    expect(list).toEqual(before);
  });

  test('handles empty input', () => {
    expect(sortCanvasesByUpdated([])).toEqual([]);
  });
});

describe('createCanvas / updateCanvas', () => {
  test('createCanvas seeds defaults and timestamps', () => {
    const c = createCanvas({ title: 'Hello' });
    expect(c.title).toBe('Hello');
    expect(c.scene.elements).toEqual([]);
    expect(c.scene.width).toBe(DEFAULT_SCENE.width);
    expect(c.tags).toEqual([]);
    expect(c.createdAt).toBeGreaterThan(0);
    expect(c.updatedAt).toBe(c.createdAt);
    expect(c.id).toMatch(/^canvas-/);
  });

  test('updateCanvas bumps updatedAt and merges fields', () => {
    const original = createCanvas({ title: 'Old' });
    // ensure clock ticks
    const updated = updateCanvas(original, { title: 'New' });
    expect(updated.title).toBe('New');
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);
  });

  test('updateCanvas leaves omitted fields unchanged', () => {
    const c = createCanvas({ title: 'Keep', tags: ['a', 'b'], repo: 'me/repo' });
    const u = updateCanvas(c, {});
    expect(u.title).toBe('Keep');
    expect(u.tags).toEqual(['a', 'b']);
    expect(u.repo).toBe('me/repo');
  });

  test('createCanvas preserves legacy elements without animation', () => {
    const legacyElement: CanvasText = {
      type: 'text',
      id: 'legacy-text',
      text: 'Legacy scene',
      x: 10,
      y: 20,
      fontSize: 16,
      color: '#000000',
    };

    const canvas = createCanvas({
      title: 'Legacy',
      scene: { version: 1, elements: [legacyElement] },
    });

    expect(canvas.scene.version).toBe(1);
    expect(canvas.scene.elements).toEqual([legacyElement]);
  });

  test('createCanvas preserves image and animated elements', () => {
    const image: CanvasImage = {
      type: 'image',
      id: 'image-1',
      data: 'base64-jpeg-data',
      mimeType: 'image/jpeg',
      x: 30,
      y: 40,
      width: 200,
      height: 150,
    };
    const animatedElement: CanvasText = {
      type: 'text',
      id: 'animated-text',
      text: 'Animated',
      x: 50,
      y: 60,
      fontSize: 18,
      color: '#FFFFFF',
      animation: { type: 'pulse', duration: 1000, loop: true },
    };

    const canvas = createCanvas({
      title: 'Media',
      scene: { elements: [image, animatedElement] },
    });

    expect(canvas.scene.elements).toEqual([image, animatedElement]);
  });
});
