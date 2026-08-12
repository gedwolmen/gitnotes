import { describe, beforeEach, expect, it, jest } from '@jest/globals';
import type { AtlasRenderRequest } from '../src/services/canvas/AtlasEncoder';

const PNG_MAGIC_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

const mockEncodeToBytes = jest.fn<() => Uint8Array>(() => PNG_MAGIC_BYTES);
const mockMakeImageSnapshot = jest.fn<() => { encodeToBytes: typeof mockEncodeToBytes }>(() => ({
  encodeToBytes: mockEncodeToBytes,
}));
const mockCanvas = {
  save: jest.fn<() => void>(),
  restore: jest.fn<() => void>(),
  drawColor: jest.fn<(color: unknown) => void>(),
  scale: jest.fn<(sx: number, sy: number) => void>(),
  translate: jest.fn<(dx: number, dy: number) => void>(),
};
const mockGetCanvas = jest.fn<() => typeof mockCanvas>(() => mockCanvas);
const mockDispose = jest.fn<() => void>();
const mockMakeOffscreen = jest.fn<
  (w: number, h: number) => {
    getCanvas: typeof mockGetCanvas;
    makeImageSnapshot: typeof mockMakeImageSnapshot;
    dispose: typeof mockDispose;
  }
>((w, h) => ({
  getCanvas: mockGetCanvas,
  makeImageSnapshot: mockMakeImageSnapshot,
  dispose: mockDispose,
}));

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Color: (c: string) => c,
    Surface: { MakeOffscreen: (w: number, h: number) => mockMakeOffscreen(w, h) },
  },
}));

import { AtlasEncoder } from '../../src/services/canvas/AtlasEncoder';

function makeRequest(overrides: Partial<AtlasRenderRequest> = {}): AtlasRenderRequest {
  return {
    bounds: { x: 0, y: 0, width: 1024, height: 1024 },
    outputWidth: 512,
    outputHeight: 512,
    outputScale: 0.5,
    tiles: [
      {
        tileX: 0,
        tileY: 0,
        drawTile: jest.fn(),
      },
    ],
    format: 'png',
    ...overrides,
  };
}

beforeEach(() => {
  mockEncodeToBytes.mockReset().mockReturnValue(PNG_MAGIC_BYTES);
  mockMakeImageSnapshot.mockReset().mockReturnValue({ encodeToBytes: mockEncodeToBytes });
  mockGetCanvas.mockReset().mockReturnValue(mockCanvas);
  mockMakeOffscreen.mockReset().mockImplementation((w, h) => ({
    getCanvas: mockGetCanvas,
    makeImageSnapshot: mockMakeImageSnapshot,
    dispose: mockDispose,
  }));
  mockDispose.mockReset();
  // Reset canvas method mocks
  Object.values(mockCanvas).forEach((m) => m.mockReset());
});

describe('AtlasEncoder', () => {
  it('encode returns base64 data URL starting with data:image/png;base64,', async () => {
    const encoder = new AtlasEncoder();
    const result = await encoder.encode(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.base64.startsWith('data:image/png;base64,')).toBe(true);
    expect(result!.format).toBe('png');
  });

  it('encode with multiple tiles still returns valid result', async () => {
    const encoder = new AtlasEncoder();
    const result = await encoder.encode(
      makeRequest({
        tiles: [
          { tileX: 0, tileY: 0, drawTile: jest.fn() },
          { tileX: 1, tileY: 0, drawTile: jest.fn() },
          { tileX: 0, tileY: 1, drawTile: jest.fn() },
        ],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.base64.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('encode with empty tiles returns valid result (blank atlas)', async () => {
    const encoder = new AtlasEncoder();
    const result = await encoder.encode(makeRequest({ tiles: [] }));
    // Empty tiles is fine — atlas is just white background
    expect(result).not.toBeNull();
    expect(result!.format).toBe('png');
  });

  it('encode with invalid outputWidth 0 returns null', async () => {
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest({ outputWidth: 0, outputHeight: 512 }))).toBeNull();
  });

  it('encode with invalid outputHeight 0 returns null', async () => {
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest({ outputWidth: 512, outputHeight: 0 }))).toBeNull();
  });

  it('encode with negative dimensions returns null', async () => {
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest({ outputWidth: -10 }))).toBeNull();
  });

  it('encode with WebP format returns PNG bytes and logs warning', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const encoder = new AtlasEncoder();
    const result = await encoder.encode(makeRequest({ format: 'webp' }));
    expect(result).not.toBeNull();
    // WebP fell through to PNG
    expect(result!.format).toBe('png');
    expect(result!.base64).toContain('image/png');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AtlasEncoder] WebP encoding not supported'),
    );
    warnSpy.mockRestore();
  });

  it('isAvailable returns true when Skia Surface.MakeOffscreen exists', () => {
    const encoder = new AtlasEncoder();
    expect(encoder.isAvailable()).toBe(true);
  });

  it('encode when makeImageSnapshot throws returns null, no crash', async () => {
    mockMakeImageSnapshot.mockImplementation(() => {
      throw new Error('Skia snapshot failure');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest())).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encode when encodeToBytes throws returns null', async () => {
    mockEncodeToBytes.mockImplementation(() => {
      throw new Error('encode failure');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest())).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encode when MakeOffscreen returns null returns null', async () => {
    mockMakeOffscreen.mockReturnValue(null as unknown as ReturnType<typeof mockMakeOffscreen>);
    const encoder = new AtlasEncoder();
    expect(await encoder.encode(makeRequest())).toBeNull();
  });

  it('encode surface always disposed via finally', async () => {
    await new AtlasEncoder().encode(makeRequest());
    expect(mockDispose).toHaveBeenCalled();
  });

  it('encode surface disposed even when encode fails', async () => {
    mockEncodeToBytes.mockImplementation(() => {
      throw new Error('boom');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await new AtlasEncoder().encode(makeRequest());
    expect(mockDispose).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encode applies scale + translate transforms using bounds', async () => {
    await new AtlasEncoder().encode(
      makeRequest({
        bounds: { x: 100, y: 200, width: 1024, height: 1024 },
        outputScale: 0.5,
      }),
    );
    expect(mockCanvas.scale).toHaveBeenCalledWith(0.5, 0.5);
    expect(mockCanvas.translate).toHaveBeenCalledWith(-100, -200);
  });

  it('encode skips tiles outside atlas bounds (culling)', async () => {
    const drawTile = jest.fn();
    await new AtlasEncoder().encode(
      makeRequest({
        bounds: { x: 0, y: 0, width: 512, height: 512 },
        tiles: [
          // Tile at (0,0) intersects atlas — should draw
          { tileX: 0, tileY: 0, drawTile: drawTile },
          // Tile at (10,10) logical coords (5120, 5120) — outside atlas — should NOT draw
          { tileX: 10, tileY: 10, drawTile: jest.fn() },
        ],
      }),
    );
    expect(drawTile).toHaveBeenCalledTimes(1);
  });

  it('encode continues drawing remaining tiles if one throws', async () => {
    const failingTile = { tileX: 0, tileY: 0, drawTile: jest.fn(() => { throw new Error('tile draw failed'); }) };
    const goodTile = { tileX: 1, tileY: 0, drawTile: jest.fn() };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await new AtlasEncoder().encode(
      makeRequest({
        bounds: { x: 0, y: 0, width: 2048, height: 2048 },
        tiles: [failingTile, goodTile],
      }),
    );
    // Atlas still produced even if one tile failed
    expect(result).not.toBeNull();
    expect(goodTile.drawTile).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('encode result width/height match request', async () => {
    const result = await new AtlasEncoder().encode(
      makeRequest({ outputWidth: 768, outputHeight: 384 }),
    );
    expect(result).not.toBeNull();
    expect(result!.width).toBe(768);
    expect(result!.height).toBe(384);
  });
});
