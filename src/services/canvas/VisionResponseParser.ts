import { z } from 'zod';

/**
 * A single command returned by the vision model when transcribing/atlas-analyzing.
 * Represents an edit or overlay action the user may accept/discard.
 */
export const CanvasCommandSchema = z.object({
  /** Discriminated command kind */
  kind: z.enum(['text', 'highlight', 'shape', 'annotation', 'replace']),
  /** Model-generated label for UI (e.g. "Replace stroke with clean text") */
  label: z.string().optional(),
  /** Optional confidence 0..1 */
  confidence: z.number().min(0).max(1).optional(),
  /** Payload — varies per kind. Kept free-form for model flexibility. */
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type CanvasCommand = z.infer<typeof CanvasCommandSchema>;

/**
 * Zod schema for the vision model response.
 *
 * The model may return this JSON directly (as a fenced code block) or
 * interleave with plain text. The parser below extracts from either.
 */
export const VisionResponseSchema = z.object({
  /** Free-form transcription or analysis text (may be empty) */
  observedText: z.string().optional(),
  /** Suggested edits / overlays (may be undefined or empty) */
  commands: z.array(CanvasCommandSchema).optional(),
}).passthrough();

export type VisionResponse = z.infer<typeof VisionResponseSchema>;

/**
 * Parse a vision model response string into a typed VisionResponse.
 *
 * Handles three formats:
 * 1. Pure JSON body: `{ "observedText": "..." }`
 * 2. Fenced code blocks: ````json ... ```` surrounding the JSON
 * 3. Partial JSON embedded in prose (first `{` ... last `}`)
 *
 * Returns a typed VisionResponse if parseable and schema-valid.
 * Returns null if the response cannot be parsed or fails validation.
 *
 * All errors are swallowed and logged so this function NEVER throws
 * (vision responses are best-effort).
 */
export function parseVisionResponse(raw: string): VisionResponse | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Fast path: entire response is JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const parsed = tryParseJson(trimmed);
    if (parsed) {
      return validateResponse(parsed);
    }
  }

  // Fenced code block: ```json ... ```  or  ``` ... ```
  const fencedMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fencedMatch) {
    const parsed = tryParseJson(fencedMatch[1]);
    if (parsed) {
      return validateResponse(parsed);
    }
  }

  // Embedded JSON: find first `{` and last `}`
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = tryParseJson(candidate);
    if (parsed) {
      return validateResponse(parsed);
    }
  }

  // Fallback: treat entire response as observedText with no commands
  return {
    observedText: trimmed,
    commands: [],
  };
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateResponse(obj: unknown): VisionResponse | null {
  const result = VisionResponseSchema.safeParse(obj);
  if (!result.success) {
    console.warn('[VisionResponseParser] Schema validation failed:', result.error.issues);
    return null;
  }
  return result.data;
}
