import { describe, expect, it } from '@jest/globals';
import {
  parseVisionResponse,
  CanvasCommandSchema,
  VisionResponseSchema,
} from '../../src/services/canvas/VisionResponseParser';

describe('parseVisionResponse', () => {
  describe('pure JSON format', () => {
    it('parses pure JSON body', () => {
      const json = JSON.stringify({
        observedText: 'Hello world',
        commands: [
          { kind: 'text', label: 'Replace stroke', payload: { text: 'Hello world' } },
        ],
      });
      const result = parseVisionResponse(json);
      expect(result).not.toBeNull();
      expect(result!.observedText).toBe('Hello world');
      expect(result!.commands).toHaveLength(1);
      expect(result!.commands![0].kind).toBe('text');
    });

    it('parses JSON with only observedText', () => {
      const json = JSON.stringify({ observedText: 'A sketch of a house' });
      const result = parseVisionResponse(json);
      expect(result?.observedText).toBe('A sketch of a house');
      expect(result?.commands).toBeUndefined();
    });

    it('parses JSON with empty commands array', () => {
      const json = JSON.stringify({ observedText: 'Some text', commands: [] });
      const result = parseVisionResponse(json);
      expect(result?.commands).toEqual([]);
    });
  });

  describe('fenced code block format', () => {
    it('parses ```json fenced block', () => {
      const fenced = 'Here is my analysis:\n```json\n{"observedText":"Hello"}\n```\nLet me know.';
      const result = parseVisionResponse(fenced);
      expect(result?.observedText).toBe('Hello');
    });

    it('parses ``` fenced block without language marker', () => {
      const fenced = '```{"observedText":"No lang"}\n```';
      const result = parseVisionResponse(fenced);
      expect(result?.observedText).toBe('No lang');
    });
  });

  describe('embedded JSON format', () => {
    it('extracts JSON embedded in prose', () => {
      const embedded = 'Based on the canvas, {"observedText":"embedded text","commands":[{"kind":"highlight","label":"Focus area","confidence":0.9}]} this seems correct.';
      const result = parseVisionResponse(embedded);
      expect(result?.observedText).toBe('embedded text');
      expect(result?.commands).toHaveLength(1);
      expect(result?.commands?.[0].confidence).toBe(0.9);
    });
  });

  describe('fallback behavior', () => {
    it('returns observedText-only result when response is plain prose', () => {
      const prose = 'This canvas appears to contain a handwritten note.';
      const result = parseVisionResponse(prose);
      expect(result?.observedText).toBe(prose);
      expect(result?.commands).toEqual([]);
    });

    it('returns observedText-only for invalid JSON in braces', () => {
      const badJson = 'Some {not valid json} here';
      const result = parseVisionResponse(badJson);
      expect(result).not.toBeNull();
      expect(result?.observedText).toContain('{not valid json}');
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(parseVisionResponse('')).toBeNull();
    });

    it('returns null for whitespace-only', () => {
      expect(parseVisionResponse('   \n\t  ')).toBeNull();
    });

    it('rejects JSON with invalid command kind', () => {
      const json = JSON.stringify({
        observedText: 'X',
        commands: [{ kind: 'invalid-kind', payload: {} }],
      });
      const result = parseVisionResponse(json);
      expect(result).toBeNull();
    });

    it('rejects command with out-of-range confidence', () => {
      const json = JSON.stringify({
        observedText: 'X',
        commands: [{ kind: 'text', confidence: 1.5 }],
      });
      const result = parseVisionResponse(json);
      expect(result).toBeNull();
    });

    it('rejects command with negative confidence', () => {
      const json = JSON.stringify({
        commands: [{ kind: 'text', confidence: -0.1 }],
      });
      const result = parseVisionResponse(json);
      expect(result).toBeNull();
    });

    it('accepts confidence=0 and confidence=1 as valid', () => {
      const json = JSON.stringify({
        commands: [
          { kind: 'text', confidence: 0 },
          { kind: 'text', confidence: 1 },
        ],
      });
      const result = parseVisionResponse(json);
      expect(result?.commands).toHaveLength(2);
    });

    it('passes through unknown payload fields (passthrough)', () => {
      const json = JSON.stringify({
        observedText: 'ok',
        customField: 'should pass',
      });
      const result = parseVisionResponse(json);
      expect(result).not.toBeNull();
      expect(result?.observedText).toBe('ok');
    });
  });
});

describe('CanvasCommandSchema', () => {
  it('accepts all 5 valid command kinds', () => {
    const kinds = ['text', 'highlight', 'shape', 'annotation', 'replace'] as const;
    for (const kind of kinds) {
      const result = CanvasCommandSchema.safeParse({ kind });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing kind', () => {
    const result = CanvasCommandSchema.safeParse({ payload: {} });
    expect(result.success).toBe(false);
  });

  it('rejects invalid kind', () => {
    const result = CanvasCommandSchema.safeParse({ kind: 'unknown' });
    expect(result.success).toBe(false);
  });
});

describe('VisionResponseSchema', () => {
  it('requires at least observedText or commands to be meaningful', () => {
    // Empty object is technically valid (both fields optional)
    const result = VisionResponseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full response with both fields', () => {
    const result = VisionResponseSchema.safeParse({
      observedText: 'Transcription',
      commands: [{ kind: 'text', label: 'Test' }],
    });
    expect(result.success).toBe(true);
  });
});
