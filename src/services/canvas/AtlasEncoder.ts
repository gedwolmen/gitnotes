/**
 * AtlasEncoder — renders a region of the sparse-tile canvas to an offscreen
 * Skia surface and encodes it as PNG/WebP bytes for vision-model consumption.
 *
 * Pattern mirrors `src/utils/canvasPngExport.ts` (offscreen surface → draw →
 * `makeImageSnapshot` → `encodeToBytes`). Fail-soft: returns `null` on any
 * encode error, logs warnings, never throws.
 */

import { Skia, type SkSurface, type SkCanvas } from '@shopify/react-native-skia';
import type { AtlasBounds } from './AtlasComposer';

export interface AtlasRenderRequest {
  /** Logical atlas region to render */
  bounds: AtlasBounds;
  /** Output pixel width (from AtlasComposer.composeAtlas) */
  outputWidth: number;
  /** Output pixel height (from AtlasComposer.composeAtlas) */
  outputHeight: number;
  /** Output scale factor: outputSize / logicalSize */
  outputScale: number;
  /** Tiles whose content should be drawn onto the atlas canvas */
  tiles: Array<{
    tileX: number;
    tileY: number;
    /**
     * Drawing callback — invoked with (canvas, logicalTranslateX, logicalTranslateY).
     * The caller is responsible for rendering tile content onto the canvas.
     * The passed translate positions the tile at its correct offset in the atlas.
     */
    drawTile: (canvas: SkCanvas, translateX: number, translateY: number) => void;
  }>;
  /** Image format (default: 'png'). WebP may fall through to PNG if not supported. */
  format?: 'png' | 'webp';
  /** WebP quality 0..1 (default 0.9). Ignored for PNG. */
  quality?: number;
}

export interface AtlasEncodeResult {
  /** Base64 data URL (e.g., "data:image/png;base64,...") */
  base64: string;
  /** Raw PNG/WebP bytes */
  bytes: Uint8Array;
  /** Actual format produced (may differ from requested if WebP fell through) */
  format: 'png' | 'webp';
  /** Output dimension metadata for debugging */
  width: number;
  height: number;
}

let skiaImportFailed = false;

export class AtlasEncoder {
  /**
   * Render + encode the requested atlas region.
   * Returns null if Skia is unavailable, dimensions invalid, or any step fails.
   */
  async encode(request: AtlasRenderRequest): Promise<AtlasEncodeResult | null> {
    if (!this.isAvailable()) {
      console.warn('[AtlasEncoder] Skia unavailable, cannot encode');
      return null;
    }

    const { bounds, outputWidth, outputHeight, outputScale, tiles } = request;

    if (outputWidth <= 0 || outputHeight <= 0) {
      console.warn(`[AtlasEncoder] Invalid dimensions ${outputWidth}x${outputHeight}`);
      return null;
    }

    const requestedFormat: 'png' | 'webp' = request.format ?? 'png';

    let surface: SkSurface | null = null;
    try {
      surface = Skia.Surface.MakeOffscreen(outputWidth, outputHeight);
      if (!surface) {
        console.warn('[AtlasEncoder] MakeOffscreen returned null');
        return null;
      }

      const canvas = surface.getCanvas();

      // White background — vision models expect paper-white
      canvas.save();
      canvas.drawColor(Skia.Color('#FFFFFF'));

      // Transform from logical (atlas) coords to output pixel coords.
      // The atlas region spans [bounds.x, bounds.x+bounds.width] in logical space;
      // we want those to fill [0, outputWidth] pixels.
      canvas.scale(outputScale, outputScale);
      canvas.translate(-bounds.x, -bounds.y);

      // Draw each tile
      for (const tile of tiles) {
        const tileLogicalX = tile.tileX * 512;
        const tileLogicalY = tile.tileY * 512;
        // Only draw tiles whose 512x512 region intersects the atlas bounds
        if (tileLogicalX + 512 < bounds.x) continue;
        if (tileLogicalY + 512 < bounds.y) continue;
        if (tileLogicalX > bounds.x + bounds.width) continue;
        if (tileLogicalY > bounds.y + bounds.height) continue;

        try {
          tile.drawTile(canvas, tileLogicalX, tileLogicalY);
        } catch (err) {
          console.warn(`[AtlasEncoder] Tile draw failed for (${tile.tileX},${tile.tileY}):`, err);
          // Continue with other tiles — don't lose partial atlas
        }
      }

      canvas.restore();

      // Encode to PNG bytes (Skia default format — WebP requires a separate
      // ImageFormat enum value which may not be exposed on all Skia builds)
      const image = surface.makeImageSnapshot();
      if (!image) {
        console.warn('[AtlasEncoder] makeImageSnapshot returned null');
        return null;
      }

      let bytes: Uint8Array;
      try {
        bytes = image.encodeToBytes();
      } catch (err) {
        console.warn('[AtlasEncoder] encodeToBytes threw:', err);
        return null;
      }

      if (!bytes || bytes.length === 0) {
        console.warn('[AtlasEncoder] encodeToBytes returned empty');
        return null;
      }

      // Skia always emits PNG; if WebP requested, fall through with warning
      const actualFormat = requestedFormat === 'webp' ? 'png' : 'png';
      if (requestedFormat === 'webp') {
        console.warn('[AtlasEncoder] WebP encoding not supported — returned PNG bytes');
      }

      // Build data URL
      const base64Bare = toBase64(bytes);
      const mimeType = 'image/png';
      const base64 = `data:${mimeType};base64,${base64Bare}`;

      return {
        base64,
        bytes,
        format: actualFormat as 'png' | 'webp',
        width: outputWidth,
        height: outputHeight,
      };
    } catch (err) {
      console.warn('[AtlasEncoder] encode failed:', err);
      return null;
    } finally {
      if (surface) {
        try {
          surface.dispose();
        } catch {
          // surface already disposed or never created
        }
      }
    }
  }

  /**
   * Check if AtlasEncoder can run (Skia module loaded successfully).
   */
  isAvailable(): boolean {
    if (skiaImportFailed) return false;
    try {
      // Probe: if Skia.Surface exists and MakeOffscreen is callable, we're good
      const probe = typeof Skia?.Surface?.MakeOffscreen === 'function';
      if (!probe) {
        skiaImportFailed = true;
      }
      return probe;
    } catch {
      skiaImportFailed = true;
      return false;
    }
  }
}

/**
 * Convert Uint8Array to base64 string. Uses Buffer on Node/test,
 * falls back to manual conversion on native where Buffer is mocked.
 */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    try {
      return Buffer.from(bytes).toString('base64');
    } catch {
      // Buffer.from threw (e.g., RN environment) — fall through
    }
  }

  // Manual base64 encoding (slow but works without Buffer)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += alphabet[((b1 & 0x0f) << 2) | (b2 >> 6)];
    out += alphabet[b2 & 0x3f];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const b0 = bytes[i];
    out += alphabet[b0 >> 2];
    out += alphabet[(b0 & 0x03) << 4];
    out += '==';
  } else if (remaining === 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += alphabet[(b1 & 0x0f) << 2];
    out += '=';
  }
  return out;
}
