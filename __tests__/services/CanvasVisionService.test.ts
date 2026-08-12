import { describe, beforeEach, expect, it, jest } from '@jest/globals';

// Mock MUST come before import; use jest.fn() directly so the mock reference is stable
jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

import { generateText } from 'ai';
import { CanvasVisionService } from '../../src/services/canvas/CanvasVisionService';
import type { AtlasEncodeResult } from '../../src/services/canvas/AtlasEncoder';
import type { GridCell } from '../../src/services/canvas/HotspotGrid';

const mockGenerateText = jest.mocked(generateText);

function makeAtlas(overrides: Partial<AtlasEncodeResult> = {}): AtlasEncodeResult {
  // Valid PNG magic bytes
  const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  // Base64 representation of those bytes (valid data URL prefix)
  const base64 = 'data:image/png;base64,iVBORw0KGgo='; // valid PNG data URL
  return {
    base64,
    bytes,
    width: 512,
    height: 512,
    format: 'png',
    ...overrides,
  };
}

function makeHotspotGrid(
  cellOverrides: Array<Partial<GridCell>> = [],
): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const override = cellOverrides.find((c) => c.row === row && c.col === col);
      cells.push({
        row,
        col,
        strokeIndices: override?.strokeIndices ?? [],
      });
    }
  }
  return cells;
}

// Minimal stub for LanguageModel (satisfies type, never used as instance by mock)
const STUB_MODEL = { modelId: 'test-vision-model' } as any;

describe('CanvasVisionService', () => {
  let service: CanvasVisionService;

  beforeEach(() => {
    service = new CanvasVisionService();
    mockGenerateText.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('transcribe', () => {
    it('returns parsed result on valid model response', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({ observedText: 'Hello world', commands: [] }),
        usage: { totalTokens: 100 },
      } as any);

      const result = await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas(),
      });
      expect(result).not.toBeNull();
      expect(result!.parsed.observedText).toBe('Hello world');
      expect(result!.rawText).toContain('Hello world');
      expect(result!.modelId).toBe('test-vision-model');
      expect(result!.totalTokens).toBe(100);
    });

    it('injects image into messages with correct data URL', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({ observedText: 'X' }),
        usage: { totalTokens: 10 },
      } as any);

      await service.transcribe(STUB_MODEL, { atlas: makeAtlas() });

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const call = mockGenerateText.mock.calls[0][0];
      const userContent = call.messages[0].content;
      expect(userContent).toHaveLength(2);
      const imagePart = userContent.find((p: any) => p.type === 'image');
      expect(imagePart).toBeDefined();
      expect(imagePart.image).toMatch(/^data:image\/png;base64,/);
    });

    it('includes hotspot grid stroke hints in system prompt', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({ observedText: 'X' }),
      } as any);

      const grid = makeHotspotGrid([
        { row: 2, col: 3, strokeIndices: [1, 2] },
        { row: 5, col: 1, strokeIndices: [3] },
      ]);

      await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas(),
        hotspotGrid: grid,
      });

      const systemText = mockGenerateText.mock.calls[0][0].messages[0].content[0].text;
      expect(systemText).toContain('(2,3): strokes [1, 2]');
      expect(systemText).toContain('(5,1): strokes [3]');
    });

    it('returns null when atlas has no bytes', async () => {
      const result = await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas({ bytes: new Uint8Array(0) }),
      });
      expect(result).toBeNull();
    });

    it('returns null when atlas base64 is undefined', async () => {
      const atlas = makeAtlas();
      (atlas as any).base64 = undefined;
      const result = await service.transcribe(STUB_MODEL, { atlas });
      expect(result).toBeNull();
    });

    it('returns null when generateText throws', async () => {
      mockGenerateText.mockRejectedValue(new Error('Model unavailable'));
      const result = await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas(),
      });
      expect(result).toBeNull();
    });

    it('returns null when model response cannot parse', async () => {
      mockGenerateText.mockResolvedValue({
        text: '```json\n{"observedText":"X", "commands":[{"kind":"invalid"}]}\n```',
      } as any);
      const result = await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas(),
      });
      // Invalid kind → schema fails → parser returns null
      expect(result).toBeNull();
    });

    it('uses low temperature (0.2) for deterministic transcription', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({ observedText: 'X' }),
      } as any);
      await service.transcribe(STUB_MODEL, { atlas: makeAtlas() });
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const call = mockGenerateText.mock.calls[0][0];
      expect(call.temperature).toBe(0.2);
    });

    it('respects optional userPrompt in prompt', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({ observedText: 'X' }),
      } as any);
      await service.transcribe(STUB_MODEL, {
        atlas: makeAtlas(),
        userPrompt: 'Describe the diagram',
      });
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const call = mockGenerateText.mock.calls[0][0];
      const systemText = call.messages[0].content[0].text;
      expect(systemText).toContain('Describe the diagram');
    });
  });

  describe('buildSystemPrompt', () => {
    it('returns base prompt when no grid or userPrompt', () => {
      const prompt = service.buildSystemPrompt();
      expect(prompt).toContain('transcribes and analyzes');
      expect(prompt).toContain('JSON');
    });

    it('includes user prompt verbatim when provided', () => {
      const prompt = service.buildSystemPrompt(undefined, 'Analyze layout');
      expect(prompt).toContain('Analyze layout');
    });

    it('omits grid section when all cells empty', () => {
      const grid = makeHotspotGrid();
      const prompt = service.buildSystemPrompt(grid);
      expect(prompt).not.toContain('Strokes appear in these grid cells');
    });

    it('includes only non-empty cells', () => {
      const grid = makeHotspotGrid([
        { row: 0, col: 0, strokeIndices: [42] },
      ]);
      const prompt = service.buildSystemPrompt(grid);
      expect(prompt).toContain('(0,0): strokes [42]');
      // Should NOT contain empty cells like (0,1)
      expect(prompt).not.toContain('(0,1)');
    });
  });
});
