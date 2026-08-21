#!/usr/bin/env node
/**
 * Branding asset pipeline — single-master-SVG → generated app assets.
 *
 * Reads `assets/logo.svg` (the one source of truth) and writes high-resolution
 * PNG branding assets into `assets/generated/`:
 *
 *   icon.png            1024×1024  iOS / Expo generic app icon (no rounded corners)
 *   adaptive-icon.png   1024×1024  Android adaptive icon FOREGROUND (transparent bg)
 *   splash-icon.png     1024×1024  square splash source, logo ≈ image width
 *                                  (on-screen size = app.json imageWidth: 300dp ≈ 75% device width)
 *   favicon.png          512×512   web favicon source
 *   monochrome-icon.png 1024×1024  Android themed icon — grayscale depth mask
 *
 * The artwork is auto-cropped to its alpha bounding box, scaled to a target
 * fraction of the canvas (safe padding), and composited centered on a
 * transparent square canvas. Aspect ratio is preserved throughout, so the
 * rendered logo is always square.
 *
 * Usage:
 *   node scripts/generate-branding.js          # generate assets
 *   node scripts/generate-branding.js --check  # verify existing outputs
 *
 * Exit code is non-zero on any failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const MASTER_SVG = path.join(ROOT, 'assets', 'logo.svg');
const OUT_DIR = path.join(ROOT, 'assets', 'generated');

const RENDER_PREVIEW_SIZE = 2048; // supersample for precise alpha bbox
const KERNEL = sharp.kernel.lanczos3;

/**
 * Artwork should occupy this fraction of each canvas (transparent padding
 * around it). Adaptive and monochrome use the Android safe zone (central
 * ~62%, which fits the circle mask). Splash fills ~96% because the on-screen
 * size is set by imageWidth (300dp ≈ 75% device width) — the square source +
 * contain keeps height == width.
 */
const TARGETS = [
  { name: 'icon.png', size: 1024, fraction: 0.82 },
  { name: 'adaptive-icon.png', size: 1024, fraction: 0.62 },
  { name: 'splash-icon.png', size: 1024, fraction: 0.96 },
  { name: 'favicon.png', size: 512, fraction: 0.85 },
  { name: 'monochrome-icon.png', size: 1024, fraction: 0.62, monochrome: true },
];

/** Render the SVG at a large size and return raw RGBA + alpha bounding box. */
async function renderArtworkBBox(svgBuffer) {
  const raw = await sharp(svgBuffer)
    .resize(RENDER_PREVIEW_SIZE, RENDER_PREVIEW_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = raw;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    throw new Error('SVG rendered fully transparent — nothing to generate');
  }
  return {
    data,
    info,
    bbox: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Build one target asset (composite artwork, centered, on transparent canvas). */
async function generateTarget(svgBuffer, { size, fraction, monochrome }) {
  const { data, info, bbox } = await renderArtworkBBox(svgBuffer);

  // Extract the cropped artwork region.
  const cropped = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(bbox)
    .png()
    .toBuffer();

  // Scale preserving aspect ratio so the artwork occupies `fraction` of the canvas.
  const scale = (size * fraction) / Math.max(bbox.width, bbox.height);
  const width = Math.max(1, Math.round(bbox.width * scale));
  const height = Math.max(1, Math.round(bbox.height * scale));

  let artwork = await sharp(cropped)
    .resize(width, height, { fit: 'fill', kernel: KERNEL })
    .ensureAlpha()
    .png()
    .toBuffer();

  if (monochrome) {
    // Android themed icons tint the alpha mask with the system theme color.
    // Collapse each source color to BT.601 luminance so the SVG's distinct
    // color sections become distinct gray levels (preserves visual depth
    // where the icon is shown raw). Alpha is kept at full opacity so the
    // Android tint mask stays intact.
    const rawArt = await sharp(artwork).raw().toBuffer({ resolveWithObject: true });
    const { data: artData, info: artInfo } = rawArt;
    const mono = Buffer.alloc(artData.length);
    for (let i = 0; i < artInfo.width * artInfo.height; i += 1) {
      const r = artData[i * 4];
      const g = artData[i * 4 + 1];
      const b = artData[i * 4 + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      mono[i * 4] = luma;
      mono[i * 4 + 1] = luma;
      mono[i * 4 + 2] = luma;
      mono[i * 4 + 3] = artData[i * 4 + 3];
    }
    artwork = await sharp(mono, {
      raw: { width: artInfo.width, height: artInfo.height, channels: 4 },
    })
      .png()
      .toBuffer();
  }

  const left = Math.round((size - width) / 2);
  const top = Math.round((size - height) / 2);

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: artwork, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateAll() {
  if (!fs.existsSync(MASTER_SVG)) {
    console.error(`✗ Master branding source not found: ${MASTER_SVG}`);
    console.error('  Place your logo at assets/logo.svg and re-run npm run branding.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const svgBuffer = fs.readFileSync(MASTER_SVG);

  for (const target of TARGETS) {
    const buffer = await generateTarget(svgBuffer, target);
    const outPath = path.join(OUT_DIR, target.name);
    fs.writeFileSync(outPath, buffer);
    console.log(`✓ Generated ${target.name}`);
  }

  console.log('✓ Branding assets generated successfully');
}

async function checkAll() {
  let ok = true;
  for (const target of TARGETS) {
    const outPath = path.join(OUT_DIR, target.name);
    if (!fs.existsSync(outPath)) {
      console.error(`✗ Missing ${target.name}`);
      ok = false;
      continue;
    }
    const meta = await sharp(outPath).metadata();
    const square = meta.width === target.size && meta.height === target.size;
    if (!square) {
      console.error(
        `✗ ${target.name}: expected ${target.size}×${target.size}, got ${meta.width}×${meta.height}`,
      );
      ok = false;
      continue;
    }
    console.log(`✓ ${target.name} ${meta.width}×${meta.height}`);
  }
  if (!ok) {
    console.error('✗ Branding check FAILED — run npm run branding to regenerate.');
    process.exit(1);
  }
  console.log('✓ Branding assets OK');
}

(async () => {
  const check = process.argv.includes('--check');
  try {
    if (check) {
      await checkAll();
    } else {
      await generateAll();
    }
  } catch (error) {
    console.error(
      `✗ Branding generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
})();
