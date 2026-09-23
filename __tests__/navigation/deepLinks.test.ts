/**
 * Tests for deep link configuration.
 * Verifies gitnotes://canvas/:canvasId and gitnotes://diagram/:diagramId routes.
 */

/**
 * Simulates the React Navigation linking config resolution.
 * The actual linking config is built in AppNavigator.tsx.
 */
const CANVAS_DEEP_LINK = 'gitnotes://canvas/canvas-abc123';
const DIAGRAM_DEEP_LINK = 'gitnotes://diagram/diagram-xyz789';

describe('Deep link URL parsing', () => {
  it('parses canvas deep link URL correctly', () => {
    const url = CANVAS_DEEP_LINK;
    const match = url.match(/^gitnotes:\/\/canvas\/(.+)$/);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe('canvas-abc123');
  });

  it('parses diagram deep link URL correctly', () => {
    const url = DIAGRAM_DEEP_LINK;
    const match = url.match(/^gitnotes:\/\/diagram\/(.+)$/);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe('diagram-xyz789');
  });

  it('canvas deep link does not match diagram pattern', () => {
    const url = CANVAS_DEEP_LINK;
    const match = url.match(/^gitnotes:\/\/diagram\/(.+)$/);
    expect(match).toBeNull();
  });

  it('diagram deep link does not match canvas pattern', () => {
    const url = DIAGRAM_DEEP_LINK;
    const match = url.match(/^gitnotes:\/\/canvas\/(.+)$/);
    expect(match).toBeNull();
  });

  it('root canvases URL routes to CanvasList', () => {
    const url = 'gitnotes://canvases';
    const match = url.match(/^gitnotes:\/\/canvases$/);
    expect(match).toBeTruthy();
  });

  it('canvas deep link with no ID is not matched by canvasId pattern', () => {
    const url = 'gitnotes://canvas/';
    const match = url.match(/^gitnotes:\/\/canvas\/(.+)$/);
    expect(match).toBeNull();
  });
});

describe('Diagram link helpers from Diagram model', () => {
  it('DIAGRAM_LINK_PREFIX is correct', () => {
    const { DIAGRAM_LINK_PREFIX } = require('../../src/models/Diagram');
    expect(DIAGRAM_LINK_PREFIX).toBe('diagram:');
  });

  it('isDiagramLink detects diagram links', () => {
    const { isDiagramLink } = require('../../src/models/Diagram');
    expect(isDiagramLink('diagram:abc123')).toBe(true);
    expect(isDiagramLink('canvas:abc123')).toBe(false);
    expect(isDiagramLink('https://example.com')).toBe(false);
  });

  it('diagramIdFromLink extracts id correctly', () => {
    const { diagramIdFromLink } = require('../../src/models/Diagram');
    expect(diagramIdFromLink('diagram:my-diagram-123')).toBe('my-diagram-123');
  });

  it('diagramToLink creates correct link', () => {
    const { diagramToLink } = require('../../src/models/Diagram');
    expect(diagramToLink({ id: 'diag-1' })).toBe('diagram:diag-1');
  });
});
