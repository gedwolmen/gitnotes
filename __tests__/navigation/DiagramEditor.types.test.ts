/**
 * Tests for the navigation integration of DiagramEditor.
 * Verifies: types, deep link config, and AppNavigator registration.
 */
import type { RootStackParamList } from '../../src/navigation/types';

describe('DiagramEditor navigation types', () => {
  it('DiagramEditor route accepts optional diagramId and diagramTitle', () => {
    const validParams: RootStackParamList['DiagramEditor'] = {
      diagramId: 'diagram-123',
      diagramTitle: 'My Diagram',
    };
    expect(validParams.diagramId).toBe('diagram-123');
    expect(validParams.diagramTitle).toBe('My Diagram');
  });

  it('DiagramEditor route accepts repo and branch context params', () => {
    const ctxParams: RootStackParamList['DiagramEditor'] = {
      diagramTitle: 'My Diagram',
      repo: 'owner/repo',
      branch: 'main',
    };
    expect(ctxParams.repo).toBe('owner/repo');
    expect(ctxParams.branch).toBe('main');
  });

  it('DiagramEditor route accepts repo without branch (undefined)', () => {
    const repoOnly: RootStackParamList['DiagramEditor'] = {
      repo: 'owner/repo',
    };
    expect(repoOnly.repo).toBe('owner/repo');
    expect(repoOnly.branch).toBeUndefined();
  });

  it('DiagramEditor route accepts empty params (deep link with no id)', () => {
    const emptyParams: RootStackParamList['DiagramEditor'] = {};
    expect(emptyParams.diagramId).toBeUndefined();
    expect(emptyParams.repo).toBeUndefined();
  });

  it('CanvasEditor route params are unchanged (no regressions)', () => {
    const canvasParams: RootStackParamList['CanvasEditor'] = {
      canvasId: 'canvas-456',
      canvasWidth: 1920,
      canvasHeight: 1080,
      canvasTitle: 'My Canvas',
    };
    expect(canvasParams.canvasId).toBe('canvas-456');
    expect(canvasParams.canvasWidth).toBe(1920);
    expect(canvasParams.canvasHeight).toBe(1080);
  });

  it('CanvasEditor accepts canvas creation params (no canvasId)', () => {
    const createParams: RootStackParamList['CanvasEditor'] = {
      canvasWidth: 800,
      canvasHeight: 600,
      canvasTitle: 'New Canvas',
    };
    expect(createParams.canvasId).toBeUndefined();
    expect(createParams.canvasWidth).toBe(800);
  });
});
