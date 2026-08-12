/**
 * CanvasVisionService — transcribes a canvas atlas image using a vision-capable
 * LLM, injecting hotspot grid stroke-ordering hints to improve handwriting accuracy.
 *
 * Orchestrates:
 *   1. Validate inputs (atlas base64, hotspot grid, model availability)
 *   2. Build a `ModelMessage[]` with vision content (image + system prompt)
 *   3. Call `generateText` from the `ai` package with the provided LanguageModel
 *   4. Parse the response via VisionResponseParser to typed structured data
 *   5. Return typed result (or null with logged warning on failure)
 *
 * Fail-soft — never throws. Returns null on any failure with console.warn.
 *
 * Pattern reference: AIService.ts (uses same `ai` package, model injection style).
 */

import { generateText, type LanguageModel } from 'ai';
import {
  parseVisionResponse,
  type VisionResponse,
} from './VisionResponseParser';
import type { AtlasEncodeResult } from './AtlasEncoder';
import type { HotspotGridResult } from './HotspotGrid';

/**
 * System prompt instructing the vision model about the task.
 * Includes hotspot-grid stroke ordering hints when available.
 */
const CANVAS_VISION_SYSTEM_PROMPT = `You are an assistant that transcribes and analyzes handwritten canvas content.

The image you receive is a crop (atlas) from a larger canvas containing the user's recent handwriting.
Stroke ordering hints from the hotspot grid (below) tell you the chronological drawing order —
use this to disambiguate cursive direction and stroke sequence.

Return your response as a JSON object with this exact shape:

{
  "observedText": "A string containing the transcribed text, equations, or description. Empty string if nothing readable.",
  "commands": [
    {
      "kind": "text" | "highlight" | "shape" | "annotation" | "replace",
      "label": "Optional short human-readable label",
      "confidence": 0.0-1.0,
      "payload": { /* free-form data for the command, e.g. { text: "replaced text" } */ }
    }
  ]
}

- "kind" MUST be one of: text, highlight, shape, annotation, replace.
- "commands" may be absent or an empty array if there are no suggested edits.
- "confidence" is optional, 0..1 float.
- Return ONLY valid JSON inside a fenced \`\`\`json\`\`\` block, or as bare JSON.
- Do NOT include prose outside the JSON unless absolutely necessary — the JSON must parse.

Hotspot grid (stroke ordering hints):
`;

export interface CanvasVisionRequest {
  /** Atlas image bytes/base64 from AtlasEncoder */
  atlas: AtlasEncodeResult;
  /** Optional hotspot grid for stroke-order hints */
  hotspotGrid?: HotspotGridResult;
  /** Optional user prompt appended to the system prompt (default: transcription) */
  userPrompt?: string;
}

export interface CanvasVisionResult {
  /** Parsed, validated vision-model response */
  parsed: VisionResponse;
  /** Raw text from the model (for debugging / fallback display) */
  rawText: string;
  /** Model ID that was actually used */
  modelId: string;
  /** Total tokens consumed (input + output) if available */
  totalTokens?: number;
}

export class CanvasVisionService {
  /**
   * Transcribe / analyze a canvas atlas using the provided vision model.
   *
   * @param model LanguageModel instance (from AIService or direct provider)
   * @param request Atlas + optional hotspot grid + optional user prompt
   * @returns Parsed result or null on failure
   */
  async transcribe(
    model: LanguageModel,
    request: CanvasVisionRequest,
  ): Promise<CanvasVisionResult | null> {
    const { atlas, hotspotGrid, userPrompt } = request;

    // Validate atlas has image bytes
    if (!atlas.base64 || !atlas.bytes || atlas.bytes.length === 0) {
      console.warn('[CanvasVisionService] atlas has no image bytes');
      return null;
    }

    try {
      // Build the system prompt with hotspot hints
      const systemPromptWithHints = this.buildSystemPrompt(hotspotGrid, userPrompt);

      // Build the multi-modal user message with image + text
      const messages = [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: systemPromptWithHints,
            },
            {
              type: 'image' as const,
              image: atlas.base64.startsWith('data:')
                ? atlas.base64
                : `data:image/png;base64,${atlas.base64}`,
            },
          ],
        },
      ];

      const { text, usage } = await generateText({
        model,
        messages,
        temperature: 0.2, // low temp for more deterministic transcription
        maxTokens: 2048,
      });

      const parsed = parseVisionResponse(text);
      if (!parsed) {
        console.warn('[CanvasVisionService] Response failed to parse:', text.slice(0, 200));
        return null;
      }

      return {
        parsed,
        rawText: text,
        modelId: model.modelId,
        totalTokens: usage?.totalTokens,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[CanvasVisionService] Transcription failed:', message);
      return null;
    }
  }

  /**
   * Build the complete system prompt with hotspot hints.
   * Exposed for testing — production code calls `transcribe` instead.
   */
  buildSystemPrompt(
    hotspotGrid?: HotspotGridResult,
    userPrompt?: string,
  ): string {
    let prompt = CANVAS_VISION_SYSTEM_PROMPT;

    if (hotspotGrid && hotspotGrid.cells.length > 0) {
      const nonEmptyCells = hotspotGrid.cells.filter((c) => c.strokeIds.length > 0);
      if (nonEmptyCells.length > 0) {
        prompt += '\n\nStrokes appear in these grid cells (row,col) in chronological order:\n';
        for (const cell of nonEmptyCells) {
          prompt += `  (${cell.row},${cell.col}): strokes [${cell.strokeIds.join(', ')}]\n`;
        }
      }
    }

    if (userPrompt) {
      prompt += `\n\nUser request: ${userPrompt}`;
    } else {
      prompt += `\n\nTranscribe all visible text. Return the JSON as specified.`;
    }

    return prompt;
  }
}
