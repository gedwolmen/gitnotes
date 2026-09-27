/**
 * Marketing Asset Pipeline - Output Manifest
 *
 * Deterministic manifest serialization for tracking source routes, device profiles,
 * dimensions, checksums, and tool versions across repeated pipeline runs.
 *
 * Manifest format is stable JSON with sorted keys for reproducible hashing.
 */

import { createHash } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { relative, resolve } from 'path';
import type { DeviceProfile, Orientation, Route, ImageFormat, StoreType } from './config';
import { OUTPUT_ROOT, getDimensions, type ToolVersion } from './config';
export { OUTPUT_ROOT };

// ------------------------------------------------------------------------------------------------
// Manifest Schema
// ------------------------------------------------------------------------------------------------

export interface SourceCapture {
  route: Route;
  device: DeviceProfile;
  orientation: Orientation;
  locale: string;
  /** Deep link URL used for capture */
  deepLink: string;
  /** ISO 8601 capture timestamp */
  capturedAt: string;
}

export interface OutputArtifact {
  /** Relative path from manifest location */
  relativePath: string;
  /** Output format */
  format: ImageFormat;
  /** Pixel dimensions */
  width: number;
  height: number;
  /** SHA-256 checksum of file contents */
  checksum: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Store type this artifact targets */
  store: StoreType;
}

export interface ToolMetadata {
  name: string;
  version: string;
  path?: string;
}

export interface Manifest {
  /** Unique run identifier */
  runId: string;
  /** ISO 8601 run timestamp */
  generatedAt: string;
  /** Pipeline version (semver) */
  pipelineVersion: string;
  /** Source captures used for this run */
  sources: SourceCapture[];
  /** Output artifacts produced */
  artifacts: OutputArtifact[];
  /** Tool versions used during generation */
  tools: ToolMetadata[];
  /** Git commit hash if available */
  gitCommit?: string;
  /** Notes or warnings */
  notes?: string[];
}

// ------------------------------------------------------------------------------------------------
// Checksum Utilities
// ------------------------------------------------------------------------------------------------

/**
 * Compute SHA-256 hex digest of file contents.
 * Returns lowercase hex string.
 */
export function computeChecksum(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Cannot compute checksum: file not found at ${filePath}`);
  }
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

/**
 * Compute SHA-256 hex digest of a string.
 * Returns lowercase hex string.
 */
export function computeStringChecksum(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

// ------------------------------------------------------------------------------------------------
// Manifest Serialization (Deterministic)
// ------------------------------------------------------------------------------------------------

/**
 * Sort object keys recursively for deterministic JSON serialization.
 */
function sortKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys) as T;
  return Object.keys(obj as object)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {}) as T;
}

/**
 * Serialize manifest to JSON string with deterministic key ordering.
 * Uses sorted keys so identical manifests produce identical strings.
 */
export function serializeManifest(manifest: Manifest): string {
  const sorted = sortKeys(manifest);
  return JSON.stringify(sorted, null, 2);
}

/**
 * Compute manifest content checksum.
 * This allows comparing two manifests for identity.
 */
export function computeManifestChecksum(manifest: Manifest): string {
  const serialized = serializeManifest(manifest);
  return computeStringChecksum(serialized);
}

// ------------------------------------------------------------------------------------------------
// Manifest Builder
// ------------------------------------------------------------------------------------------------

/**
 * Generate a unique run ID based on timestamp and random suffix.
 */
export function generateRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `run-${timestamp}-${randomSuffix}`;
}

/**
 * Build a deep link URL for a given route.
 */
export function buildDeepLink(route: Route, params?: Record<string, string>): string {
  const base = 'gitnotes://';
  switch (route) {
    case 'home':
      return `${base}home`;
    case 'notes':
      return `${base}notes`;
    case 'note-editor':
      return params?.noteId ? `${base}note/${params.noteId}` : `${base}home`;
    case 'canvas-editor':
      return params?.canvasId ? `${base}canvas/${params.canvasId}` : `${base}home`;
    case 'todos':
      return `${base}home`; // No direct deep link, use home
    case 'explore':
      return `${base}explore`;
    case 'chat':
      return `${base}chat`;
    case 'chat-thread':
      return params?.threadId ? `${base}chat/${params.threadId}` : `${base}chat`;
    case 'settings':
      return `${base}settings`;
    case 'graph-view':
      return `${base}home`; // No direct deep link
    default:
      return `${base}home`;
  }
}

/**
 * Create a source capture record.
 */
export function createSourceCapture(
  route: Route,
  device: DeviceProfile,
  orientation: Orientation,
  locale: string = 'en',
  capturedAt?: string,
): SourceCapture {
  return {
    route,
    device,
    orientation,
    locale,
    deepLink: buildDeepLink(route),
    capturedAt: capturedAt ?? new Date().toISOString(),
  };
}

/**
 * Create an output artifact record from a file.
 */
export function createOutputArtifact(
  absolutePath: string,
  relativeTo: string,
  device: DeviceProfile,
  orientation: Orientation,
  format: ImageFormat,
  store: StoreType,
): OutputArtifact {
  const relPath = relative(relativeTo, absolutePath);
  const stats = require('fs').statSync(absolutePath);
  const dims = getDimensions(device, orientation);

  return {
    relativePath: relPath,
    format,
    width: dims.width,
    height: dims.height,
    checksum: computeChecksum(absolutePath),
    sizeBytes: stats.size,
    store,
  };
}

/**
 * Create a tool metadata record.
 */
export function createToolMetadata(tool: ToolVersion): ToolMetadata {
  return {
    name: tool.name,
    version: tool.version,
    path: tool.path,
  };
}

/**
 * Get available tool versions from environment.
 */
export function detectToolVersions(): ToolMetadata[] {
  const tools: ToolMetadata[] = [];

  // Detect Node version
  tools.push({
    name: 'node',
    version: process.version.slice(1),
  });

  // Detect npm/yarn version (from packageManager in package.json)
  const packageManager = process.env.npm_config_user_agent?.split('/')[0] ?? 'yarn';
  const packageManagerVersion = process.env.npm_config_user_agent?.split('/')[1] ?? 'unknown';
  tools.push({
    name: packageManager,
    version: packageManagerVersion,
  });

  // sharp is a known dependency
  try {
    const sharp = require('sharp');
    tools.push({ name: 'sharp', version: sharp.versions.sharp });
  } catch {
    // sharp not available in this environment
  }

  return tools;
}

/**
 * Build a complete manifest for a marketing asset run.
 */
export function buildManifest(params: {
  runId: string;
  sources: SourceCapture[];
  artifacts: OutputArtifact[];
  tools?: ToolMetadata[];
  gitCommit?: string;
  notes?: string[];
}): Manifest {
  const manifest: Manifest = {
    runId: params.runId,
    generatedAt: new Date().toISOString(),
    pipelineVersion: '1.0.0',
    sources: params.sources,
    artifacts: params.artifacts,
    tools: params.tools ?? detectToolVersions(),
    gitCommit: params.gitCommit,
    notes: params.notes,
  };

  return manifest;
}

// ------------------------------------------------------------------------------------------------
// Manifest File Operations
// ------------------------------------------------------------------------------------------------

/**
 * Write manifest to a file.
 * Creates parent directories if needed.
 */
export function writeManifest(manifest: Manifest, outputPath: string): void {
  const dir = resolve(outputPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = serializeManifest(manifest);
  writeFileSync(outputPath, content, 'utf8');
}

/**
 * Read and parse a manifest file.
 * Returns null if file doesn't exist.
 */
export function readManifest(inputPath: string): Manifest | null {
  if (!existsSync(inputPath)) {
    return null;
  }
  const content = readFileSync(inputPath, 'utf8');
  return JSON.parse(content) as Manifest;
}

/**
 * Validate a manifest structure.
 * Returns array of validation errors (empty if valid).
 */
export function validateManifest(manifest: unknown): string[] {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest must be an object'];
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.runId !== 'string') {
    errors.push('runId must be a string');
  }
  if (typeof m.generatedAt !== 'string') {
    errors.push('generatedAt must be a string');
  }
  if (typeof m.pipelineVersion !== 'string') {
    errors.push('pipelineVersion must be a string');
  }
  if (!Array.isArray(m.sources)) {
    errors.push('sources must be an array');
  }
  if (!Array.isArray(m.artifacts)) {
    errors.push('artifacts must be an array');
  }
  if (!Array.isArray(m.tools)) {
    errors.push('tools must be an array');
  }

  // Validate sources
  if (Array.isArray(m.sources)) {
    m.sources.forEach((source: unknown, index: number) => {
      if (!source || typeof source !== 'object') {
        errors.push(`sources[${index}] must be an object`);
        return;
      }
      const s = source as Record<string, unknown>;
      if (typeof s.route !== 'string') errors.push(`sources[${index}].route must be a string`);
      if (typeof s.device !== 'string') errors.push(`sources[${index}].device must be a string`);
      if (typeof s.orientation !== 'string')
        errors.push(`sources[${index}].orientation must be a string`);
      if (typeof s.locale !== 'string') errors.push(`sources[${index}].locale must be a string`);
      if (typeof s.deepLink !== 'string')
        errors.push(`sources[${index}].deepLink must be a string`);
      if (typeof s.capturedAt !== 'string')
        errors.push(`sources[${index}].capturedAt must be a string`);
    });
  }

  // Validate artifacts
  if (Array.isArray(m.artifacts)) {
    m.artifacts.forEach((artifact: unknown, index: number) => {
      if (!artifact || typeof artifact !== 'object') {
        errors.push(`artifacts[${index}] must be an object`);
        return;
      }
      const a = artifact as Record<string, unknown>;
      if (typeof a.relativePath !== 'string')
        errors.push(`artifacts[${index}].relativePath must be a string`);
      if (typeof a.format !== 'string') errors.push(`artifacts[${index}].format must be a string`);
      if (typeof a.width !== 'number') errors.push(`artifacts[${index}].width must be a number`);
      if (typeof a.height !== 'number') errors.push(`artifacts[${index}].height must be a number`);
      if (typeof a.checksum !== 'string')
        errors.push(`artifacts[${index}].checksum must be a string`);
      if (typeof a.sizeBytes !== 'number')
        errors.push(`artifacts[${index}].sizeBytes must be a number`);
    });
  }

  return errors;
}

/**
 * Verify artifact file matches manifest checksum.
 */
export function verifyArtifactChecksum(artifact: OutputArtifact, baseDir: string): boolean {
  const absolutePath = resolve(baseDir, artifact.relativePath);
  if (!existsSync(absolutePath)) {
    return false;
  }
  const actualChecksum = computeChecksum(absolutePath);
  return actualChecksum === artifact.checksum;
}

// ------------------------------------------------------------------------------------------------
export function safeResolveOutputPath(relativePath: string, baseDir?: string): string {
  const base = baseDir ?? OUTPUT_ROOT;
  const resolved = resolve(base, relativePath);
  const absoluteBase = resolve(base);
  const normalizedResolved = resolved.replace(/\\/g, '/');
  const normalizedAbsoluteBase = absoluteBase.replace(/\\/g, '/');

  if (
    !normalizedResolved.startsWith(normalizedAbsoluteBase + '/') &&
    normalizedResolved !== normalizedAbsoluteBase
  ) {
    throw new Error(
      `Path escape detected: "${relativePath}" resolves to "${resolved}" which is outside "${base}"`,
    );
  }

  return resolved;
}
