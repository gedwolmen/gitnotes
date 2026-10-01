import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve(__dirname, '../../../src/components/canvas/CanvasEditorContent.tsx');

describe('CanvasEditorContent live drawing', () => {
  it('derives the active stroke path from gesture-updated points', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('const activeStrokePathBuilder = useSharedValue');
    expect(source).toContain('const element = activeDrawingElement.value;');
    expect(source).toContain('const points = element.points;');
    expect(source).toContain('for (let i = 1; i < points.length; i++)');
  });

  it('keeps the active drawing until the release commit is rendered', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const endStart = source.indexOf('.onEnd(() => {');
    const finalizeStart = source.indexOf('.onFinalize(() => {', endStart);
    const commitStart = source.indexOf('const commitActiveDrawing =');
    const activeColorStart = source.indexOf('const activeStrokeColor =', commitStart);

    expect(endStart).toBeGreaterThan(-1);
    expect(finalizeStart).toBeGreaterThan(endStart);
    expect(commitStart).toBeGreaterThan(-1);
    expect(activeColorStart).toBeGreaterThan(commitStart);

    const endBlock = source.slice(endStart, finalizeStart);
    const commitBlock = source.slice(commitStart, activeColorStart);
    const finalizeBlock = source.slice(finalizeStart, source.indexOf('}),', finalizeStart));
    const commitCleanupEffectStart = source.indexOf('useEffect(() => {', source.indexOf('const imageCacheRef'));
    const commitCleanupEffectEnd = source.indexOf('}, [elements, activeDrawingElement, isCommittingDrawing]);', commitCleanupEffectStart);

    expect(endBlock).toContain('isCommittingDrawing.value = true;');
    expect(endBlock).not.toContain('activeDrawingElement.value = null;');
    expect(commitBlock).not.toContain('activeDrawingElement.value = null;');
    expect(finalizeBlock).toContain('!isCommittingDrawing.value');
    expect(commitCleanupEffectStart).toBeGreaterThan(-1);
    expect(commitCleanupEffectEnd).toBeGreaterThan(commitCleanupEffectStart);
    expect(source.slice(commitCleanupEffectStart, commitCleanupEffectEnd)).toContain('elements.some((element) => element.id === active.id)');
  });
});
