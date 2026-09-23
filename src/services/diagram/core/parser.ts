/**
 * Zod-powered parse layer for termdraw `.td.json` version-1 documents.
 * Schema compatibility: termdraw `.td.json` format, version 1.
 * Provenance: clean-room implementation compatible with the termdraw v1 schema.
 */

import { z } from 'zod';
import type { DrawDocument, DrawObject } from '../../../models/DiagramTypes';
import { DIAGRAM_DOCUMENT_VERSION } from '../../../models/DiagramTypes';

// ---------------------------------------------------------------------------
// Zod enums matching domain literals
// ---------------------------------------------------------------------------

const ZInkColor = z.enum(['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta']);
const ZBoxStyle = z.enum(['auto', 'light', 'heavy', 'double', 'dashed']);
const ZLineStyle = z.enum(['smooth', 'light', 'double', 'dashed']);
const ZTextBorder = z.enum(['none', 'single', 'double', 'underline']);
const ZOrientation = z.enum(['horizontal-first', 'vertical-first']);

// ---------------------------------------------------------------------------
// Per-variant schemas — discriminated by `type`
// discriminatedUnion uses `type` at parse time for routing; no `as` casts.
// ---------------------------------------------------------------------------

const ZPoint = z.object({ x: z.number().int(), y: z.number().int() });

const ZBox = z.object({
  id: z.string().min(1),
  type: z.literal('box'),
  z: z.number().int(),
  parentId: z.union([z.string(), z.null()]),
  color: ZInkColor,
  left: z.number().int(),
  top: z.number().int(),
  right: z.number().int(),
  bottom: z.number().int(),
  style: ZBoxStyle,
}).refine(
  (v) => v.left <= v.right && v.top <= v.bottom,
  { error: 'left must be <= right and top must be <= bottom' },
);

const ZLine = z.object({
  id: z.string().min(1),
  type: z.literal('line'),
  z: z.number().int(),
  parentId: z.union([z.string(), z.null()]),
  color: ZInkColor,
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
  style: ZLineStyle,
});

const ZElbow = z.object({
  id: z.string().min(1),
  type: z.literal('elbow'),
  z: z.number().int(),
  parentId: z.union([z.string(), z.null()]),
  color: ZInkColor,
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
  style: ZLineStyle,
  orientation: ZOrientation,
});

const ZPaint = z.object({
  id: z.string().min(1),
  type: z.literal('paint'),
  z: z.number().int(),
  parentId: z.union([z.string(), z.null()]),
  color: ZInkColor,
  points: z.array(ZPoint).min(1),
  brush: z.string().refine((v) => [...v.trim()].length === 1, { error: 'must be a single visible cell character' }),
});

const ZText = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  z: z.number().int(),
  parentId: z.union([z.string(), z.null()]),
  color: ZInkColor,
  x: z.number().int(),
  y: z.number().int(),
  content: z.string(),
  border: ZTextBorder,
});

const ZDrawObject = z.discriminatedUnion('type', [ZBox, ZLine, ZElbow, ZPaint, ZText]);

// ---------------------------------------------------------------------------
// Versioned document schemas
// ---------------------------------------------------------------------------

// Extracts version from any document (known or unknown version) — used by the
// migration entry point to route between supported/unsupported versions.
const ZVersionedDocument = z.object({
  version: z.number(),
});

const ZDocument = z.object({
  version: z.literal(DIAGRAM_DOCUMENT_VERSION),
  objects: z.array(ZDrawObject),
});

// ---------------------------------------------------------------------------
// Freeze helpers — applied after successful parse (trusted data)
// ---------------------------------------------------------------------------

function applyFreeze(obj: DrawObject): DrawObject {
  switch (obj.type) {
    case 'box': return Object.freeze(obj);
    case 'line': return Object.freeze(obj);
    case 'elbow': return Object.freeze(obj);
    case 'paint': {
      const frozen = Object.freeze({
        ...obj,
        points: Object.freeze(obj.points.map((p) => Object.freeze({ x: p.x, y: p.y }))),
      });
      return frozen;
    }
    case 'text': return Object.freeze(obj);
  }
}

function freezeDocument(raw: { version: 1; objects: DrawObject[] }): DrawDocument {
  return Object.freeze({
    version: raw.version,
    objects: Object.freeze(raw.objects.map(applyFreeze)),
  });
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class DiagramParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramParseError';
  }
}

// ---------------------------------------------------------------------------
// Migration result type
// ---------------------------------------------------------------------------

const SUPPORTED_VERSIONS = [DIAGRAM_DOCUMENT_VERSION] as const;

/**
 * Result of attempting to migrate a diagram document.
 * v1 documents parse strictly and return `{ ok: true, version: 1, document }`.
 * Unsupported future versions return `{ ok: false, version, reason }`.
 */
export type DiagramMigrationResult =
  | { readonly ok: true; readonly version: 1; readonly document: DrawDocument }
  | { readonly ok: false; readonly version: number; readonly reason: string };

// ---------------------------------------------------------------------------
// Internal parse helper
// ---------------------------------------------------------------------------

function parseWithZod(input: unknown): DrawDocument {
  const result = ZDocument.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join('; ');
    throw new DiagramParseError(issues);
  }
  const doc = result.data;
  if (doc.objects.length !== new Set(doc.objects.map((o) => o.id)).size) {
    throw new DiagramParseError('duplicate object id detected');
  }
  return freezeDocument(doc);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseDiagramDocument(input: string): DrawDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON';
    throw new DiagramParseError(`JSON parse failed: ${msg}`);
  }
  return parseWithZod(parsed);
}

export function validateDiagramDocument(input: unknown): DrawDocument {
  return parseWithZod(input);
}

/**
 * Migration entry point for diagram documents.
 *
 * Attempts to parse and validate a diagram document, routing to the appropriate
 * version handler. For version 1, validation is strict (all current rules apply).
 * For unsupported future versions, returns `{ ok: false, version, reason }`
 * instead of throwing, so callers can present an actionable migration UX.
 *
 * @param input — a raw JSON string or a pre-parsed object
 */
export function migrateDiagramDocument(input: unknown): DiagramMigrationResult {
  let raw: unknown;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      throw new DiagramParseError(`JSON parse failed: ${msg}`);
    }
  } else {
    raw = input;
  }

  const versionResult = ZVersionedDocument.safeParse(raw);
  if (!versionResult.success) {
    const issues = versionResult.error.issues.map((i) => i.message).join('; ');
    throw new DiagramParseError(issues);
  }
  const version = versionResult.data.version;

  if (version === DIAGRAM_DOCUMENT_VERSION) {
    try {
      const doc = parseWithZod(raw);
      return Object.freeze({ ok: true, version: 1 as const, document: doc });
    } catch (err) {
      if (err instanceof DiagramParseError) {
        return Object.freeze({
          ok: false,
          version,
          reason: `v1 parse error: ${err.message}`,
        });
      }
      throw err;
    }
  }

  return Object.freeze({
    ok: false,
    version,
    reason: `version ${version} is not supported; supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
  });
}
