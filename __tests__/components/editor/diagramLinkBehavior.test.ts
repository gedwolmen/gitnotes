import {
  extractDiagramJsonRefs,
} from '@/components/editor/editorShared';
import {
  diagramToLink,
  diagramIdFromLink,
  isDiagramLink,
  DIAGRAM_LINK_PREFIX,
} from '@/models/Diagram';

describe('extractDiagramJsonRefs', () => {
  it('extracts markdown diagram links', () => {
    const content = 'Check out this [Architecture](diagram:diagram-abc123) diagram.';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual(['diagram:diagram-abc123']);
  });

  it('extracts neorg diagram links', () => {
    const content = '{diagram:diagram-xyz789}[My Diagram]';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual(['diagram:diagram-xyz789']);
  });

  it('extracts org-mode diagram links', () => {
    const content = 'See [[diagram:diagram-def456][Flowchart]] for details.';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual(['diagram:diagram-def456']);
  });

  it('extracts multiple diagram links from mixed content', () => {
    const content = `
Here is the [Architecture](diagram:diagram-001) overview.
Another diagram {diagram:diagram-002}[Reference].
And [[diagram:diagram-003][Flow]].
    `.trim();
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual(['diagram:diagram-001', 'diagram:diagram-002', 'diagram:diagram-003']);
  });

  it('returns empty array when no diagram links present', () => {
    const content = 'Just regular text with a [canvas link](canvas:canvas-123) and no diagram links.';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual([]);
  });

  it('deduplicates repeated diagram links', () => {
    const content = '[First](diagram:diagram-abc) and [Second](diagram:diagram-abc) again.';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual(['diagram:diagram-abc']);
  });

  it('does not match canvas links', () => {
    const content = '[My Canvas](canvas:canvas-123) is not a diagram link.';
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toEqual([]);
  });

  it('handles empty content', () => {
    expect(extractDiagramJsonRefs('')).toEqual([]);
  });
});

describe('Diagram link helpers', () => {
  describe('DIAGRAM_LINK_PREFIX', () => {
    it('is a distinct prefix separate from canvas:', () => {
      expect(DIAGRAM_LINK_PREFIX).toBe('diagram:');
      expect(DIAGRAM_LINK_PREFIX).not.toBe('canvas:');
    });
  });

  describe('isDiagramLink', () => {
    it('returns true for diagram: prefixed strings', () => {
      expect(isDiagramLink('diagram:diagram-abc123')).toBe(true);
    });

    it('returns false for canvas: prefixed strings', () => {
      expect(isDiagramLink('canvas:canvas-abc123')).toBe(false);
    });

    it('returns false for plain strings', () => {
      expect(isDiagramLink('just-some-text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isDiagramLink('')).toBe(false);
    });
  });

  describe('diagramIdFromLink', () => {
    it('extracts id from diagram: link', () => {
      expect(diagramIdFromLink('diagram:diagram-abc123')).toBe('diagram-abc123');
    });

    it('throws for canvas: links (wrong prefix)', () => {
      expect(() => diagramIdFromLink('canvas:canvas-123')).toThrow();
    });
  });

  describe('diagramToLink', () => {
    it('creates a diagram: link from a diagram id', () => {
      expect(diagramToLink({ id: 'diagram-xyz' })).toBe('diagram:diagram-xyz');
    });

    it('creates distinct links from canvas links', () => {
      const diagramLink = diagramToLink({ id: 'diagram-abc' });
      expect(diagramLink.startsWith('diagram:')).toBe(true);
      expect(diagramLink.startsWith('canvas:')).toBe(false);
    });
  });

  describe('round-trip identity', () => {
    it('diagramToLink then diagramIdFromLink returns original id', () => {
      const originalId = 'diagram-test-123';
      const link = diagramToLink({ id: originalId });
      const extractedId = diagramIdFromLink(link);
      expect(extractedId).toBe(originalId);
    });
  });
});

describe('Diagram link vs Canvas link isolation', () => {
  it('a diagram link does not satisfy isCanvasLink', () => {
    const { isCanvasLink } = require('@/models/Canvas');
    const diagramLink = diagramToLink({ id: 'diagram-123' });
    expect(isCanvasLink(diagramLink)).toBe(false);
  });

  it('a canvas link does not satisfy isDiagramLink', () => {
    const { isCanvasLink } = require('@/models/Canvas');
    const { canvasToLink } = require('@/models/Canvas');
    const canvasLink = canvasToLink({ id: 'canvas-456' });
    expect(isDiagramLink(canvasLink)).toBe(false);
    expect(isCanvasLink(canvasLink)).toBe(true);
  });
});

describe('Diagram link insertion formats', () => {
  function simulateHandleLinkDiagram(
    content: string,
    diagramId: string,
    diagramTitle: string,
    noteFormat: 'markdown' | 'neorg' | 'org',
  ): string {
    const link = diagramToLink({ id: diagramId });
    const linkText =
      noteFormat === 'neorg'
        ? `\n{${link}}[${diagramTitle}]\n`
        : noteFormat === 'org'
          ? `\n[[${link}][${diagramTitle}]]\n`
          : `\n[${diagramTitle}](${link})\n`;
    return content + linkText;
  }

  const diagramId = 'diagram-abc123';
  const diagramTitle = 'Architecture Overview';
  const initialContent = 'Before content.\n';

  it('inserts markdown diagram link format', () => {
    const result = simulateHandleLinkDiagram(initialContent, diagramId, diagramTitle, 'markdown');
    expect(result).toContain(`[${diagramTitle}](diagram:${diagramId})`);
    expect(result).not.toContain('[[diagram:');
    expect(result).not.toContain('{diagram:');
  });

  it('inserts neorg diagram link format', () => {
    const result = simulateHandleLinkDiagram(initialContent, diagramId, diagramTitle, 'neorg');
    expect(result).toContain(`{diagram:${diagramId}}[${diagramTitle}]`);
    expect(result).not.toContain('[[diagram:');
    expect(result).not.toContain(`[${diagramTitle}](`);
  });

  it('inserts org diagram link format', () => {
    const result = simulateHandleLinkDiagram(initialContent, diagramId, diagramTitle, 'org');
    expect(result).toContain(`[[diagram:${diagramId}][${diagramTitle}]]`);
    expect(result).not.toContain(`{${diagramId}`);
    expect(result).not.toContain(`[${diagramTitle}](`);
  });
});

describe('Diagram link survival through note save/reload', () => {
  it('diagram link text is preserved in content string', () => {
    const content = `# My Note\n\nSee [Architecture](diagram:diagram-123) diagram.\n`;
    const refs = extractDiagramJsonRefs(content);
    expect(refs).toContain('diagram:diagram-123');
  });

  it('canvas link is not extracted as diagram link', () => {
    const content = `# My Note\n\nSee [My Canvas](canvas:canvas-456) canvas.\n`;
    const refs = extractDiagramJsonRefs(content);
    expect(refs).not.toContain('canvas:canvas-456');
    expect(refs).toEqual([]);
  });

  it('mixed canvas and diagram links are correctly isolated', () => {
    const content = `
![Canvas Drawing](file:canvas-drawings/canvas-123.json)
[Diagram Link](diagram:diagram-456)
    `.trim();
    const diagramRefs = extractDiagramJsonRefs(content);
    const { extractCanvasJsonRefs } = require('@/components/editor/editorShared');
    const canvasRefs = extractCanvasJsonRefs(content);
    expect(diagramRefs).toEqual(['diagram:diagram-456']);
    expect(canvasRefs).toContain('file:canvas-drawings/canvas-123.json');
  });
});

describe('Diagram picker context filtering', () => {
  function filterDiagramsByContext(
    diagrams: Array<{ id: string; repo?: string; branch?: string }>,
    currentRepo?: string,
    currentBranch?: string,
  ) {
    return diagrams.filter((diagram) => {
      if (!diagram.repo) return true;
      if (diagram.repo !== currentRepo) return false;
      if (diagram.branch && diagram.branch !== currentBranch) return false;
      return true;
    });
  }

  it('includes diagrams with no repo (local) regardless of context', () => {
    const diagrams = [
      { id: 'diagram-local' },
      { id: 'diagram-owned', repo: 'owner/repo', branch: 'main' },
    ];
    const result = filterDiagramsByContext(diagrams, 'owner/repo', 'main');
    expect(result.map((d) => d.id)).toContain('diagram-local');
  });

  it('includes diagrams matching repo and branch', () => {
    const diagrams = [
      { id: 'diagram-owned', repo: 'owner/repo', branch: 'main' },
    ];
    const result = filterDiagramsByContext(diagrams, 'owner/repo', 'main');
    expect(result.map((d) => d.id)).toContain('diagram-owned');
  });

  it('excludes diagrams from different repos', () => {
    const diagrams = [
      { id: 'diagram-other', repo: 'other/repo', branch: 'main' },
    ];
    const result = filterDiagramsByContext(diagrams, 'owner/repo', 'main');
    expect(result.map((d) => d.id)).not.toContain('diagram-other');
  });

  it('excludes diagrams from same repo but different branch', () => {
    const diagrams = [
      { id: 'diagram-feature', repo: 'owner/repo', branch: 'feature-x' },
    ];
    const result = filterDiagramsByContext(diagrams, 'owner/repo', 'main');
    expect(result.map((d) => d.id)).not.toContain('diagram-feature');
  });

  it('includes diagrams from same repo with no branch constraint', () => {
    const diagrams = [
      { id: 'diagram-unbranched', repo: 'owner/repo' },
    ];
    const result = filterDiagramsByContext(diagrams, 'owner/repo', 'main');
    expect(result.map((d) => d.id)).toContain('diagram-unbranched');
  });
});
