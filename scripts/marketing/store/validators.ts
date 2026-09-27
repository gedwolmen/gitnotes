/**
 * Marketing Asset Pipeline - Store Validators
 *
 * Validates composed store images for dimensions, opacity, checksum,
 * decodability, and aspect ratio.
 *
 * Uses sharp for image metadata extraction.
 */

import { createHash } from 'crypto';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { DeviceProfile, Orientation } from '../config';
import { DEVICE_DIMENSIONS, OUTPUT_ROOT, validateOutputPath } from '../config';
import type { ImageMetadata, ValidationResult } from './types';

// ------------------------------------------------------------------------------------------------
// Image Metadata Extraction
// ------------------------------------------------------------------------------------------------

/**
 * Extract metadata from an image file using sharp.
 * Returns null if the file cannot be decoded.
 */
export async function extractImageMetadata(filePath: string): Promise<ImageMetadata | null> {
  try {
    // Use dynamic import for sharp
    const sharp = (await import('sharp')).default;

    const image = sharp(filePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      return null;
    }

    const stats = statSync(filePath);
    const contents = readFileSync(filePath);
    const checksum = createHash('sha256').update(contents).digest('hex');

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels ?? 3,
      hasAlpha: metadata.hasAlpha ?? false,
      sizeBytes: stats.size,
      checksum,
    };
  } catch {
    return null;
  }
}

/**
 * Extract metadata synchronously (limited - no sharp async features).
 * Used for testing and quick checks where async is inconvenient.
 */
export function extractImageMetadataSync(filePath: string): ImageMetadata | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const stats = statSync(filePath);
    const contents = readFileSync(filePath);
    const checksum = createHash('sha256').update(contents).digest('hex');

    // For sync, we can't get sharp metadata without async
    // Return a partial metadata - caller must use async version for full validation
    return {
      width: 0,
      height: 0,
      format: '',
      channels: 0,
      hasAlpha: true, // Assume alpha until proven otherwise
      sizeBytes: stats.size,
      checksum,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------
// Dimension Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that image dimensions match the expected device profile.
 */
export function validateDimensions(
  metadata: ImageMetadata,
  device: DeviceProfile,
  orientation: Orientation,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expected = DEVICE_DIMENSIONS[device][orientation];

  if (metadata.width !== expected.width) {
    errors.push(
      `Width mismatch: expected ${expected.width}px for ${device} ${orientation}, got ${metadata.width}px`,
    );
  }

  if (metadata.height !== expected.height) {
    errors.push(
      `Height mismatch: expected ${expected.height}px for ${device} ${orientation}, got ${metadata.height}px`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Alpha Channel Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that image has no alpha channel (opaque).
 * App Store and Google Play require opaque screenshots.
 */
export function validateOpacity(metadata: ImageMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (metadata.hasAlpha) {
    errors.push(
      `Alpha channel detected: image must be opaque for store submission. ` +
        `Format: ${metadata.format}, Channels: ${metadata.channels}`,
    );
  }

  // PNG with 3 channels (RGB) is acceptable
  // PNG with 4 channels (RGBA) is not
  if (metadata.format === 'png' && metadata.channels === 4) {
    errors.push(
      `PNG with 4 channels (RGBA) detected: store screenshots must be RGB (3 channels). ` +
        `Flatten alpha or convert to JPEG.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Aspect Ratio Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that image aspect ratio matches expected ratio for device.
 * Allows small floating point tolerance (0.5%) for rounding.
 */
export function validateAspectRatio(
  metadata: ImageMetadata,
  device: DeviceProfile,
  orientation: Orientation,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expected = DEVICE_DIMENSIONS[device][orientation];
  const expectedRatio = expected.width / expected.height;
  const actualRatio = metadata.width / metadata.height;

  const tolerance = 0.005; // 0.5%
  if (Math.abs(actualRatio - expectedRatio) > tolerance) {
    errors.push(
      `Aspect ratio mismatch: expected ${expectedRatio.toFixed(4)} ` +
        `(${expected.width}x${expected.height}), got ${actualRatio.toFixed(4)} ` +
        `(${metadata.width}x${metadata.height})`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Decodability Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that image can be decoded by sharp.
 * Returns detailed error if decoding fails.
 */
export async function validateDecodable(filePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const sharp = (await import('sharp')).default;
    const image = sharp(filePath);
    await image.metadata();

    // Try to read raw pixels to ensure full decodability
    await image.raw().toBuffer();
  } catch (err) {
    errors.push(
      `Image decode failed: ${filePath} - ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Checksum Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that image checksum matches expected value.
 */
export function validateChecksum(
  metadata: ImageMetadata,
  expectedChecksum: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (metadata.checksum !== expectedChecksum) {
    errors.push(`Checksum mismatch: expected ${expectedChecksum}, got ${metadata.checksum}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Compute SHA-256 checksum of a file.
 */
export function computeFileChecksum(filePath: string): string {
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

// ------------------------------------------------------------------------------------------------
// File Size Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that file size is reasonable for store submission.
 * Screenshot files should be between 10KB and 50MB.
 */
export function validateFileSize(metadata: ImageMetadata): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const MIN_SIZE = 10 * 1024; // 10KB
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB

  if (metadata.sizeBytes < MIN_SIZE) {
    warnings.push(
      `File size unusually small: ${metadata.sizeBytes} bytes (expected > ${MIN_SIZE} bytes). ` +
        `Image may be corrupted or too compressed.`,
    );
  }

  if (metadata.sizeBytes > MAX_SIZE) {
    errors.push(
      `File size exceeds limit: ${metadata.sizeBytes} bytes (max ${MAX_SIZE} bytes). ` +
        `Consider using JPEG or reducing dimensions.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Source Capture Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that source capture exists and is readable.
 */
export function validateSourceCapture(sourcePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(sourcePath)) {
    errors.push(`Source capture not found: ${sourcePath}`);
  } else {
    const stats = statSync(sourcePath);
    if (!stats.isFile()) {
      errors.push(`Source capture is not a file: ${sourcePath}`);
    }
    if (stats.size === 0) {
      errors.push(`Source capture is empty: ${sourcePath}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Output Path Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that output path is safe (within OUTPUT_ROOT).
 */
export function validateOutputPathSafe(outputPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateOutputPath(outputPath)) {
    errors.push(
      `Output path escapes assets/marketing/: ${outputPath}. ` +
        `All outputs must be within ${OUTPUT_ROOT}.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Full Image Validation
// ------------------------------------------------------------------------------------------------

/**
 * Run all validations on a composed image.
 */
export async function validateComposedImage(
  filePath: string,
  device: DeviceProfile,
  orientation: Orientation,
  expectedChecksum?: string,
): Promise<ValidationResult> {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Check path safety first
  const pathResult = validateOutputPathSafe(filePath);
  allErrors.push(...pathResult.errors);

  // Extract metadata
  const metadata = await extractImageMetadata(filePath);
  if (!metadata) {
    allErrors.push(`Failed to extract metadata from: ${filePath}`);
    return { valid: false, errors: allErrors, warnings: allWarnings };
  }

  // Run all validations
  const dimResult = validateDimensions(metadata, device, orientation);
  allErrors.push(...dimResult.errors);
  allWarnings.push(...dimResult.warnings);

  const opacityResult = validateOpacity(metadata);
  allErrors.push(...opacityResult.errors);
  allWarnings.push(...opacityResult.warnings);

  const aspectResult = validateAspectRatio(metadata, device, orientation);
  allErrors.push(...aspectResult.errors);
  allWarnings.push(...aspectResult.warnings);

  const decodeResult = await validateDecodable(filePath);
  allErrors.push(...decodeResult.errors);
  allWarnings.push(...decodeResult.warnings);

  const sizeResult = validateFileSize(metadata);
  allErrors.push(...sizeResult.errors);
  allWarnings.push(...sizeResult.warnings);

  if (expectedChecksum) {
    const checksumResult = validateChecksum(metadata, expectedChecksum);
    allErrors.push(...checksumResult.errors);
    allWarnings.push(...checksumResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ------------------------------------------------------------------------------------------------
// Feature Graphic Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate a feature graphic specifically.
 * Google Play requires 1024x500 PNG or JPEG.
 */
export async function validateFeatureGraphic(filePath: string): Promise<ValidationResult> {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  const FG_WIDTH = 1024;
  const FG_HEIGHT = 500;
  const FG_ASPECT = FG_WIDTH / FG_HEIGHT; // 2.048

  const metadata = await extractImageMetadata(filePath);
  if (!metadata) {
    allErrors.push(`Failed to extract metadata from feature graphic: ${filePath}`);
    return { valid: false, errors: allErrors, warnings: allWarnings };
  }

  // Dimension check
  if (metadata.width !== FG_WIDTH) {
    allErrors.push(`Feature graphic width must be ${FG_WIDTH}px, got ${metadata.width}px`);
  }

  if (metadata.height !== FG_HEIGHT) {
    allErrors.push(`Feature graphic height must be ${FG_HEIGHT}px, got ${metadata.height}px`);
  }

  // Aspect ratio check (with 1% tolerance)
  const actualAspect = metadata.width / metadata.height;
  if (Math.abs(actualAspect - FG_ASPECT) > 0.01) {
    allErrors.push(
      `Feature graphic aspect ratio must be ${FG_ASPECT.toFixed(3)} (${FG_WIDTH}x${FG_HEIGHT}), ` +
        `got ${actualAspect.toFixed(3)} (${metadata.width}x${metadata.height})`,
    );
  }

  // Format check (PNG or JPEG)
  if (metadata.format !== 'png' && metadata.format !== 'jpeg') {
    allErrors.push(`Feature graphic format must be PNG or JPEG, got ${metadata.format}`);
  }

  // Alpha check
  const opacityResult = validateOpacity(metadata);
  allErrors.push(...opacityResult.errors);

  // Decode check
  const decodeResult = await validateDecodable(filePath);
  allErrors.push(...decodeResult.errors);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ------------------------------------------------------------------------------------------------
// PNG Flattening (Alpha Removal)
// ------------------------------------------------------------------------------------------------

/**
 * Flatten a PNG with alpha channel onto a white background.
 * Used to prepare RGBA images for store submission.
 */
export async function flattenAlpha(
  inputPath: string,
  outputPath: string,
  backgroundColor: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
): Promise<void> {
  const sharp = (await import('sharp')).default;

  await sharp(inputPath).flatten({ background: backgroundColor }).toFile(outputPath);
}

/**
 * Ensure output is opaque by flattening if necessary.
 * If image is already opaque, does nothing.
 */
export async function ensureOpaque(inputPath: string, outputPath: string): Promise<boolean> {
  const metadata = await extractImageMetadata(inputPath);

  if (!metadata) {
    throw new Error(`Cannot read image metadata: ${inputPath}`);
  }

  if (!metadata.hasAlpha) {
    // Already opaque, just copy
    const contents = readFileSync(inputPath);
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, contents);
    return false; // Was already opaque
  }

  // Flatten onto white background
  await flattenAlpha(inputPath, outputPath);
  return true; // Was flattened
}

// ------------------------------------------------------------------------------------------------
// Mock-Friendly Sync Validation (for testing)
// ------------------------------------------------------------------------------------------------

/**
 * Validate source capture synchronously without sharp.
 * Used in tests where we can't use async sharp.
 */
export function validateSourceCaptureSync(sourcePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(sourcePath)) {
    errors.push(`Source capture not found: ${sourcePath}`);
    return { valid: false, errors, warnings };
  }

  const stats = statSync(sourcePath);
  if (!stats.isFile()) {
    errors.push(`Source capture is not a file: ${sourcePath}`);
  }
  if (stats.size === 0) {
    errors.push(`Source capture is empty: ${sourcePath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
