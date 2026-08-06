import { describe, expect, it } from '@jest/globals';
import { isImageElement } from '../src/models/Canvas';
import type { CanvasImage } from '../src/models/Canvas';

describe('isImageElement', () => {
  const validImage = {
    type: 'image',
    id: 'image-1',
    data: 'base64-jpeg-data',
    mimeType: 'image/jpeg',
    x: -10,
    y: 20,
    width: 200,
    height: 150,
  } satisfies CanvasImage;

  it('accepts a valid JPEG image element', () => {
    // Given: a complete JPEG image object.
    const candidate: unknown = validImage;

    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the object is accepted.
    expect(result).toBe(true);
  });

  it('accepts a valid image animation', () => {
    // Given: a valid image with a complete pulse animation.
    const candidate: unknown = {
      ...validImage,
      animation: { type: 'pulse', duration: 1000, loop: true },
    } satisfies CanvasImage;

    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the animated image is accepted.
    expect(result).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'bounce', duration: 1000, loop: true }],
    ['NaN duration', { type: 'pulse', duration: Number.NaN, loop: true }],
    ['infinite duration', { type: 'pulse', duration: Number.POSITIVE_INFINITY, loop: true }],
    ['missing loop', { type: 'pulse', duration: 1000 }],
    ['invalid loop', { type: 'pulse', duration: 1000, loop: 'yes' }],
    ['null value', null],
    ['string value', 'pulse'],
    ['number value', 1000],
    ['boolean value', true],
  ])('rejects malformed animation: %s', (_label: string, animation: unknown) => {
    // Given: an otherwise valid image with malformed animation metadata.
    const candidate: unknown = { ...validImage, animation };

    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the image is rejected.
    expect(result).toBe(false);
  });

  it.each([
    ['missing data', (({ data: _data, ...image }) => image)(validImage)],
    ['empty data', { ...validImage, data: '' }],
    ['whitespace-only data', { ...validImage, data: '   ' }],
  ])('rejects %s', (_label: string, candidate: unknown) => {
    // Given: an image candidate without usable encoded data.
    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the candidate is rejected.
    expect(result).toBe(false);
  });

  it('rejects a non-JPEG MIME type', () => {
    // Given: an otherwise valid image with a PNG MIME type.
    const candidate: unknown = { ...validImage, mimeType: 'image/png' };

    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the candidate is rejected.
    expect(result).toBe(false);
  });

  it.each([
    ['NaN x', { ...validImage, x: Number.NaN }],
    ['infinite y', { ...validImage, y: Number.POSITIVE_INFINITY }],
    ['NaN width', { ...validImage, width: Number.NaN }],
    ['infinite height', { ...validImage, height: Number.NEGATIVE_INFINITY }],
    ['zero width', { ...validImage, width: 0 }],
    ['negative width', { ...validImage, width: -1 }],
    ['zero height', { ...validImage, height: 0 }],
    ['negative height', { ...validImage, height: -1 }],
  ])('rejects %s', (_label: string, candidate: unknown) => {
    // Given: an image candidate with invalid geometry.
    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the candidate is rejected.
    expect(result).toBe(false);
  });

  it.each([
    null,
    undefined,
    'image',
    42,
    {},
    { type: 'image' },
    { ...validImage, id: undefined },
  ])('rejects malformed input %#', (candidate: unknown) => {
    // Given: a null, primitive, or incomplete candidate.
    // When: the image guard validates it.
    const result = isImageElement(candidate);

    // Then: the candidate is rejected without throwing.
    expect(result).toBe(false);
  });
});
