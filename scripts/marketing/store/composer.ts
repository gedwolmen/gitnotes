/**
 * Marketing Asset Pipeline - Store Composer
 *
 * Composes store-ready screenshots from source captures using sharp.
 * Creates themed, advertisement-style slides with proper text placement.
 *
 * Uses SVG as an intermediary for text rendering, then composites
 * with sharp for final output.
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import type { DeviceProfile, Orientation } from '../config';
import { DEVICE_DIMENSIONS, FORMAT_OPTIONS } from '../config';
import type { Slide, StoreTheme, ComposeSlideRequest, SlideLayout } from './types';
import { getCanvasDimensions, getCanvasSafeArea } from './types';
import {
  FONT_SIZES,
  getPortraitLayout,
  getLandscapeLayout,
  getPortraitCaptionPosition,
  getLandscapeCaptionPosition,
} from './themes';
import { ensureOpaque } from './validators';

// ------------------------------------------------------------------------------------------------
// SVG Text Composer
// ------------------------------------------------------------------------------------------------

/**
 * Create an SVG text element with proper sizing.
 */
function createSvgText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string,
  fontWeight: number = 700,
  textAnchor: 'start' | 'middle' | 'end' = 'start',
  maxWidth?: number,
): string {
  const widthAttr = maxWidth ? ` width="${maxWidth}"` : '';
  return (
    `<text x="${x}" y="${y}" font-size="${fontSize}" font-weight="${fontWeight}" ` +
    `fill="${color}" text-anchor="${textAnchor}"${widthAttr} ` +
    `font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">` +
    `${escapeXml(text)}</text>`
  );
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create a multiline SVG text block.
 */
function createSvgTextLines(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  color: string,
  fontWeight: number = 700,
  textAnchor: 'start' | 'middle' | 'end' = 'start',
  maxWidth?: number,
): string {
  return lines
    .map((line, i) =>
      createSvgText(line, x, y + i * lineHeight, fontSize, color, fontWeight, textAnchor, maxWidth),
    )
    .join('\n');
}

// ------------------------------------------------------------------------------------------------
// Background Composer
// ------------------------------------------------------------------------------------------------

/**
 * Create an SVG background with gradient.
 */
function createSvgBackground(width: number, height: number, theme: StoreTheme): string {
  const gradientId = 'bgGradient';

  if (theme.gradientFrom && theme.gradientTo) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradientFrom}"/>
      <stop offset="100%" stop-color="${theme.gradientTo}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradientId})"/>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${theme.background}"/>
</svg>`;
}

// ------------------------------------------------------------------------------------------------
// Device Frame Compositor
// ------------------------------------------------------------------------------------------------

/**
 * Compose the device frame (source capture) onto the canvas.
 * Returns SVG element for the device.
 */
function createDeviceSvg(
  sourcePath: string,
  layout: SlideLayout,
  canvasWidth: number,
  canvasHeight: number,
  device: DeviceProfile,
  orientation: Orientation,
): { svg: string; x: number; y: number; width: number; height: number } {
  const dims = DEVICE_DIMENSIONS[device][orientation];
  const safe = getCanvasSafeArea(device);

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  const isLandscape = orientation === 'landscape';

  if (isLandscape) {
    const pos = getLandscapeLayout(layout, canvasWidth, canvasHeight);
    // Landscape: layout gives top and left as percentages, width as percentage
    x = (parseFloat(pos.left) / 100) * canvasWidth;
    const topPercent = parseFloat(pos.top) / 100;
    y = topPercent * canvasHeight - dims.height / 2;
    width = (parseFloat(pos.width) / 100) * canvasWidth;
    height = (width / dims.width) * dims.height;
  } else {
    const pos = getPortraitLayout(layout, canvasWidth, canvasHeight);
    // Portrait: layout gives bottom and left as percentages
    width = (parseFloat(pos.width) / 100) * canvasWidth;
    height = (width / dims.width) * dims.height;
    x = (parseFloat(pos.left.replace('%', '')) / 100) * canvasWidth - width / 2;
    y = canvasHeight - height - (parseFloat(pos.bottom.replace('%', '')) / 100) * canvasHeight;
  }

  // Clamp y to safe area
  if (y < safe.top) {
    y = safe.top;
  }

  // Read the source image and embed as base64
  let imageContent = '';
  if (existsSync(sourcePath)) {
    try {
      const imgBuffer = readFileSync(sourcePath);
      const ext = sourcePath.split('.').pop()?.toLowerCase() ?? 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      imageContent = imgBuffer.toString('base64');
      imageContent = `data:${mimeType};base64,${imageContent}`;
    } catch {
      // Source capture not available - use placeholder
    }
  }

  if (!imageContent) {
    // Return a placeholder rectangle if no source
    return {
      svg: `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#E5E7EB" rx="8"/>`,
      x,
      y,
      width,
      height,
    };
  }

  // Return image element
  return {
    svg: `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${imageContent}" preserveAspectRatio="xMidYMid slice"/>`,
    x,
    y,
    width,
    height,
  };
}

// ------------------------------------------------------------------------------------------------
// Caption Compositor
// ------------------------------------------------------------------------------------------------

/**
 * Create SVG caption element with headline and optional body.
 */
function createCaptionSvg(
  layout: SlideLayout,
  headline: string,
  subtitle: string | undefined,
  body: string | undefined,
  canvasWidth: number,
  canvasHeight: number,
  device: DeviceProfile,
  orientation: Orientation,
  theme: StoreTheme,
): string {
  const isLandscape = orientation === 'landscape';
  const safe = getCanvasSafeArea(device);

  let x: number;
  let y: number;
  let maxWidth: number;
  let textAnchor: 'start' | 'middle' | 'end' = 'start';

  if (isLandscape) {
    const pos = getLandscapeCaptionPosition(layout);
    x = (parseFloat(pos.left) / 100) * canvasWidth;
    y = (parseFloat(pos.top) / 100) * canvasHeight;
    maxWidth = (parseFloat(pos.width) / 100) * canvasWidth;
    textAnchor = 'start';
  } else {
    const pos = getPortraitCaptionPosition(layout);
    x = (parseFloat(pos.left) / 100) * canvasWidth;
    y = safe.top + (parseFloat(pos.top) / 100) * (canvasHeight - safe.top - safe.bottom);
    maxWidth = (parseFloat(pos.width) / 100) * canvasWidth;
    textAnchor = 'start';
  }

  const headlineSize = canvasWidth * FONT_SIZES.headline;
  const subtitleSize = canvasWidth * FONT_SIZES.subtitle;
  const bodySize = canvasWidth * FONT_SIZES.body;
  const lineHeight = headlineSize * 1.2;

  const lines: string[] = [];

  // Add subtitle if present
  if (subtitle) {
    lines.push(createSvgText(subtitle, x, y, subtitleSize, theme.muted, 500, textAnchor, maxWidth));
    y += subtitleSize * 1.2;
  }

  // Split headline into lines (simple word wrap)
  const headlineLines = wrapText(headline, maxWidth, headlineSize, 0.6);
  lines.push(
    createSvgTextLines(
      headlineLines,
      x,
      y,
      headlineSize,
      lineHeight,
      theme.foreground,
      700,
      textAnchor,
      maxWidth,
    ),
  );
  y += headlineLines.length * lineHeight + bodySize * 0.5;

  // Add body if present
  if (body) {
    const bodyLines = wrapText(body, maxWidth, bodySize, 0.4);
    lines.push(
      createSvgTextLines(
        bodyLines,
        x,
        y,
        bodySize,
        bodySize * 1.4,
        theme.muted,
        400,
        textAnchor,
        maxWidth,
      ),
    );
  }

  return lines.join('\n');
}

/**
 * Simple word wrap for SVG text.
 */
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  charsPerPixel: number,
): string[] {
  const maxChars = Math.floor(maxWidth * charsPerPixel);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// ------------------------------------------------------------------------------------------------
// Full Slide Composer
// ------------------------------------------------------------------------------------------------

/**
 * Compose a single store slide.
 * Creates a full canvas with background, device frame, and caption.
 */
export async function composeSlide(
  request: ComposeSlideRequest,
): Promise<{ outputPath: string; checksum: string }> {
  const { slide, theme, outputPath, format, sourceCapturePath } = request;
  const { width, height } = getCanvasDimensions(slide.device, slide.orientation);

  // Create output directory
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create background SVG
  const bgSvg = createSvgBackground(width, height, theme);

  // Create device frame SVG
  const deviceResult = createDeviceSvg(
    sourceCapturePath,
    slide.layout,
    width,
    height,
    slide.device,
    slide.orientation,
  );

  // Create caption SVG
  const captionSvg = createCaptionSvg(
    slide.layout,
    slide.headline,
    slide.subtitle,
    slide.body,
    width,
    height,
    slide.device,
    slide.orientation,
    theme,
  );

  // Combine into full SVG
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${bgSvg
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')}
  ${deviceResult.svg}
  ${captionSvg}
</svg>`;

  // Render with sharp
  const sharp = (await import('sharp')).default;

  // Create the base image from SVG
  let image = sharp(Buffer.from(fullSvg));

  // Get format options
  const formatOpts = FORMAT_OPTIONS[format];

  // Save to output
  if (format === 'jpeg') {
    image = image.jpeg({ quality: formatOpts.quality });
  } else {
    image = image.png({ compressionLevel: 9 });
  }

  // Ensure opaque output
  const tempPath = outputPath + '.tmp';
  await image.toFile(tempPath);

  // Flatten if needed to ensure opaque
  await ensureOpaque(tempPath, outputPath);

  // Clean up temp file
  try {
    const { unlinkSync } = require('fs');
    unlinkSync(tempPath);
  } catch {
    // Ignore cleanup errors
  }

  // Compute checksum
  const { createHash } = require('crypto');
  const contents = readFileSync(outputPath);
  const checksum = createHash('sha256').update(contents).digest('hex');

  return { outputPath, checksum };
}

/**
 * Compose a feature graphic (1024x500 banner for Google Play).
 */
export async function composeFeatureGraphic(
  outputPath: string,
  theme: StoreTheme,
  iconPath?: string,
  tagline?: string,
): Promise<{ outputPath: string; checksum: string }> {
  const width = 1024;
  const height = 500;

  // Create output directory
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Build SVG with a placeholder marker for content injection
  let svgContent = createSvgBackground(width, height, theme);
  const PLACEHOLDER = '<!-- CONTENT_PLACEHOLDER -->';

  // Insert placeholder before closing tag
  svgContent = svgContent.replace('</svg>', `${PLACEHOLDER}</svg>`);

  // Build content parts
  const contentParts: string[] = [];

  // Add icon if available
  if (iconPath && existsSync(iconPath)) {
    try {
      const iconBuffer = readFileSync(iconPath);
      const iconBase64 = iconBuffer.toString('base64');
      const iconDataUri = `data:image/png;base64,${iconBase64}`;
      contentParts.push(
        `<image x="60" y="${(height - 120) / 2}" width="120" height="120" href="${iconDataUri}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    } catch {
      // Icon not available
    }
  }

  // Add tagline text
  const displayTagline = tagline ?? 'Notes, Todos & Git';
  const headlineText = 'GitNotēs';
  const headlineSize = width * 0.06;
  const textX = iconPath ? 200 : 60;

  contentParts.push(
    `<text x="${textX}" y="${height / 2 - 20}" font-size="${headlineSize}" font-weight="800" fill="${theme.foreground}" font-family="system-ui, -apple-system, sans-serif">${escapeXml(headlineText)}</text>`,
  );
  contentParts.push(
    `<text x="${textX}" y="${height / 2 + headlineSize}" font-size="${width * 0.03}" font-weight="400" fill="${theme.muted}" font-family="system-ui, -apple-system, sans-serif">${escapeXml(displayTagline)}</text>`,
  );

  // Inject all content at once
  svgContent = svgContent.replace(PLACEHOLDER, contentParts.join(''));

  // Render with sharp
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svgContent)).png({ compressionLevel: 9 }).toFile(outputPath);

  // Ensure opaque
  const tempPath = outputPath + '.tmp';
  await sharp(Buffer.from(svgContent)).png({ compressionLevel: 9 }).toFile(tempPath);
  await ensureOpaque(tempPath, outputPath);

  // Clean up
  try {
    const { unlinkSync } = require('fs');
    unlinkSync(tempPath);
  } catch {
    // Ignore
  }

  // Compute checksum
  const { createHash } = require('crypto');
  const contents = readFileSync(outputPath);
  const checksum = createHash('sha256').update(contents).digest('hex');

  return { outputPath, checksum };
}

// ------------------------------------------------------------------------------------------------
// Slide Builder Utilities
// ------------------------------------------------------------------------------------------------

/**
 * Build slides for a specific device and route combination.
 */
export function buildSlides(
  device: DeviceProfile,
  orientation: Orientation,
  route: string,
  sourcePath: string,
  copy: { title: string; subtitle?: string; body?: string },
  layouts: SlideLayout[],
): Slide[] {
  return layouts.map((layout, idx) => ({
    id: `${device}-${route}-${orientation}-${String(idx + 1).padStart(2, '0')}`,
    layout,
    device,
    orientation,
    sourcePath,
    headline: copy.title,
    subtitle: copy.subtitle,
    body: copy.body,
    index: idx + 1,
  }));
}

/**
 * Get default layouts for a slide count.
 * Provides visual variety across slides.
 */
export function getDefaultLayouts(count: number): SlideLayout[] {
  const allLayouts: SlideLayout[] = [
    'hero',
    'feature',
    'contrast',
    'landscape-left',
    'landscape-right',
  ];
  return Array.from({ length: count }, (_, i) => allLayouts[i % allLayouts.length]);
}
